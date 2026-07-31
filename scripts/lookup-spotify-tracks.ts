import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type CatalogSong = {
  id: number;
  title: string;
  category?: string;
  bandName?: string;
  performedBandNames?: string[];
};

type CatalogSnapshot = {
  catalogSongs?: CatalogSong[];
};

type SpotifyCandidate = {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album?: { name?: string };
  external_urls?: { spotify?: string };
};

type SpotifySearchResponse = {
  tracks?: { items?: SpotifyCandidate[] };
};

type SpotifyTrackLink = {
  spotifyId: string;
  url: string;
  name: string;
  artists: string[];
  album: string | null;
  score: number;
  matchType: "exact" | "title-only";
};

type UnresolvedSong = {
  id: number;
  title: string;
  artists: string[];
  reason: string;
};

type SpotifyLookup = {
  version: 1;
  generatedAt: string;
  market: string;
  tracks: Record<string, SpotifyTrackLink>;
  unresolved: UnresolvedSong[];
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const catalogPath = resolve(repositoryRoot, "public/ranking-data/profile-details.json");
const outputPath = resolve(repositoryRoot, "public/ranking-data/spotify-tracks.json");
const defaultCredentialsPath = resolve(repositoryRoot, "../.env/spotify");
const market = "JP";
const refreshAll = process.argv.includes("--refresh");

function optionValue(name: string) {
  const optionIndex = process.argv.indexOf(name);
  return optionIndex >= 0 ? process.argv[optionIndex + 1] : undefined;
}

function parseEnv(contents: string) {
  const values = new Map<string, string>();
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
    if (!match) continue;
    const [, name, rawValue] = match;
    const quoted = rawValue.match(/^(["'])(.*)\1$/u);
    values.set(name, (quoted ? quoted[2] : rawValue).trim());
  }
  return values;
}

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function targetArtists(song: CatalogSong) {
  const names = song.category === "project-common"
    ? song.performedBandNames || []
    : [song.bandName, ...(song.performedBandNames || [])];
  return [...new Set(names.filter((name): name is string => Boolean(name?.trim())))];
}

function scoreCandidate(song: CatalogSong, candidate: SpotifyCandidate) {
  const normalizedTitle = normalize(song.title);
  const candidateTitle = normalize(candidate.name);
  const titleScore = candidateTitle === normalizedTitle ? 70 : candidateTitle.includes(normalizedTitle) || normalizedTitle.includes(candidateTitle) ? 40 : 0;
  const targets = targetArtists(song).map(normalize);
  const candidateArtists = candidate.artists.map((artist) => normalize(artist.name));
  const exactArtist = targets.some((target) => candidateArtists.includes(target));
  const partialArtist = targets.some((target) => candidateArtists.some((artist) => artist.includes(target) || target.includes(artist)));
  return {
    score: titleScore + (exactArtist ? 30 : partialArtist ? 15 : 0),
    matchType: exactArtist ? "exact" as const : "title-only" as const,
  };
}

function sleep(milliseconds: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function fetchSpotify<T>(url: string, accessToken: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 429 && attempt === 0) {
      const retrySeconds = Number(response.headers.get("retry-after") || 1);
      await sleep(Math.max(1, retrySeconds) * 1000);
      continue;
    }
    if (!response.ok) throw new Error(`Spotify search failed (HTTP ${response.status}).`);
    return response.json() as Promise<T>;
  }
  throw new Error("Spotify search was rate limited.");
}

async function getAccessToken(clientId: string, clientSecret: string) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error(`Spotify authentication failed (HTTP ${response.status}).`);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Spotify authentication returned no access token.");
  return payload.access_token;
}

async function findTrack(song: CatalogSong, accessToken: string) {
  const artists = targetArtists(song);
  const queryParts = [`track:"${song.title.replaceAll('"', " ")}"`];
  if (song.category !== "project-common" && artists[0]) queryParts.push(`artist:"${artists[0].replaceAll('"', " ")}"`);
  const searchUrl = new URL("https://api.spotify.com/v1/search");
  searchUrl.search = new URLSearchParams({ q: queryParts.join(" "), type: "track", limit: "10", market }).toString();
  const payload = await fetchSpotify<SpotifySearchResponse>(searchUrl.toString(), accessToken);
  const candidates = (payload.tracks?.items || [])
    .filter((candidate) => candidate.id && candidate.external_urls?.spotify)
    .map((candidate) => ({ candidate, ...scoreCandidate(song, candidate) }))
    .sort((left, right) => right.score - left.score || left.candidate.name.localeCompare(right.candidate.name));
  const best = candidates[0];
  if (!best || best.score < 70) return null;
  return {
    spotifyId: best.candidate.id,
    url: best.candidate.external_urls?.spotify || `https://open.spotify.com/track/${best.candidate.id}`,
    name: best.candidate.name,
    artists: best.candidate.artists.map((artist) => artist.name),
    album: best.candidate.album?.name || null,
    score: best.score,
    matchType: best.matchType,
  } satisfies SpotifyTrackLink;
}

async function loadExistingLookup(): Promise<Partial<SpotifyLookup> | null> {
  if (!existsSync(outputPath)) return null;
  return JSON.parse(await readFile(outputPath, "utf8")) as Partial<SpotifyLookup>;
}

async function main() {
  const credentialsPath = resolve(optionValue("--credentials") || defaultCredentialsPath);
  const credentials = parseEnv(await readFile(credentialsPath, "utf8"));
  const clientId = process.env.SPOTIFY_CLIENT_ID || process.env.CLIENT_ID || credentials.get("SPOTIFY_CLIENT_ID") || credentials.get("CLIENT_ID");
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || process.env.CLIENT_SECRET || credentials.get("SPOTIFY_CLIENT_SECRET") || credentials.get("CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Spotify credentials must define CLIENT_ID and CLIENT_SECRET.");

  const snapshot = JSON.parse(await readFile(catalogPath, "utf8")) as CatalogSnapshot;
  const catalogSongs = snapshot.catalogSongs || [];
  const songs = catalogSongs.filter((song) => song.category !== "cover");
  if (!songs.length) throw new Error("The ranking catalog contains no non-cover songs.");

  const accessToken = await getAccessToken(clientId, clientSecret);
  const existingLookup = await loadExistingLookup();
  const existingTracks = existingLookup?.tracks || {};
  const existingUnresolved = new Map((existingLookup?.unresolved || []).map((song) => [String(song.id), song]));
  const tracks: Record<string, SpotifyTrackLink> = {};
  const unresolved: UnresolvedSong[] = [];
  let reused = 0;
  let retainedUnresolved = 0;

  for (const [index, song] of songs.entries()) {
    const existing = existingTracks[String(song.id)];
    if (existing && !refreshAll) {
      tracks[String(song.id)] = existing;
      reused += 1;
      continue;
    }
    const unresolvedSong = existingUnresolved.get(String(song.id));
    if (unresolvedSong && !refreshAll) {
      unresolved.push(unresolvedSong);
      retainedUnresolved += 1;
      continue;
    }

    try {
      const match = await findTrack(song, accessToken);
      if (match) {
        tracks[String(song.id)] = match;
      } else {
        unresolved.push({ id: song.id, title: song.title, artists: targetArtists(song), reason: "No confident Spotify track result." });
      }
    } catch (error) {
      unresolved.push({
        id: song.id,
        title: song.title,
        artists: targetArtists(song),
        reason: error instanceof Error ? error.message : "Spotify lookup failed.",
      });
    }

    if ((index + 1) % 25 === 0 || index + 1 === songs.length) {
      console.log(`Processed ${index + 1}/${songs.length} songs.`);
    }
    await sleep(100);
  }

  const lookup: SpotifyLookup = {
    version: 1,
    generatedAt: new Date().toISOString(),
    market,
    tracks,
    unresolved,
  };
  await writeFile(outputPath, `${JSON.stringify(lookup, null, 2)}\n`, "utf8");
  console.log(`Spotify lookup complete: ${Object.keys(tracks).length} matched, ${unresolved.length} unresolved, ${reused} reused, ${retainedUnresolved} retained.`);
  console.log(`Skipped ${catalogSongs.length - songs.length} cover songs.`);
  console.log(`Static mapping: ${outputPath}`);
}

void main();
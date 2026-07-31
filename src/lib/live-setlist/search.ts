import "server-only";

import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { BAND_SEEDS } from "@/lib/constants/bands";
import { getDb } from "@/lib/db/core";
import { bandoriEventIndex, events, setlistEntries } from "@/lib/db/schema";
import { normalizeSongTitle } from "@/lib/music/title-utils";
import { scoreEventCandidateForExport } from "@/lib/setlist-export/scoring";
import { getSongCatalog } from "@/lib/stats/catalog-cache";
import type { LiveSetlist, LiveSetlistCandidate } from "./types";

function performanceKey(songId: number | null, rawTitle: string) {
  return songId
    ? `song:${songId}`
    : `title:${normalizeSongTitle(rawTitle)}`;
}

function titlePerformanceKey(rawTitle: string) {
  return `title:${normalizeSongTitle(rawTitle)}`;
}

const getSearchableLiveSetlistsCached = unstable_cache(
  async (): Promise<LiveSetlistCandidate[]> => {
    const db = getDb();
    return db
      .selectDistinct({
        eventernoteEventId: events.eventernoteEventId,
        title: events.title,
        eventDate: events.eventDate,
        venue: events.venue,
      })
      .from(events)
      .innerJoin(setlistEntries, eq(setlistEntries.eventId, events.id));
  },
  ["live-setlist-search"],
  {
    revalidate: 60 * 5,
    tags: ["song-events"],
  },
);

const getFirstPerformanceEventIdsCached = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const db = getDb();
    const rows = await db
      .select({
        eventernoteEventId: events.eventernoteEventId,
        rawTitle: setlistEntries.rawTitle,
        songId: setlistEntries.songId,
      })
      .from(setlistEntries)
      .innerJoin(events, eq(setlistEntries.eventId, events.id))
      .orderBy(
        asc(events.eventDate),
        asc(events.eventernoteEventId),
        asc(setlistEntries.orderIndex),
      );

    const firstEventIdByTitle: Record<string, number> = {};
    for (const row of rows) {
      const keys = [
        performanceKey(row.songId, row.rawTitle),
        titlePerformanceKey(row.rawTitle),
      ];
      for (const key of keys) {
        if (!(key in firstEventIdByTitle)) {
          firstEventIdByTitle[key] = row.eventernoteEventId;
        }
      }
    }

    return firstEventIdByTitle;
  },
  ["live-setlist-first-performances"],
  {
    revalidate: 60 * 5,
    tags: ["song-events"],
  },
);

export async function searchLiveSetlistCandidates(
  rawQuery: string,
  limit = 8,
): Promise<LiveSetlistCandidate[]> {
  const query = rawQuery.trim();
  if (query.length < 2) {
    return [];
  }

  const candidates = await getSearchableLiveSetlistsCached();

  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreEventCandidateForExport(
        { title: query },
        { title: candidate.title, eventDate: candidate.eventDate },
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.candidate.eventDate.localeCompare(left.candidate.eventDate) ||
        right.candidate.eventernoteEventId - left.candidate.eventernoteEventId,
    )
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

export async function getLiveSetlist(
  eventernoteEventId: number,
): Promise<LiveSetlist | null> {
  const db = getDb();
  const [rows, catalog, firstPerformanceEventIds, indexedEvents] = await Promise.all([
    db
      .select({
        eventernoteEventId: events.eventernoteEventId,
        title: events.title,
        eventDate: events.eventDate,
        venue: events.venue,
        position: setlistEntries.orderIndex,
        entryTitle: setlistEntries.rawTitle,
        songId: setlistEntries.songId,
      })
      .from(events)
      .innerJoin(setlistEntries, eq(setlistEntries.eventId, events.id))
      .where(eq(events.eventernoteEventId, eventernoteEventId))
      .orderBy(asc(setlistEntries.orderIndex)),
    getSongCatalog(),
    getFirstPerformanceEventIdsCached(),
    db
      .select({
        bandSlugs: bandoriEventIndex.bandSlugs,
        bandNames: bandoriEventIndex.bandNames,
      })
      .from(bandoriEventIndex)
      .where(eq(bandoriEventIndex.eventernoteEventId, eventernoteEventId))
      .limit(1),
  ]);

  const first = rows[0];
  if (!first) {
    return null;
  }

  const songById = new Map(
    catalog.songsWithLiveState.map((song) => [song.id, song]),
  );
  const songByTitle = new Map(
    catalog.songsWithLiveState.map((song) => [song.title, song]),
  );
  const songByNormalizedTitle = new Map<
    string,
    (typeof catalog.songsWithLiveState)[number] | null
  >();

  for (const song of catalog.songsWithLiveState) {
    const normalizedTitle = normalizeSongTitle(song.title);
    const existing = songByNormalizedTitle.get(normalizedTitle);
    if (existing === undefined) {
      songByNormalizedTitle.set(normalizedTitle, song);
    } else if (existing?.id !== song.id) {
      songByNormalizedTitle.set(normalizedTitle, null);
    }
  }

  const bandNameBySlug = new Map(
    BAND_SEEDS.map((band) => [band.slug, band.nameJa]),
  );
  const indexedEvent = indexedEvents[0];
  const performingBands = (indexedEvent?.bandSlugs ?? []).map(
    (slug, index) => ({
      slug,
      name:
        indexedEvent?.bandNames[index] ??
        bandNameBySlug.get(slug) ??
        slug,
    }),
  );

  return {
    eventernoteEventId: first.eventernoteEventId,
    title: first.title,
    eventDate: first.eventDate,
    venue: first.venue,
    performingBands,
    entries: rows.map((row) => {
      const normalizedTitle = normalizeSongTitle(row.entryTitle);
      const song =
        (row.songId ? songById.get(row.songId) : null) ??
        songByTitle.get(row.entryTitle) ??
        songByNormalizedTitle.get(normalizedTitle) ??
        null;
      const key = performanceKey(song?.id ?? null, row.entryTitle);
      const firstPerformanceEventId =
        firstPerformanceEventIds[key] ??
        firstPerformanceEventIds[titlePerformanceKey(row.entryTitle)];

      return {
        position: row.position,
        title: row.entryTitle,
        songId: song?.id ?? null,
        category: song?.category ?? null,
        bandSlug:
          song?.category === "original" ? song.bandSlug : null,
        firstReleaseDate: song?.firstReleaseDate ?? null,
        isFirstPerformance:
          firstPerformanceEventId === first.eventernoteEventId,
      };
    }),
  };
}

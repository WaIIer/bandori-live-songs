import { normalizeSongTitle } from "@/lib/music/title-utils";
import { scoreEventTitleMatch } from "@/lib/setlist-export/scoring";

function similarityScore(left: string, right: string) {
  return scoreEventTitleMatch(left, right) / 10_000;
}

export function findClosestSongTitle(
  rawTitle: string,
  candidateTitles: string[],
  minimumScore = 0.45,
) {
  const normalizedTarget = normalizeSongTitle(rawTitle);
  let bestMatch: { title: string; score: number } | null = null;

  for (const candidateTitle of candidateTitles) {
    const normalizedCandidate = normalizeSongTitle(candidateTitle);

    if (!normalizedCandidate) {
      continue;
    }

    const score = similarityScore(normalizedTarget, normalizedCandidate);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { title: candidateTitle, score };
    }
  }

  if (!bestMatch || bestMatch.score < minimumScore) {
    return null;
  }

  return bestMatch;
}

export function rankSongTitleCandidates(
  rawTitle: string,
  candidateTitles: string[],
  minimumScore = 0.45,
  limit = 5,
) {
  const normalizedTarget = normalizeSongTitle(rawTitle);

  return candidateTitles
    .map((title) => ({
      title,
      score: similarityScore(
        normalizedTarget,
        normalizeSongTitle(title),
      ),
    }))
    .filter((candidate) => candidate.score >= minimumScore)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.title.localeCompare(right.title, "ja"),
    )
    .slice(0, limit);
}

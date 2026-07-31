export const SONG_CATEGORIES = ["original", "cover", "project-common"] as const;

export type SongCategory = (typeof SONG_CATEGORIES)[number];

export function isSongCategory(value: string): value is SongCategory {
  return SONG_CATEGORIES.includes(value as SongCategory);
}

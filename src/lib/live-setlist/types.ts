import type { SongCategory } from "@/lib/music/song-category";

export type LiveSetlistCandidate = {
  eventernoteEventId: number;
  title: string;
  eventDate: string;
  venue: string | null;
};

export type LiveSetlistEntry = {
  position: number;
  title: string;
  songId: number | null;
  category: SongCategory | null;
  bandSlug: string | null;
  firstReleaseDate: string | null;
  isFirstPerformance: boolean;
};

export type LiveSetlistBand = {
  slug: string;
  name: string;
};

export type LiveSetlist = LiveSetlistCandidate & {
  performingBands: LiveSetlistBand[];
  entries: LiveSetlistEntry[];
};

export type LiveSetlistCandidatesResponse = {
  candidates: LiveSetlistCandidate[];
};

export type LiveSetlistResponse = {
  live: LiveSetlist;
};

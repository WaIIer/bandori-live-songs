import type { SongResolutionCandidate } from "@/lib/music/song-resolution";

export type ResolutionLine = {
  lineNumber: number;
  value: string;
  candidates: SongResolutionCandidate[];
};

export type SetlistImportActionState = {
  status: "idle" | "error" | "resolution-required" | "success";
  message?: string;
  eventernoteEventId?: number;
  eventTitle?: string;
  eventDate?: string;
  venue?: string | null;
  resolutionLines?: ResolutionLine[];
  submittedCount?: number;
  existingRecord?: boolean;
};

export function formatSetlistEntriesText(titles: string[]) {
  return titles.join("\n");
}

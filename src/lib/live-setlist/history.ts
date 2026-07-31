import type { LiveSetlist } from "./types";

export const LIVE_SEARCH_HISTORY_STORAGE_KEY =
  "bdr-live-search-history";

export type StoredLiveSearch = {
  query: string;
  live: LiveSetlist;
  needsRefresh?: boolean;
};

export function parseStoredLiveSearch(
  rawValue: string | null,
): StoredLiveSearch | null {
  if (!rawValue) {
    return null;
  }

  try {
    const value = JSON.parse(rawValue) as Partial<StoredLiveSearch>;
    if (
      typeof value.query !== "string" ||
      !value.live ||
      !Number.isSafeInteger(value.live.eventernoteEventId) ||
      typeof value.live.title !== "string" ||
      typeof value.live.eventDate !== "string" ||
      !Array.isArray(value.live.entries)
    ) {
      return null;
    }

    const hasPerformingBands = Array.isArray(
      value.live.performingBands,
    );
    return {
      query: value.query,
      live: {
        ...value.live,
        performingBands: hasPerformingBands
          ? value.live.performingBands
          : [],
      },
      needsRefresh: hasPerformingBands ? undefined : true,
    } as StoredLiveSearch;
  } catch {
    return null;
  }
}

export function readStoredLiveSearch() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return parseStoredLiveSearch(
      window.localStorage.getItem(
        LIVE_SEARCH_HISTORY_STORAGE_KEY,
      ),
    );
  } catch {
    return null;
  }
}

export function storeLiveSearch(live: LiveSetlist) {
  try {
    const record: StoredLiveSearch = {
      query: live.title,
      live,
    };
    window.localStorage.setItem(
      LIVE_SEARCH_HISTORY_STORAGE_KEY,
      JSON.stringify(record),
    );
  } catch {
    // Storage may be disabled or full.
  }
}

export function clearStoredLiveSearch() {
  try {
    window.localStorage.removeItem(
      LIVE_SEARCH_HISTORY_STORAGE_KEY,
    );
  } catch {
    // Storage may be disabled.
  }
}

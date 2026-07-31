export const liveEventIdParam = "eventId";
export const searchTabParam = "tab";
export const eventSearchTabValue = "event";

export function buildLiveSetlistHref(eventernoteEventId: number) {
  const params = new URLSearchParams({
    [liveEventIdParam]: String(eventernoteEventId),
  });

  return `/?${params.toString()}`;
}

export function buildEmptyEventSearchHref() {
  const params = new URLSearchParams({
    [searchTabParam]: eventSearchTabValue,
  });

  return `/?${params.toString()}`;
}

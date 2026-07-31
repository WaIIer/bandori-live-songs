export function buildSetlistImportHref(eventernoteEventId: number) {
  const params = new URLSearchParams({
    event: String(eventernoteEventId),
  });

  return `/admin/setlist-import?${params.toString()}`;
}

export function buildGoogleSetlistSearchHref(eventTitle: string) {
  const params = new URLSearchParams({
    q: `${eventTitle} セットリスト`,
  });

  return `https://www.google.com/search?${params.toString()}`;
}

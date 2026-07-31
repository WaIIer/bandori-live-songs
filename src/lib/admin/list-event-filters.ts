import type { ActorEventRankingEntry } from "@/lib/eventernote/actor-events";

export type AdminListSetlistStatus = "all" | "missing" | "partial" | "complete";

export function collectEventYears(events: ActorEventRankingEntry[]) {
  return [...new Set(events.map((event) => event.eventDate.slice(0, 4)))].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function toggleSelection(selected: string[], value: string) {
  return selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
}

/** Empty selection = no restriction on that dimension. Years AND bands when both non-empty. */
export function filterEventsByYearAndBand(
  events: ActorEventRankingEntry[],
  selectedYears: string[],
  selectedBandSlugs: string[],
) {
  return events.filter((event) => {
    if (selectedYears.length > 0 && !selectedYears.includes(event.eventDate.slice(0, 4))) {
      return false;
    }

    if (selectedBandSlugs.length > 0 && !event.bandSlugs.some((slug) => selectedBandSlugs.includes(slug))) {
      return false;
    }

    return true;
  });
}

export function filterEventsByFutureDate<T extends { eventDate: string }>(
  events: T[],
  hideFutureEvents: boolean,
  todayDate: string,
) {
  if (!hideFutureEvents) {
    return events;
  }

  return events.filter((event) => event.eventDate <= todayDate);
}

export function filterEventsBySearch(
  events: ActorEventRankingEntry[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return events;
  }

  return events.filter((event) =>
    [
      event.title,
      event.venue ?? "",
      event.eventDate,
      String(event.eventernoteEventId),
      ...event.bandNames,
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
  );
}

export function filterEventsBySetlistStatus(
  events: ActorEventRankingEntry[],
  statusByEventId: Record<number, "missing" | "partial" | "complete" | null>,
  selectedStatus: AdminListSetlistStatus,
) {
  if (selectedStatus === "all") {
    return events;
  }

  return events.filter((event) => {
    const status = statusByEventId[event.eventernoteEventId] ?? "missing";
    return status === selectedStatus;
  });
}

export function groupEventsByYear(events: ActorEventRankingEntry[]) {
  const groups = new Map<string, ActorEventRankingEntry[]>();

  for (const event of events) {
    const year = event.eventDate.slice(0, 4);
    const bucket = groups.get(year) ?? [];
    bucket.push(event);
    groups.set(year, bucket);
  }

  return [...groups.entries()]
    .sort(([leftYear], [rightYear]) => leftYear.localeCompare(rightYear))
    .map(([year, yearEvents]) => ({ year, events: yearEvents }));
}

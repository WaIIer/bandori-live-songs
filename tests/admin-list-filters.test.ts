import { describe, expect, it } from "vitest";
import {
  collectEventYears,
  filterEventsByFutureDate,
  filterEventsBySearch,
  filterEventsBySetlistStatus,
  filterEventsByYearAndBand,
  toggleSelection,
} from "@/lib/admin/list-event-filters";
import {
  defaultAdminListFilters,
  parsePersistedAdminListFilters,
  sanitizePersistedAdminListFilters,
  serializePersistedAdminListFilters,
} from "@/lib/admin/list-filters-state";
import type { ActorEventRankingEntry } from "@/lib/eventernote/actor-events";
import { formatSetlistEntriesText } from "@/app/admin/setlist-import/types";

function event(partial: Partial<ActorEventRankingEntry> & Pick<ActorEventRankingEntry, "eventernoteEventId" | "eventDate" | "bandSlugs">): ActorEventRankingEntry {
  return {
    title: `Event ${partial.eventernoteEventId}`,
    venue: null,
    attendeeCount: 1,
    sourceUrl: `https://www.eventernote.com/events/${partial.eventernoteEventId}`,
    bandNames: partial.bandSlugs,
    ...partial,
  };
}

const sample = [
  event({ eventernoteEventId: 1, eventDate: "2024-01-01", bandSlugs: ["poppin-party"] }),
  event({ eventernoteEventId: 2, eventDate: "2025-06-01", bandSlugs: ["roselia"] }),
  event({ eventernoteEventId: 3, eventDate: "2025-07-01", bandSlugs: ["poppin-party", "roselia"] }),
];

describe("list event filters", () => {
  it("collects sorted unique years", () => {
    expect(collectEventYears(sample)).toEqual(["2024", "2025"]);
  });

  it("treats empty selections as unrestricted", () => {
    expect(filterEventsByYearAndBand(sample, [], []).map((item) => item.eventernoteEventId)).toEqual([1, 2, 3]);
  });

  it("filters by year OR within the year dimension", () => {
    expect(filterEventsByYearAndBand(sample, ["2025"], []).map((item) => item.eventernoteEventId)).toEqual([2, 3]);
  });

  it("filters by band intersection and ANDs with years", () => {
    expect(
      filterEventsByYearAndBand(sample, ["2025"], ["poppin-party"]).map((item) => item.eventernoteEventId),
    ).toEqual([3]);
  });

  it("hides only events after the supplied current date", () => {
    expect(filterEventsByFutureDate(sample, true, "2025-06-01").map((item) => item.eventernoteEventId)).toEqual([1, 2]);
    expect(filterEventsByFutureDate(sample, false, "2025-06-01").map((item) => item.eventernoteEventId)).toEqual([1, 2, 3]);
  });

  it("toggles selection values", () => {
    expect(toggleSelection(["2024"], "2025")).toEqual(["2024", "2025"]);
    expect(toggleSelection(["2024", "2025"], "2024")).toEqual(["2025"]);
  });

  it("searches title, venue, date, id, and band name", () => {
    const searchable = [
      event({
        eventernoteEventId: 42,
        eventDate: "2025-08-01",
        bandSlugs: ["roselia"],
        bandNames: ["Roselia"],
        title: "Rosenchor",
        venue: "上海",
      }),
    ];

    expect(filterEventsBySearch(searchable, "rosen").length).toBe(1);
    expect(filterEventsBySearch(searchable, "上海").length).toBe(1);
    expect(filterEventsBySearch(searchable, "2025-08").length).toBe(1);
    expect(filterEventsBySearch(searchable, "42").length).toBe(1);
    expect(filterEventsBySearch(searchable, "roselia").length).toBe(1);
    expect(filterEventsBySearch(searchable, "mygo").length).toBe(0);
  });

  it("filters exact setlist statuses and treats unknown as missing", () => {
    const statuses = {
      1: "missing",
      2: "partial",
      3: "complete",
    } as const;

    expect(filterEventsBySetlistStatus(sample, statuses, "partial").map((item) => item.eventernoteEventId)).toEqual([2]);
    expect(filterEventsBySetlistStatus(sample, statuses, "complete").map((item) => item.eventernoteEventId)).toEqual([3]);
    expect(filterEventsBySetlistStatus(sample, { 2: "partial", 3: "complete" }, "missing").map((item) => item.eventernoteEventId)).toEqual([1]);
  });
});

describe("persisted admin list filters", () => {
  it("round-trips filter state and defaults the new future toggle to enabled", () => {
    const saved = {
      ...defaultAdminListFilters,
      selectedStatus: "partial" as const,
      selectedYears: ["2025"],
      selectedBandSlugs: ["roselia"],
      hideSonglessActivities: true,
      hideFutureEvents: false,
    };

    expect(parsePersistedAdminListFilters(serializePersistedAdminListFilters(saved))).toEqual(saved);
    expect(parsePersistedAdminListFilters(JSON.stringify({ selectedStatus: "complete" })).hideFutureEvents).toBe(true);
  });

  it("drops selections that are no longer available", () => {
    const filters = parsePersistedAdminListFilters(
      JSON.stringify({ selectedYears: ["2025", "2030"], selectedBandSlugs: ["roselia", "unknown"] }),
    );

    expect(sanitizePersistedAdminListFilters(filters, ["2025"], ["roselia"])).toMatchObject({
      selectedYears: ["2025"],
      selectedBandSlugs: ["roselia"],
    });
  });
});

describe("formatSetlistEntriesText", () => {
  it("joins titles as newline-separated setlist text", () => {
    expect(formatSetlistEntriesText(["A", "B"])).toBe("A\nB");
  });
});

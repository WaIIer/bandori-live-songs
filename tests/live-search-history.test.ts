import { describe, expect, it } from "vitest";
import { parseStoredLiveSearch } from "@/lib/live-setlist/history";
import {
  buildEmptyEventSearchHref,
  buildLiveSetlistHref,
} from "@/lib/live-setlist/url";

describe("live search history", () => {
  it("parses a completed live search", () => {
    const record = {
      query: "MyGO!!!!! 7th LIVE",
      live: {
        eventernoteEventId: 123,
        title: "MyGO!!!!! 7th LIVE",
        eventDate: "2024-12-22",
        venue: "日比谷公園大音楽堂",
        entries: [],
      },
    };

    expect(
      parseStoredLiveSearch(JSON.stringify(record)),
    ).toEqual({
      ...record,
      live: {
        ...record.live,
        performingBands: [],
      },
      needsRefresh: true,
    });
  });

  it("keeps current records without requesting a refresh", () => {
    const record = {
      query: "Poppin'Party×Roselia",
      live: {
        eventernoteEventId: 452934,
        title: "Poppin'Party×Roselia 合同ライブ",
        eventDate: "2026-05-03",
        venue: "有明アリーナ",
        performingBands: [
          { slug: "poppin-party", name: "Poppin'Party" },
          { slug: "roselia", name: "Roselia" },
        ],
        entries: [],
      },
    };

    expect(parseStoredLiveSearch(JSON.stringify(record))).toEqual({
      ...record,
      needsRefresh: undefined,
    });
  });

  it("ignores malformed or incomplete records", () => {
    expect(parseStoredLiveSearch("{")).toBeNull();
    expect(
      parseStoredLiveSearch(
        JSON.stringify({ query: "Live", live: {} }),
      ),
    ).toBeNull();
  });

  it("builds a shareable page URL from the Eventernote ID", () => {
    expect(buildLiveSetlistHref(123)).toBe("/?eventId=123");
  });

  it("builds a persistent empty event-search URL", () => {
    expect(buildEmptyEventSearchHref()).toBe("/?tab=event");
  });
});

import { describe, expect, it } from "vitest";
import { aggregateUserSongStats } from "@/lib/stats/aggregate";

const songs = [
  {
    id: 1,
    bandSlug: "poppin-party",
    bandNameJa: "Poppin'Party",
    bandDisplayOrder: 1,
    bandGroupType: "band" as const,
    category: "original" as const,
    title: "ティアドロップス",
    firstReleaseDate: "2016-02-24",
    hasBeenPlayedLive: true,
  },
  {
    id: 2,
    bandSlug: "poppin-party",
    bandNameJa: "Poppin'Party",
    bandDisplayOrder: 1,
    bandGroupType: "band" as const,
    category: "original" as const,
    title: "STAR BEAT!~ホシノコドウ~",
    firstReleaseDate: "2017-08-30",
    hasBeenPlayedLive: false,
  },
  {
    id: 3,
    bandSlug: null,
    bandNameJa: null,
    bandDisplayOrder: null,
    bandGroupType: null,
    category: "project-common" as const,
    title: "Yes! BanG_Dream!",
    firstReleaseDate: "2023-05-24",
    hasBeenPlayedLive: true,
  },
  {
    id: 4,
    bandSlug: "afterglow",
    bandNameJa: "Afterglow",
    bandDisplayOrder: 2,
    bandGroupType: "band" as const,
    category: "original" as const,
    title: "That Is How I Roll!",
    firstReleaseDate: "2017-06-21",
    hasBeenPlayedLive: true,
  },
  {
    id: 5,
    bandSlug: "mygo",
    bandNameJa: "MyGO!!!!!",
    bandDisplayOrder: 8,
    bandGroupType: "band" as const,
    category: "original" as const,
    title: "迷星叫",
    firstReleaseDate: "2023-04-12",
    hasBeenPlayedLive: true,
  },
  {
    id: 6,
    bandSlug: null,
    bandNameJa: null,
    bandDisplayOrder: null,
    bandGroupType: null,
    category: "cover" as const,
    title: "Alchemy",
    firstReleaseDate: null,
    hasBeenPlayedLive: true,
  },
];

const matchedEvents = [
  {
    eventId: 10,
    eventernoteEventId: 100001,
    title: "Test Event",
    eventDate: "2026-02-28",
    venue: "Kアリーナ横浜",
    matchedBandSlugs: ["poppin-party"],
    matchedBandNames: ["Poppin'Party"],
    setlistStatus: "complete" as const,
    sourceUrl: "https://www.eventernote.com/events/100001",
    heardSongIds: [1, 3, 4, 5, 6],
  },
  {
    eventId: 11,
    eventernoteEventId: 100002,
    title: "Partial Event",
    eventDate: "2026-03-01",
    venue: "Kアリーナ横浜",
    matchedBandSlugs: ["poppin-party"],
    matchedBandNames: ["Poppin'Party"],
    setlistStatus: "partial" as const,
    sourceUrl: "https://www.eventernote.com/events/100002",
    heardSongIds: [],
  },
  {
    eventId: null,
    eventernoteEventId: 100003,
    title: "Missing Event",
    eventDate: "2026-03-02",
    venue: "Kアリーナ横浜",
    matchedBandSlugs: ["poppin-party"],
    matchedBandNames: ["Poppin'Party"],
    setlistStatus: null,
    sourceUrl: "https://www.eventernote.com/events/100003",
    heardSongIds: [],
  },
];

describe("aggregateUserSongStats", () => {
  it("uses only played-live songs in the denominator when hideUnplayed is enabled", () => {
    const aggregated = aggregateUserSongStats({
      songs,
      matchedEvents,
      hideUnplayed: true,
      hideVirtualBands: false,
      hideSonglessActivities: false,
    });

    expect(aggregated.totalSummary).toEqual({
      heardCount: 3,
      totalCount: 3,
      percentage: 1,
    });

    const poppinParty = aggregated.bandSummaries.find((summary) => summary.slug === "poppin-party");
    expect(poppinParty?.heardCount).toBe(1);
    expect(poppinParty?.totalCount).toBe(1);
    expect(aggregated.bandSummaries.some((summary) => summary.slug === "afterglow")).toBe(true);
    expect(aggregated.bandSummaries.some((summary) => summary.slug === "mygo")).toBe(true);
    expect(aggregated.bandSummaries.some((summary) => summary.slug === "project-common")).toBe(false);
  });

  it("restores full song counts when hideUnplayed is disabled", () => {
    const aggregated = aggregateUserSongStats({
      songs,
      matchedEvents,
      hideUnplayed: false,
      hideVirtualBands: false,
      hideSonglessActivities: false,
    });

    expect(aggregated.totalSummary).toEqual({
      heardCount: 3,
      totalCount: 4,
      percentage: 3 / 4,
    });

    const poppinParty = aggregated.bandSummaries.find((summary) => summary.slug === "poppin-party");
    expect(poppinParty?.totalCount).toBe(2);
    expect(poppinParty?.songs.map((song) => song.heard)).toEqual([true, false]);
  });

  it("keeps progress original-only while unlocking project-common songs but not covers", () => {
    const aggregated = aggregateUserSongStats({
      songs,
      matchedEvents,
      hideUnplayed: false,
      hideVirtualBands: false,
      hideSonglessActivities: false,
    });

    expect(aggregated.totalSummary).toEqual({
      heardCount: 3,
      totalCount: 4,
      percentage: 3 / 4,
    });
    expect(
      Object.values(aggregated.newlyHeardSongsByEventId)
        .flat()
        .map((song) => song.id),
    ).toContain(3);
    expect(
      Object.values(aggregated.newlyHeardSongsByEventId)
        .flat()
        .map((song) => song.id),
    ).not.toContain(6);
  });

  it("treats partial setlists as collected and keeps missing setlists separate", () => {
    const aggregated = aggregateUserSongStats({
      songs,
      matchedEvents,
      hideUnplayed: true,
      hideVirtualBands: false,
      hideSonglessActivities: false,
    });

    expect(aggregated.matchedEvents).toHaveLength(3);
    expect(aggregated.collectedSetlistEvents).toHaveLength(2);
    expect(aggregated.missingSetlistEvents).toHaveLength(1);
  });

  it("hides virtual bands from band summaries and total counts by default option", () => {
    const aggregated = aggregateUserSongStats({
      songs,
      matchedEvents,
      hideUnplayed: true,
      hideVirtualBands: true,
      hideSonglessActivities: false,
    });

    expect(aggregated.totalSummary).toEqual({
      heardCount: 2,
      totalCount: 2,
      percentage: 1,
    });
    expect(aggregated.bandSummaries.map((summary) => summary.slug)).toEqual(["poppin-party", "mygo"]);
  });

  it("assigns first-heard songs to the earliest matching event in chronological order", () => {
    const aggregated = aggregateUserSongStats({
      songs,
      matchedEvents: [
        {
          eventId: 11,
          eventernoteEventId: 100002,
          title: "Later Event",
          eventDate: "2026-03-01",
          venue: "Kアリーナ横浜",
          matchedBandSlugs: ["poppin-party"],
          matchedBandNames: ["Poppin'Party"],
          setlistStatus: "complete",
          sourceUrl: "https://www.eventernote.com/events/100002",
          heardSongIds: [1, 4, 5],
        },
        {
          eventId: 10,
          eventernoteEventId: 100001,
          title: "Earlier Event",
          eventDate: "2026-02-28",
          venue: "Kアリーナ横浜",
          matchedBandSlugs: ["poppin-party"],
          matchedBandNames: ["Poppin'Party"],
          setlistStatus: "complete",
          sourceUrl: "https://www.eventernote.com/events/100001",
          heardSongIds: [1, 4],
        },
      ],
      hideUnplayed: true,
      hideVirtualBands: false,
      hideSonglessActivities: false,
    });

    expect(aggregated.newlyHeardSongsByEventId[100001]?.map((song) => song.id)).toEqual([1, 4]);
    expect(aggregated.newlyHeardSongsByEventId[100002]?.map((song) => song.id)).toEqual([5]);
  });

  it("keeps virtual band unlock songs visible even when virtual bands are hidden from summaries", () => {
    const aggregated = aggregateUserSongStats({
      songs,
      matchedEvents,
      hideUnplayed: true,
      hideVirtualBands: true,
      hideSonglessActivities: false,
    });

    expect(aggregated.bandSummaries.map((summary) => summary.slug)).toEqual(["poppin-party", "mygo"]);
    expect(aggregated.newlyHeardSongsByEventId[100001]?.map((song) => song.id)).toEqual([1, 3, 4, 5]);
  });

  it("keeps first-unlock songs in setlist order and only records repeated songs once", () => {
    const aggregated = aggregateUserSongStats({
      songs,
      matchedEvents: [
        {
          ...matchedEvents[0],
          heardSongIds: [4, 3, 4, 6, 1, 3],
        },
      ],
      hideUnplayed: true,
      hideVirtualBands: false,
      hideSonglessActivities: false,
    });

    expect(aggregated.newlyHeardSongsByEventId[100001]?.map((song) => song.id)).toEqual([4, 3, 1]);
  });

  it("excludes unreleased songs from totals and first-heard unlocks", () => {
    const aggregated = aggregateUserSongStats({
      songs: [
        songs[0],
        {
          id: 99,
          bandSlug: "poppin-party",
          bandNameJa: "Poppin'Party",
          bandDisplayOrder: 1,
          bandGroupType: "band",
          category: "original",
          title: "Future Place",
          firstReleaseDate: "2099-01-01",
          hasBeenPlayedLive: true,
        },
      ],
      matchedEvents: [
        {
          eventId: 99,
          eventernoteEventId: 499999,
          title: "Future Song Event",
          eventDate: "2026-06-11",
          venue: "Kアリーナ横浜",
          matchedBandSlugs: ["poppin-party"],
          matchedBandNames: ["Poppin'Party"],
          setlistStatus: "complete",
          sourceUrl: "https://www.eventernote.com/events/499999",
          heardSongIds: [1, 99],
        },
      ],
      hideUnplayed: true,
      hideVirtualBands: false,
      hideSonglessActivities: false,
      releasedThroughDate: "2026-06-11",
    });

    expect(aggregated.totalSummary).toEqual({
      heardCount: 1,
      totalCount: 1,
      percentage: 1,
    });
    expect(aggregated.bandSummaries[0]?.songs.map((song) => song.id)).toEqual([1]);
    expect(aggregated.newlyHeardSongsByEventId[499999]?.map((song) => song.id)).toEqual([1]);
  });
});

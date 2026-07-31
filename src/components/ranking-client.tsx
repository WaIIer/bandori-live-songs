"use client";

import Link from "next/link";
import {
  BarChart3Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  Loader2Icon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { navPillLabel } from "@/components/nav-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import { BAND_SEEDS, getBandSupportColor } from "@/lib/constants/bands";

type RankingRow = {
  user: string;
  listened: number;
  total: number;
  percentage: number;
  hits: number;
  status: string;
};

type RankingBand = {
  slug: string;
  name: string;
  listened: number;
  total: number;
};

type RankingSong = {
  id: number;
  title: string;
  category?: "original" | "cover" | "project-common";
  bandSlug?: string;
  bandName?: string;
  performedBandSlugs?: string[];
  performedBandNames?: string[];
  firstReleaseDate?: string;
};

type RankingEvent = {
  eventernoteEventId?: number;
  title: string;
  eventDate?: string;
  venue?: string;
  sourceUrl?: string;
  setlistStatus?: string;
  heardSongIds?: number[];
  performingBandSlugs?: string[];
  performingBandNames?: string[];
};

type RankingProfile = {
  user: string;
  displayName?: string | null;
  heardSongIds?: number[];
  matchedEventIds?: number[];
  bands?: RankingBand[];
};

type RankingSnapshot = {
  coverage?: {
    indexedEvents?: number;
    uniqueUsers?: number;
    completionSongs?: number;
    liveCatalogSongs?: number;
    liveCoverSongs?: number;
  };
  songs?: RankingSong[];
  catalogSongs?: RankingSong[];
  profiles?: Record<string, RankingProfile>;
  events?: Record<string, RankingEvent>;
};

type AttendanceSnapshot = {
  events?: Record<string, string[]>;
};

type CompletionPool = "no-cover" | "cover" | "all";
type ActiveView = "rankings" | "events" | "catalog";
type CatalogCategory = "all" | "original" | "cover";
type CatalogSort = "title" | "first" | "last" | "performances";

type Completion = {
  listened: number;
  total: number;
  percentage: number;
};

type ProgressSegment = {
  id: string;
  label: string;
  width: number;
  color: string;
};

type EventWithAttendance = RankingEvent & {
  id: number;
  attendeeCount: number;
};

type SongPerformance = {
  playCount: number;
  firstPlayed: string | null;
  lastPlayed: string | null;
};

const pageSize = 25;
const compactNumber = new Intl.NumberFormat();
const bandNames = new Map(BAND_SEEDS.map((band) => [band.slug, band.nameEn]));
const bandOrder = new Map(BAND_SEEDS.map((band) => [band.slug, band.displayOrder]));
const emptySongs: RankingSong[] = [];

function parseRankingRows(csv: string): RankingRow[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .flatMap((line) => {
      const [user, listened, total, percentage, hits, status] = line.split(",");
      const parsed = {
        user: user?.trim() ?? "",
        listened: Number(listened),
        total: Number(total),
        percentage: Number(percentage),
        hits: Number(hits),
        status: status?.trim() ?? "",
      };
      return parsed.user && Number.isFinite(parsed.percentage) ? [parsed] : [];
    });
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function dateLabel(value: string | null | undefined) {
  return value || "-";
}

function songBandEntries(song: RankingSong) {
  if (song.bandSlug) {
    return [{ slug: song.bandSlug, name: song.bandName || bandNames.get(song.bandSlug) || song.bandSlug }];
  }

  return (song.performedBandSlugs || []).map((slug, index) => ({
    slug,
    name: song.performedBandNames?.[index] || bandNames.get(slug) || slug,
  }));
}

function songBandLabel(song: RankingSong | undefined) {
  if (!song) return "Unknown performer";
  return songBandEntries(song)
    .map((band) => band.name)
    .join(" / ") || "Unknown performer";
}

function poolLabel(pool: CompletionPool) {
  if (pool === "cover") return "Covers";
  if (pool === "all") return "All songs";
  return "No covers";
}

export function RankingClient() {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [snapshot, setSnapshot] = useState<RankingSnapshot | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSnapshot | null>(null);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>("rankings");
  const [pool, setPool] = useState<CompletionPool>("no-cover");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState("");
  const [eventQuery, setEventQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState<CatalogCategory>("all");
  const [catalogBand, setCatalogBand] = useState("");
  const [catalogSort, setCatalogSort] = useState<CatalogSort>("last");
  const [catalogPage, setCatalogPage] = useState(1);

  useEffect(() => {
    let active = true;

    async function loadSnapshot() {
      try {
        const csvResponse = await fetch("/ranking-data/all-bandori-results.csv");
        if (!csvResponse.ok) throw new Error("The listener ranking snapshot could not be loaded.");
        const csv = await csvResponse.text();
        if (active) setRows(parseRankingRows(csv));

        const [detailResponse, attendanceResponse] = await Promise.all([
          fetch("/ranking-data/profile-details.json"),
          fetch("/ranking-data/event-attendance.json"),
        ]);
        if (!detailResponse.ok || !attendanceResponse.ok) {
          throw new Error("The detailed listener snapshot could not be loaded.");
        }
        const [detail, eventAttendance] = await Promise.all([
          detailResponse.json() as Promise<RankingSnapshot>,
          attendanceResponse.json() as Promise<AttendanceSnapshot>,
        ]);
        if (active) {
          setSnapshot(detail);
          setAttendance(eventAttendance);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "The ranking snapshot could not be loaded.");
        }
      }
    }

    void loadSnapshot();
    return () => {
      active = false;
    };
  }, []);

  const catalogSongs = snapshot?.catalogSongs ?? snapshot?.songs ?? emptySongs;
  const coverSongs = useMemo(
    () => catalogSongs.filter((song) => song.category === "cover"),
    [catalogSongs],
  );
  const songById = useMemo(
    () => new Map(catalogSongs.map((song) => [Number(song.id), song])),
    [catalogSongs],
  );
  const coverSongIds = useMemo(
    () => new Set(coverSongs.map((song) => Number(song.id))),
    [coverSongs],
  );

  const coverIdsByUser = useMemo(() => {
    const values = new Map<string, Set<number>>();
    if (!snapshot?.profiles || !snapshot.events) return values;

    Object.entries(snapshot.profiles).forEach(([user, profile]) => {
      const heard = new Set<number>();
      (profile.matchedEventIds || []).forEach((eventId) => {
        (snapshot.events?.[String(eventId)]?.heardSongIds || []).forEach((songId) => {
          if (coverSongIds.has(Number(songId))) heard.add(Number(songId));
        });
      });
      values.set(user, heard);
    });

    return values;
  }, [coverSongIds, snapshot]);

  function completionFor(row: RankingRow): Completion {
    const coverCount = coverIdsByUser.get(row.user)?.size || 0;
    const coverTotal = coverSongs.length;

    if (pool === "cover") {
      return {
        listened: coverCount,
        total: coverTotal,
        percentage: coverTotal ? (coverCount / coverTotal) * 100 : 0,
      };
    }

    if (pool === "all") {
      const listened = row.listened + coverCount;
      const total = row.total + coverTotal;
      return { listened, total, percentage: total ? (listened / total) * 100 : 0 };
    }

    return { listened: row.listened, total: row.total, percentage: row.percentage };
  }

  function completionSegments(row: RankingRow, completion: Completion): ProgressSegment[] {
    const profile = snapshot?.profiles?.[row.user];
    if (!profile || !completion.total) {
      return [{ id: "completion", label: "Completion", width: completion.percentage, color: "var(--accent)" }];
    }

    const originalSegments = (profile.bands || [])
      .filter((band) => band.listened > 0)
      .sort((left, right) => (bandOrder.get(left.slug) || 99) - (bandOrder.get(right.slug) || 99))
      .map((band) => ({
        id: `original-${band.slug}`,
        label: `${band.name} ${band.listened}/${band.total}`,
        width: (band.listened / completion.total) * 100,
        color: getBandSupportColor(band.slug) || "var(--accent)",
      }));

    const coverCounts = new Map<string, { name: string; count: number }>();
    (coverIdsByUser.get(row.user) || new Set<number>()).forEach((songId) => {
      const performer = songBandEntries(songById.get(songId) || { id: songId, title: `Song ${songId}` })[0];
      const slug = performer?.slug || "cover-performance";
      const current = coverCounts.get(slug) || { name: performer?.name || "Cover performance", count: 0 };
      current.count += 1;
      coverCounts.set(slug, current);
    });
    const coverSegments = [...coverCounts.entries()]
      .sort(([leftSlug], [rightSlug]) => (bandOrder.get(leftSlug) || 99) - (bandOrder.get(rightSlug) || 99))
      .map(([slug, value]) => ({
        id: `cover-${slug}`,
        label: `${value.name} covers ${value.count}/${coverSongs.length}`,
        width: (value.count / completion.total) * 100,
        color: getBandSupportColor(slug) || "var(--accent)",
      }));

    if (pool === "cover") return coverSegments;
    if (pool === "all") return [...originalSegments, ...coverSegments];
    return originalSegments;
  }

  const rankedRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const completionForRanking = (row: RankingRow): Completion => {
      const coverCount = coverIdsByUser.get(row.user)?.size || 0;
      const coverTotal = coverSongs.length;

      if (pool === "cover") {
        return {
          listened: coverCount,
          total: coverTotal,
          percentage: coverTotal ? (coverCount / coverTotal) * 100 : 0,
        };
      }

      if (pool === "all") {
        const listened = row.listened + coverCount;
        const total = row.total + coverTotal;
        return { listened, total, percentage: total ? (listened / total) * 100 : 0 };
      }

      return { listened: row.listened, total: row.total, percentage: row.percentage };
    };

    return rows
      .filter((row) => row.status === "ok" && row.user.toLowerCase().includes(normalizedQuery))
      .map((row) => ({ row, completion: completionForRanking(row) }))
      .sort(
        (left, right) =>
          right.row.hits - left.row.hits ||
          right.completion.percentage - left.completion.percentage ||
          left.row.user.localeCompare(right.row.user),
      );
  }, [coverIdsByUser, coverSongs.length, pool, query, rows]);

  const pageCount = Math.max(1, Math.ceil(rankedRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = rankedRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const averageCompletion = rankedRows.length
    ? rankedRows.reduce((total, item) => total + item.completion.percentage, 0) / rankedRows.length
    : 0;

  const indexedEvents = useMemo<EventWithAttendance[]>(() => {
    if (!snapshot?.events) return [];
    return Object.entries(snapshot.events)
      .map(([eventId, event]) => {
        const id = Number(event.eventernoteEventId || eventId);
        return {
          ...event,
          id,
          attendeeCount: attendance?.events?.[String(id)]?.length || 0,
        };
      })
      .sort((left, right) => right.attendeeCount - left.attendeeCount || (right.eventDate || "").localeCompare(left.eventDate || ""));
  }, [attendance, snapshot]);

  const matchingEvents = indexedEvents.filter((event) => {
    const search = eventQuery.trim().toLowerCase();
    return !search || `${event.title} ${event.venue || ""} ${(event.performingBandNames || []).join(" ")}`.toLowerCase().includes(search);
  });

  const performanceBySong = useMemo(() => {
    const values = new Map<number, SongPerformance>();
    Object.values(snapshot?.events || {}).forEach((event) => {
      new Set(event.heardSongIds || []).forEach((songId) => {
        const current = values.get(Number(songId)) || { playCount: 0, firstPlayed: null, lastPlayed: null };
        current.playCount += 1;
        const date = event.eventDate || null;
        if (date && (!current.firstPlayed || date < current.firstPlayed)) current.firstPlayed = date;
        if (date && (!current.lastPlayed || date > current.lastPlayed)) current.lastPlayed = date;
        values.set(Number(songId), current);
      });
    });
    return values;
  }, [snapshot]);

  const catalogBandOptions = useMemo(() => {
    const bands = new Map<string, string>();
    catalogSongs.forEach((song) => songBandEntries(song).forEach((band) => bands.set(band.slug, band.name)));
    return [...bands.entries()]
      .map(([slug, name]) => ({ slug, name }))
      .sort((left, right) => (bandOrder.get(left.slug) || 99) - (bandOrder.get(right.slug) || 99) || left.name.localeCompare(right.name));
  }, [catalogSongs]);

  const filteredSongs = useMemo(() => {
    const search = catalogQuery.trim().toLowerCase();
    return catalogSongs
      .filter((song) => {
        const categoryMatches = catalogCategory === "all" || song.category === catalogCategory;
        const bandMatches = !catalogBand || songBandEntries(song).some((band) => band.slug === catalogBand);
        const searchMatches = !search || `${song.title} ${songBandLabel(song)}`.toLowerCase().includes(search);
        return categoryMatches && bandMatches && searchMatches;
      })
      .sort((left, right) => {
        const leftStats = performanceBySong.get(Number(left.id)) || { playCount: 0, firstPlayed: null, lastPlayed: null };
        const rightStats = performanceBySong.get(Number(right.id)) || { playCount: 0, firstPlayed: null, lastPlayed: null };
        if (catalogSort === "performances") return rightStats.playCount - leftStats.playCount || left.title.localeCompare(right.title);
        if (catalogSort === "first") return (leftStats.firstPlayed || "9999").localeCompare(rightStats.firstPlayed || "9999") || left.title.localeCompare(right.title);
        if (catalogSort === "last") return (rightStats.lastPlayed || "").localeCompare(leftStats.lastPlayed || "") || left.title.localeCompare(right.title);
        return left.title.localeCompare(right.title);
      });
  }, [catalogBand, catalogCategory, catalogQuery, catalogSort, catalogSongs, performanceBySong]);

  const catalogPageCount = Math.max(1, Math.ceil(filteredSongs.length / pageSize));
  const safeCatalogPage = Math.min(catalogPage, catalogPageCount);
  const visibleSongs = filteredSongs.slice((safeCatalogPage - 1) * pageSize, safeCatalogPage * pageSize);

  const selectedProfile = selectedUser ? snapshot?.profiles?.[selectedUser] : undefined;
  const selectedRow = selectedUser ? rows.find((row) => row.user === selectedUser) : undefined;
  const selectedCompletion = selectedRow ? completionFor(selectedRow) : undefined;
  const selectedCoverIds = selectedUser ? coverIdsByUser.get(selectedUser) || new Set<number>() : new Set<number>();
  const selectedProfileEvents = (selectedProfile?.matchedEventIds || [])
    .map((eventId) => ({ id: Number(eventId), event: snapshot?.events?.[String(eventId)] }))
    .filter((item): item is { id: number; event: RankingEvent } => Boolean(item.event))
    .sort((left, right) => (right.event.eventDate || "").localeCompare(left.event.eventDate || ""));
  const expandedEvent = selectedEvent ? snapshot?.events?.[String(selectedEvent)] : undefined;

  const isLoadingRows = !rows.length && !error;
  const isLoadingDetails = !snapshot && !error;
  const controlClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium transition ${
      active ? "bg-foreground text-background" : "text-ink-soft hover:bg-panel-strong hover:text-foreground"
    }`;

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-border-soft bg-background/85 backdrop-blur-xl">
        <div className="@container/nav-bar mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/"
              className="min-w-0 truncate font-heading text-lg font-semibold tracking-[-0.04em] hover:text-accent"
            >
              BanG Dream! Songs
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link href="/ranking" className={navPillLabel} aria-current="page">
              Rankings
            </Link>
            <ThemeToggle labels={{ ariaLabel: "Color theme", light: "Light", system: "System", dark: "Dark" }} />
          </div>
        </div>
      </nav>

      <main className="mx-auto flex min-w-0 w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
        <section className="rounded-[1.15rem] border border-border-soft bg-panel px-5 py-6 shadow-soft sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-strong">
                <BarChart3Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink-soft">Eventernote community snapshot</p>
                <h1 className="mt-1 font-heading text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                  Listener Rankings
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-soft">
                  Attendance and setlist coverage from {compactNumber.format(snapshot?.coverage?.indexedEvents || 397)} indexed BanG Dream! events.
                </p>
              </div>
            </div>
            <div className="flex rounded-full border border-border-soft bg-panel-strong p-1" role="tablist" aria-label="Ranking views">
              {([
                ["rankings", "Rankings"],
                ["events", "Events"],
                ["catalog", "Catalog"],
              ] as const).map(([view, label]) => (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={activeView === view}
                  className={controlClass(activeView === view)}
                  disabled={view !== "rankings" && !snapshot}
                  onClick={() => setActiveView(view)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Listeners", compactNumber.format(rows.length || snapshot?.coverage?.uniqueUsers || 0)],
              ["Indexed events", compactNumber.format(snapshot?.coverage?.indexedEvents || 397)],
              ["Live catalog", compactNumber.format(catalogSongs.length || snapshot?.coverage?.liveCatalogSongs || 424)],
              ["Average completion", rankedRows.length ? percent(averageCompletion) : "-"],
            ].map(([label, value]) => (
              <div key={label} className="border-t border-border-soft pt-3 sm:border-l sm:border-t-0 sm:pl-4">
                <p className="text-sm text-ink-soft">{label}</p>
                <p className="mt-1 font-heading text-2xl font-semibold leading-none">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {error ? (
          <section className="rounded-[1.15rem] border border-accent/35 bg-panel px-5 py-6 text-sm leading-6 text-ink-soft sm:px-6">
            {error}
          </section>
        ) : null}

        {activeView === "rankings" ? (
          <>
            <section className="rounded-[1.15rem] border border-border-soft bg-panel px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="font-heading text-2xl font-semibold tracking-[-0.04em]">Listener leaderboard</h2>
                  <p className="mt-1 text-sm leading-6 text-ink-soft">
                    Ranked by indexed event attendance, then by {poolLabel(pool).toLowerCase()} completion.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex rounded-full border border-border-soft bg-panel-strong p-1" aria-label="Song pool">
                    {([
                      ["no-cover", "No covers"],
                      ["cover", "Covers"],
                      ["all", "All songs"],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={controlClass(pool === value)}
                        aria-pressed={pool === value}
                        disabled={value !== "no-cover" && !snapshot}
                        onClick={() => {
                          setPool(value);
                          setPage(1);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="relative block">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
                    <input
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setPage(1);
                      }}
                      placeholder="Find listener"
                      className="h-10 w-full rounded-full border border-border-soft bg-panel-strong py-2 pr-4 pl-9 text-sm outline-none placeholder:text-ink-soft focus:border-accent sm:w-52"
                    />
                  </label>
                </div>
              </div>

              {isLoadingRows ? (
                <div className="flex items-center gap-2 py-12 text-sm text-ink-soft">
                  <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading listener rankings
                </div>
              ) : (
                <>
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <thead className="border-y border-border-soft text-xs uppercase tracking-[0.08em] text-ink-soft">
                        <tr>
                          <th className="py-3 pr-3 font-medium">Rank</th>
                          <th className="py-3 pr-4 font-medium">Listener</th>
                          <th className="py-3 pr-4 font-medium">Events</th>
                          <th className="py-3 pr-4 font-medium">Completion</th>
                          <th className="py-3 font-medium">Songs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map(({ row, completion }, index) => {
                          const segments = completionSegments(row, completion);
                          return (
                            <tr key={row.user} className="border-b border-border-soft/80 last:border-b-0">
                              <td className="py-3 pr-3 font-heading font-semibold">{(safePage - 1) * pageSize + index + 1}</td>
                              <td className="py-3 pr-4">
                                <button
                                  type="button"
                                  className="font-medium text-foreground hover:text-accent"
                                  onClick={() => setSelectedUser(row.user)}
                                >
                                  {row.user}
                                </button>
                                <a
                                  href={`https://www.eventernote.com/bd/user/${encodeURIComponent(row.user)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="ml-1 inline-flex text-ink-soft hover:text-accent"
                                  aria-label={`Open ${row.user} on Eventernote`}
                                >
                                  <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                </a>
                              </td>
                              <td className="py-3 pr-4 font-heading font-semibold">{compactNumber.format(row.hits)}</td>
                              <td className="py-3 pr-4">
                                <div className="flex min-w-[190px] items-center gap-3">
                                  <span className="w-12 shrink-0 font-heading font-semibold">{percent(completion.percentage)}</span>
                                  <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-border-soft" title={`${completion.listened}/${completion.total}`}>
                                    {segments.map((segment) => (
                                      <span
                                        key={segment.id}
                                        className="h-full shrink-0"
                                        style={{ width: `${segment.width}%`, backgroundColor: segment.color }}
                                        title={segment.label}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 font-heading font-semibold">
                                {compactNumber.format(completion.listened)} <span className="font-normal text-ink-soft">/ {compactNumber.format(completion.total)}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!visibleRows.length ? <p className="py-10 text-center text-sm text-ink-soft">No listeners match this search.</p> : null}
                  <div className="mt-5 flex items-center justify-between gap-4 border-t border-border-soft pt-4">
                    <p className="text-sm text-ink-soft">{compactNumber.format(rankedRows.length)} listeners</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-ink-soft hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={safePage === 1}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                        aria-label="Previous ranking page"
                        title="Previous page"
                      >
                        <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <span className="min-w-16 text-center text-sm text-ink-soft">{safePage} / {pageCount}</span>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-ink-soft hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={safePage === pageCount}
                        onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                        aria-label="Next ranking page"
                        title="Next page"
                      >
                        <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>

            {selectedProfile && selectedRow && selectedCompletion ? (
              <section className="rounded-[1.15rem] border border-border-soft bg-panel px-5 py-5 sm:px-6" id="listener-profile">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-ink-soft">Listener profile</p>
                    <h2 className="mt-1 font-heading text-2xl font-semibold tracking-[-0.04em]">{selectedUser}</h2>
                    <p className="mt-1 text-sm text-ink-soft">{compactNumber.format(selectedProfileEvents.length)} matched events</p>
                  </div>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-ink-soft hover:border-accent hover:text-accent"
                    onClick={() => setSelectedUser("")}
                    aria-label="Close listener profile"
                    title="Close profile"
                  >
                    <XIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div className="flex items-end justify-between gap-4">
                      <p className="text-sm text-ink-soft">{poolLabel(pool)} completion</p>
                      <p className="font-heading text-3xl font-semibold">{percent(selectedCompletion.percentage)}</p>
                    </div>
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-border-soft">
                      {completionSegments(selectedRow, selectedCompletion).map((segment) => (
                        <span key={segment.id} className="h-full shrink-0" style={{ width: `${segment.width}%`, backgroundColor: segment.color }} title={segment.label} />
                      ))}
                    </div>
                    <p className="text-sm text-ink-soft">{compactNumber.format(selectedCompletion.listened)} / {compactNumber.format(selectedCompletion.total)} songs</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(selectedProfile.bands || []).map((band) => (
                        <div key={band.slug} className="border-t border-border-soft pt-2">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate font-medium">{band.name}</span>
                            <span className="shrink-0 text-ink-soft">{band.listened}/{band.total}</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-soft">
                            <div className="h-full rounded-full" style={{ width: `${band.total ? (band.listened / band.total) * 100 : 0}%`, backgroundColor: getBandSupportColor(band.slug) || "var(--accent)" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm text-ink-soft">Covers</p>
                        <h3 className="mt-1 font-heading text-xl font-semibold">{selectedCoverIds.size} / {coverSongs.length}</h3>
                      </div>
                      <p className="text-sm text-ink-soft">Textual song record</p>
                    </div>
                    <ul className="mt-3 max-h-[25rem] divide-y divide-border-soft overflow-y-auto border-y border-border-soft">
                      {coverSongs
                        .slice()
                        .sort((left, right) => Number(selectedCoverIds.has(Number(right.id))) - Number(selectedCoverIds.has(Number(left.id))) || left.title.localeCompare(right.title))
                        .map((song) => {
                          const performance = performanceBySong.get(Number(song.id)) || { playCount: 0, firstPlayed: null, lastPlayed: null };
                          const heard = selectedCoverIds.has(Number(song.id));
                          return (
                            <li key={song.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                              <span className="min-w-0">
                                <span className="font-medium">{song.title}</span>
                                <span className="mt-0.5 block text-xs leading-5 text-ink-soft">
                                  {songBandLabel(song)} · {performance.playCount} performances · {dateLabel(performance.firstPlayed)} - {dateLabel(performance.lastPlayed)}
                                </span>
                              </span>
                              <span className={heard ? "shrink-0 text-xs font-medium text-[var(--accent-strong)]" : "shrink-0 text-xs text-ink-soft"}>{heard ? "heard" : "not heard"}</span>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                </div>

                <div className="mt-6 border-t border-border-soft pt-4">
                  <p className="text-sm text-ink-soft">Matched events</p>
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    {selectedProfileEvents.map(({ id, event }) => (
                      <div key={id} className="flex items-start justify-between gap-3 border-b border-border-soft pb-2 text-sm">
                        <span className="min-w-0">
                          <span className="block font-medium">{event.title}</span>
                          <span className="block truncate text-xs leading-5 text-ink-soft">{dateLabel(event.eventDate)} · {event.venue || "Venue unavailable"}</span>
                        </span>
                        <span className="shrink-0 text-xs text-ink-soft">{(event.heardSongIds || []).length} songs</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : isLoadingDetails && rows.length ? (
              <div className="flex items-center gap-2 text-sm text-ink-soft">
                <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading full listener, setlist, and cover detail
              </div>
            ) : null}
          </>
        ) : null}

        {activeView === "events" && snapshot ? (
          <section className="rounded-[1.15rem] border border-border-soft bg-panel px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-[-0.04em]">Indexed events</h2>
                <p className="mt-1 text-sm leading-6 text-ink-soft">Attendance totals use the cached Eventernote attendee snapshot.</p>
              </div>
              <label className="relative block">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
                <input
                  value={eventQuery}
                  onChange={(event) => setEventQuery(event.target.value)}
                  placeholder="Find event, venue, or band"
                  className="h-10 w-full rounded-full border border-border-soft bg-panel-strong py-2 pr-4 pl-9 text-sm outline-none placeholder:text-ink-soft focus:border-accent lg:w-72"
                />
              </label>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="border-y border-border-soft text-xs uppercase tracking-[0.08em] text-ink-soft">
                  <tr>
                    <th className="py-3 pr-4 font-medium">Event</th>
                    <th className="py-3 pr-4 font-medium">Date</th>
                    <th className="py-3 pr-4 font-medium">Bands</th>
                    <th className="py-3 pr-4 font-medium">Attendees</th>
                    <th className="py-3 font-medium">Setlist</th>
                  </tr>
                </thead>
                <tbody>
                  {matchingEvents.map((event) => (
                    <tr key={event.id} className="border-b border-border-soft/80">
                      <td className="py-3 pr-4">
                        <button type="button" className="font-medium hover:text-accent" onClick={() => setSelectedEvent(event.id)}>{event.title}</button>
                        <span className="mt-0.5 block text-xs text-ink-soft">{event.venue || "Venue unavailable"}</span>
                      </td>
                      <td className="py-3 pr-4 text-ink-soft">{dateLabel(event.eventDate)}</td>
                      <td className="py-3 pr-4 text-ink-soft">{(event.performingBandNames || []).join(" / ") || "-"}</td>
                      <td className="py-3 pr-4 font-heading font-semibold">{compactNumber.format(event.attendeeCount)}</td>
                      <td className="py-3 text-ink-soft">{(event.heardSongIds || []).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!matchingEvents.length ? <p className="py-10 text-center text-sm text-ink-soft">No indexed events match this search.</p> : null}

            {expandedEvent ? (
              <div className="mt-6 border-t border-border-soft pt-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-ink-soft">Event setlist</p>
                    <h3 className="mt-1 font-heading text-xl font-semibold">{expandedEvent.title}</h3>
                  </div>
                  <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-ink-soft hover:border-accent hover:text-accent" onClick={() => setSelectedEvent(null)} aria-label="Close event setlist" title="Close setlist">
                    <XIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <ol className="mt-4 grid gap-2 lg:grid-cols-2">
                  {(expandedEvent.heardSongIds || []).map((songId, index) => {
                    const song = songById.get(Number(songId));
                    return (
                      <li key={`${songId}-${index}`} className="flex gap-3 border-b border-border-soft pb-2 text-sm">
                        <span className="font-heading text-ink-soft">{index + 1}</span>
                        <span>
                          <span className="font-medium">{song?.title || `Song ${songId}`}</span>
                          <span className="block text-xs leading-5 text-ink-soft">{songBandLabel(song)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeView === "catalog" && snapshot ? (
          <section className="rounded-[1.15rem] border border-border-soft bg-panel px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-[-0.04em]">Live catalog</h2>
                <p className="mt-1 text-sm leading-6 text-ink-soft">Originals and covers performed in the indexed event snapshot.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:items-center">
                <label className="relative block sm:col-span-2 xl:w-56">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
                  <input value={catalogQuery} onChange={(event) => {
                    setCatalogQuery(event.target.value);
                    setCatalogPage(1);
                  }} placeholder="Find song or performer" className="h-10 w-full rounded-full border border-border-soft bg-panel-strong py-2 pr-4 pl-9 text-sm outline-none placeholder:text-ink-soft focus:border-accent" />
                </label>
                <select value={catalogCategory} onChange={(event) => {
                  setCatalogCategory(event.target.value as CatalogCategory);
                  setCatalogPage(1);
                }} className="h-10 rounded-full border border-border-soft bg-panel-strong px-3 text-sm outline-none focus:border-accent">
                  <option value="all">All songs</option>
                  <option value="original">Originals</option>
                  <option value="cover">Covers</option>
                </select>
                <select value={catalogBand} onChange={(event) => {
                  setCatalogBand(event.target.value);
                  setCatalogPage(1);
                }} className="h-10 rounded-full border border-border-soft bg-panel-strong px-3 text-sm outline-none focus:border-accent">
                  <option value="">All bands</option>
                  {catalogBandOptions.map((band) => <option key={band.slug} value={band.slug}>{band.name}</option>)}
                </select>
                <select value={catalogSort} onChange={(event) => {
                  setCatalogSort(event.target.value as CatalogSort);
                  setCatalogPage(1);
                }} className="h-10 rounded-full border border-border-soft bg-panel-strong px-3 text-sm outline-none focus:border-accent">
                  <option value="last">Last performed</option>
                  <option value="first">First performed</option>
                  <option value="performances">Performance count</option>
                  <option value="title">Title</option>
                </select>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                <thead className="border-y border-border-soft text-xs uppercase tracking-[0.08em] text-ink-soft">
                  <tr>
                    <th className="py-3 pr-4 font-medium">Song</th>
                    <th className="py-3 pr-4 font-medium">Category</th>
                    <th className="py-3 pr-4 font-medium">Performances</th>
                    <th className="py-3 pr-4 font-medium">First played</th>
                    <th className="py-3 font-medium">Last played</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSongs.map((song) => {
                    const performance = performanceBySong.get(Number(song.id)) || { playCount: 0, firstPlayed: null, lastPlayed: null };
                    return (
                      <tr key={song.id} className="border-b border-border-soft/80">
                        <td className="py-3 pr-4">
                          <span className="block font-medium">{song.title}</span>
                          <span className="mt-0.5 block text-xs text-ink-soft">{songBandLabel(song)}</span>
                        </td>
                        <td className="py-3 pr-4 text-ink-soft">{song.category === "cover" ? "Cover" : song.category === "original" ? "Original" : "Project common"}</td>
                        <td className="py-3 pr-4 font-heading font-semibold">{performance.playCount}</td>
                        <td className="py-3 pr-4 text-ink-soft">{dateLabel(performance.firstPlayed)}</td>
                        <td className="py-3 text-ink-soft">{dateLabel(performance.lastPlayed)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!visibleSongs.length ? <p className="py-10 text-center text-sm text-ink-soft">No catalog songs match these filters.</p> : null}
            <div className="mt-5 flex items-center justify-between gap-4 border-t border-border-soft pt-4">
              <p className="text-sm text-ink-soft">{compactNumber.format(filteredSongs.length)} songs</p>
              <div className="flex items-center gap-2">
                <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-ink-soft hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40" disabled={safeCatalogPage === 1} onClick={() => setCatalogPage((current) => Math.max(1, current - 1))} aria-label="Previous catalog page" title="Previous page">
                  <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="min-w-16 text-center text-sm text-ink-soft">{safeCatalogPage} / {catalogPageCount}</span>
                <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-ink-soft hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40" disabled={safeCatalogPage === catalogPageCount} onClick={() => setCatalogPage((current) => Math.min(catalogPageCount, current + 1))} aria-label="Next catalog page" title="Next page">
                  <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isLoadingRows ? (
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />
            Preparing the ranking snapshot
          </div>
        ) : null}
      </main>
    </>
  );
}

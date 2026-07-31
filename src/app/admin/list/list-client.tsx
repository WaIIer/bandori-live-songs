"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { AdminEventTable, type AdminEventSetlistStatus } from "@/components/admin-event-table";
import {
  collectEventYears,
  filterEventsByFutureDate,
  filterEventsBySearch,
  filterEventsBySetlistStatus,
  filterEventsByYearAndBand,
  type AdminListSetlistStatus,
  toggleSelection,
} from "@/lib/admin/list-event-filters";
import {
  adminListFiltersCookieName,
  adminListFiltersMaxAgeSeconds,
  adminListFiltersStorageKey,
  parsePersistedAdminListFilters,
  sanitizePersistedAdminListFilters,
  serializePersistedAdminListFilters,
  type PersistedAdminListFilters,
} from "@/lib/admin/list-filters-state";
import type { ActorEventRankingEntry } from "@/lib/eventernote/actor-events";
import { filterEventsByVisibilityRules, type EventVisibilityRules } from "@/lib/events/event-visibility";

type BandFilter = {
  slug: string;
  nameJa: string;
};

type AdminListClientProps = {
  generatedAtLabel: string;
  events: ActorEventRankingEntry[];
  bands: BandFilter[];
  statusByEventId: Record<number, AdminEventSetlistStatus>;
  setlistUpdatedAtByEventId: Record<number, string | null>;
  eventVisibilityRules: EventVisibilityRules;
  initialFilters: PersistedAdminListFilters;
  todayDate: string;
};

function filterChipClass(active: boolean) {
  return `rounded-full border px-4 py-2 text-sm transition ${
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border-soft bg-panel-strong text-ink-soft hover:text-foreground"
  }`;
}

const persistedAdminListFiltersChangedEvent = "admin-list-filters-changed";

function subscribeToAdminListFilters(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(persistedAdminListFiltersChangedEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(persistedAdminListFiltersChangedEvent, onStoreChange);
  };
}

function readStoredAdminListFilters(defaultSerialized: string) {
  try {
    const stored = window.localStorage.getItem(adminListFiltersStorageKey);
    if (stored) {
      return stored;
    }
  } catch {
    // Storage may be disabled by the browser.
  }

  return defaultSerialized;
}

function writeStoredAdminListFilters(filters: PersistedAdminListFilters) {
  const serialized = serializePersistedAdminListFilters(filters);

  try {
    window.localStorage.setItem(adminListFiltersStorageKey, serialized);
  } catch {
    // Storage may be disabled by the browser.
  }

  document.cookie = `${adminListFiltersCookieName}=${encodeURIComponent(serialized)}; path=/; max-age=${adminListFiltersMaxAgeSeconds}; samesite=lax`;
  window.dispatchEvent(new Event(persistedAdminListFiltersChangedEvent));
}

export function AdminListClient({
  generatedAtLabel,
  events,
  bands,
  statusByEventId,
  setlistUpdatedAtByEventId,
  eventVisibilityRules,
  initialFilters,
  todayDate,
}: AdminListClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const years = useMemo(() => collectEventYears(events), [events]);
  const availableBandSlugs = useMemo(() => bands.map((band) => band.slug), [bands]);
  const defaultFilters = useMemo(
    () => sanitizePersistedAdminListFilters(initialFilters, years, availableBandSlugs),
    [availableBandSlugs, initialFilters, years],
  );
  const defaultFiltersSerialized = useMemo(
    () => serializePersistedAdminListFilters(defaultFilters),
    [defaultFilters],
  );
  const storedFiltersSerialized = useSyncExternalStore(
    subscribeToAdminListFilters,
    () => readStoredAdminListFilters(defaultFiltersSerialized),
    () => defaultFiltersSerialized,
  );
  const persistedFilters = useMemo(
    () =>
      sanitizePersistedAdminListFilters(
        parsePersistedAdminListFilters(storedFiltersSerialized),
        years,
        availableBandSlugs,
      ),
    [availableBandSlugs, storedFiltersSerialized, years],
  );
  const {
    selectedStatus,
    selectedYears,
    selectedBandSlugs,
    hideSonglessActivities,
    hideFutureEvents,
  } = persistedFilters;

  function updatePersistedFilters(patch: Partial<PersistedAdminListFilters>) {
    writeStoredAdminListFilters({
      ...persistedFilters,
      ...patch,
    });
  }

  const filteredByTabs = useMemo(
    () => filterEventsByYearAndBand(events, selectedYears, selectedBandSlugs),
    [events, selectedBandSlugs, selectedYears],
  );

  const filteredByDate = useMemo(
    () => filterEventsByFutureDate(filteredByTabs, hideFutureEvents, todayDate),
    [filteredByTabs, hideFutureEvents, todayDate],
  );

  const searchableEvents = useMemo(
    () =>
      filterEventsBySearch(filterEventsByVisibilityRules(filteredByDate, hideSonglessActivities, eventVisibilityRules), searchQuery),
    [
      eventVisibilityRules,
      filteredByDate,
      hideSonglessActivities,
      searchQuery,
    ],
  );

  const visibleEvents = useMemo(
    () =>
      filterEventsBySetlistStatus(
        searchableEvents,
        statusByEventId,
        selectedStatus,
      ),
    [
      searchableEvents,
      selectedStatus,
      statusByEventId,
    ],
  );

  const statusCounts = useMemo(() => {
    const counts = { missing: 0, partial: 0, complete: 0 };
    for (const event of searchableEvents) {
      const status = statusByEventId[event.eventernoteEventId] ?? "missing";
      counts[status] += 1;
    }
    return counts;
  }, [searchableEvents, statusByEventId]);

  const statusFilters: Array<{ value: AdminListSetlistStatus; label: string; count: number }> = [
    { value: "all", label: "全部", count: searchableEvents.length },
    { value: "missing", label: "未收录", count: statusCounts.missing },
    { value: "partial", label: "部分", count: statusCounts.partial },
    { value: "complete", label: "完整", count: statusCounts.complete },
  ];

  return (
    <>
      <section className="rounded-[1.75rem] border border-border-soft bg-panel px-5 py-6 sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-sm text-ink-soft">List</p>
            <h1 className="font-heading text-3xl font-semibold tracking-[-0.04em]">活动列表</h1>
            <p className="max-w-3xl text-sm leading-6 text-ink-soft">
              数据来自乐队 Eventernote actor 活动页写入的 bandori_event_index。可搜索并按状态、年份和乐队筛选，再从每行快捷进入本站编辑器。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.1rem] border border-border-soft bg-panel-strong px-4 py-3">
              <p className="text-xs text-ink-soft">当前范围</p>
              <p className="mt-1 whitespace-nowrap text-sm font-medium">
                {visibleEvents.length}/{events.length} 场
              </p>
            </div>
            <div className="rounded-[1.1rem] border border-border-soft bg-panel-strong px-4 py-3">
              <p className="text-xs text-ink-soft">抓取时间</p>
              <p className="mt-1 whitespace-nowrap text-sm font-medium">{generatedAtLabel}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 overflow-hidden rounded-[1.75rem] border border-border-soft bg-panel">
        <div className="space-y-4 border-b border-border-soft px-5 py-4 sm:px-6">
          <div className="space-y-1">
            <p className="text-sm text-ink-soft">筛选范围</p>
            <p className="text-sm text-ink-soft">
              默认不选表示全部。年份与乐队可复选；同维度为并集，两维度同时选择时取交集。列表按年份分组、组内日期升序。
            </p>
          </div>

          <div className="space-y-3">
            <label className="block max-w-xl">
              <span className="mb-2 block text-xs text-ink-soft">快速搜索</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="活动、场馆、日期、Event ID 或乐队"
                className="min-h-11 w-full rounded-xl border border-border-soft bg-panel-strong px-4 text-sm text-foreground outline-none placeholder:text-ink-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-soft">歌单状态</span>
              {statusFilters.map((status) => (
                <button
                  key={status.value}
                  type="button"
                  onClick={() => updatePersistedFilters({ selectedStatus: status.value })}
                  className={filterChipClass(selectedStatus === status.value)}
                >
                  {status.label} {status.count}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-soft">年份</span>
              <button
                type="button"
                onClick={() => updatePersistedFilters({ selectedYears: [] })}
                className={filterChipClass(selectedYears.length === 0)}
              >
                全部
              </button>
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() =>
                    updatePersistedFilters({
                      selectedYears: toggleSelection(selectedYears, year),
                    })
                  }
                  className={filterChipClass(selectedYears.includes(year))}
                >
                  {year}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-soft">乐队</span>
              <button
                type="button"
                onClick={() => updatePersistedFilters({ selectedBandSlugs: [] })}
                className={filterChipClass(selectedBandSlugs.length === 0)}
              >
                全部
              </button>
              {bands.map((band) => (
                <button
                  key={band.slug}
                  type="button"
                  onClick={() =>
                    updatePersistedFilters({
                      selectedBandSlugs: toggleSelection(selectedBandSlugs, band.slug),
                    })
                  }
                  className={filterChipClass(selectedBandSlugs.includes(band.slug))}
                >
                  {band.nameJa}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-border-soft bg-panel-strong px-4 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={hideFutureEvents}
                  onChange={(event) => updatePersistedFilters({ hideFutureEvents: event.target.checked })}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                隐藏未来活动
              </label>
              <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-border-soft bg-panel-strong px-4 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={hideSonglessActivities}
                  onChange={(event) => updatePersistedFilters({ hideSonglessActivities: event.target.checked })}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                隐藏无歌曲活动
              </label>
            </div>
          </div>
        </div>

        <AdminEventTable
          events={visibleEvents}
          statusByEventId={statusByEventId}
          setlistUpdatedAtByEventId={setlistUpdatedAtByEventId}
          variant="timeline"
        />
      </section>
    </>
  );
}

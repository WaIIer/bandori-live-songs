"use client";

import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Activity, useEffect, useState, type MouseEvent } from "react";
import { LiveSetlistResult } from "@/components/live-setlist-result";
import { LiveSetlistSearch } from "@/components/live-setlist-search";
import { LocaleToggle } from "@/components/locale-toggle";
import { navPillLabel } from "@/components/nav-pill";
import { PublicFooter } from "@/components/public-footer";
import { RefreshWhileWarming } from "@/components/refresh-while-warming";
import { ResultsClient } from "@/components/results-client";
import { SearchForm } from "@/components/search-form";
import { SongsStatsNavLink } from "@/components/songs-stats-nav-link";
import { ThemeToggle } from "@/components/theme-toggle";
import type { EventVisibilityRules } from "@/lib/events/event-visibility";
import {
  clearStoredSuccessfulUserId,
  isValidEventernoteUserId,
  LAST_SUCCESSFUL_USER_ID_STORAGE_KEY,
  normalizeEventernoteUserCacheKey,
  normalizeEventernoteUserId,
  readStoredSuccessfulUserId,
} from "@/lib/eventernote/user-id";
import { getCopy, type Locale } from "@/lib/i18n";
import type { CopyDefinition } from "@/lib/i18n";
import {
  readStoredLiveSearch,
} from "@/lib/live-setlist/history";
import type { LiveSetlist } from "@/lib/live-setlist/types";
import {
  buildEmptyEventSearchHref,
  buildLiveSetlistHref,
} from "@/lib/live-setlist/url";
import { navigateToDemoHome } from "@/lib/navigate-demo-home";
import { clearAwaitFreshAfterCookie } from "@/lib/manual-refresh-navigation";
import type { UserSongStatsResult } from "@/lib/stats/get-user-song-stats";

type HomePageClientProps = {
  locale: Locale;
  defaultUserId: string;
  demoUserId: string;
  invalidUserId: boolean;
  result: UserSongStatsResult | null;
  defaultHideUnplayed: boolean;
  defaultHideVirtualBands: boolean;
  defaultHideSonglessActivities: boolean;
  isAdminAuthenticated: boolean;
  eventVisibilityRules: EventVisibilityRules;
  defaultLive: LiveSetlist | null;
  defaultSearchMode: SearchMode;
};

const refreshParamNames = ["refresh", "awaitFreshAfter"];
type SearchMode = "user" | "live";

type UserStatsOkResult = Extract<UserSongStatsResult, { state: "ok" }>;

// Session-level cache of successfully loaded user stats. The in-memory
// map is mirrored to sessionStorage so it also survives full page loads
// (e.g. following an event link) within the same browser tab, letting
// already loaded user pages render instantly on return while the server
// navigation revalidates.
const userStatsStorageKey = "bdr-user-stats-cache-v1";
const userStatsOkCache = new Map<string, UserStatsOkResult>();
const userStatsCacheLimit = 5;
let userStatsCacheHydrated = false;

function isCachedUserStats(value: unknown): value is UserStatsOkResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<UserStatsOkResult>;
  return (
    candidate.state === "ok" &&
    typeof candidate.userId === "string" &&
    Array.isArray(candidate.songs) &&
    Array.isArray(candidate.matchedEvents)
  );
}

function hydrateUserStatsCache() {
  if (userStatsCacheHydrated || typeof window === "undefined") {
    return;
  }
  userStatsCacheHydrated = true;
  try {
    const raw = window.sessionStorage.getItem(userStatsStorageKey);
    if (!raw) {
      return;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return;
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (isCachedUserStats(value)) {
        userStatsOkCache.set(key, value);
      }
    }
  } catch {
    // Storage may be disabled or contain invalid data.
  }
}

function writeUserStatsCache(result: UserStatsOkResult) {
  const key = normalizeEventernoteUserCacheKey(result.userId);
  userStatsOkCache.delete(key);
  userStatsOkCache.set(key, result);
  while (userStatsOkCache.size > userStatsCacheLimit) {
    const oldestKey = userStatsOkCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    userStatsOkCache.delete(oldestKey);
  }
  try {
    window.sessionStorage.setItem(
      userStatsStorageKey,
      JSON.stringify(Object.fromEntries(userStatsOkCache)),
    );
  } catch {
    // Storage may be disabled by the browser.
  }
}

function readUserStatsCache(userId: string) {
  hydrateUserStatsCache();
  return userStatsOkCache.get(normalizeEventernoteUserCacheKey(userId)) ?? null;
}

function loadDefaultUserStats(signal?: AbortSignal) {
  return fetch("/api/default-user-stats", { signal }).then(
    (res) => res.json() as Promise<UserSongStatsResult>,
  );
}

function getWarmingMessage(copy: CopyDefinition, result: UserSongStatsResult | null) {
  if (result?.state !== "warming") {
    return copy.warmingDescription;
  }

  return result.reason === "initializing" ? copy.warmingCacheInit : copy.warmingCacheRefresh;
}

function WarmingTitle({ copy }: { copy: CopyDefinition }) {
  return (
    <h2 className="mt-2 inline-flex items-center gap-2 font-heading text-2xl font-semibold tracking-[-0.04em]">
      <span>{copy.warmingTitle}</span>
      <Loader2Icon className="h-5 w-5 animate-spin text-foreground" aria-hidden="true" />
    </h2>
  );
}

export function HomePageClient({
  locale,
  defaultUserId,
  demoUserId,
  invalidUserId,
  result,
  defaultHideUnplayed,
  defaultHideVirtualBands,
  defaultHideSonglessActivities,
  isAdminAuthenticated,
  eventVisibilityRules,
  defaultLive,
  defaultSearchMode,
}: HomePageClientProps) {
  const router = useRouter();
  const trimmedUserId = defaultUserId.trim();
  const [activeLocale, setActiveLocale] = useState(locale);
  const localeCopy = getCopy(activeLocale);
  const hasDemoUser = demoUserId.length > 0;
  const shouldLoadDefaultUser = hasDemoUser && !trimmedUserId && !result;
  const [isRestoringStoredUser] = useState(
    () =>
      defaultSearchMode === "user" &&
      shouldLoadDefaultUser &&
      isValidEventernoteUserId(readStoredSuccessfulUserId()),
  );
  const [defaultUserResult, setDefaultUserResult] = useState<UserSongStatsResult | null>(null);
  const [defaultUserLoading, setDefaultUserLoading] = useState(shouldLoadDefaultUser);
  // Client-side search mode state lets the tab switch render instantly;
  // the server navigation commits later and re-syncs the props below.
  const [searchMode, setSearchMode] = useState(defaultSearchMode);
  const [pendingUserTarget, setPendingUserTarget] = useState<string | null>(null);
  const [selectedLive, setSelectedLive] =
    useState<LiveSetlist | null>(defaultLive);

  // Adjust client state when the committed server props change
  // (render-time sync, see react.dev/learn/you-might-not-need-an-effect).
  const propsSyncKey = `${defaultSearchMode}:${defaultUserId}:${defaultLive?.eventernoteEventId ?? ""}`;
  const [lastPropsSyncKey, setLastPropsSyncKey] = useState(propsSyncKey);
  if (lastPropsSyncKey !== propsSyncKey) {
    setLastPropsSyncKey(propsSyncKey);
    setSearchMode(defaultSearchMode);
    setPendingUserTarget(null);
    setSelectedLive(defaultLive);
  }

  function handleSearchModeChange(mode: SearchMode) {
    if (mode === searchMode) {
      return;
    }

    setSearchMode(mode);

    if (mode === "live") {
      setPendingUserTarget(null);
      const storedLive =
        selectedLive ?? readStoredLiveSearch()?.live ?? null;
      setSelectedLive(storedLive);
      router.push(
        storedLive
          ? buildLiveSetlistHref(storedLive.eventernoteEventId)
          : buildEmptyEventSearchHref(),
        { scroll: false },
      );
      return;
    }

    const storedUserId =
      trimmedUserId || readStoredSuccessfulUserId();
    const normalizedStoredUserId = normalizeEventernoteUserId(storedUserId);
    const hasValidStoredUser = isValidEventernoteUserId(normalizedStoredUserId);
    setPendingUserTarget(hasValidStoredUser ? normalizedStoredUserId : null);
    router.push(
      hasValidStoredUser
        ? `/?userId=${encodeURIComponent(normalizedStoredUserId)}`
        : "/",
      { scroll: false },
    );
  }

  function resetToDemoHome(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    navigateToDemoHome();
  }

  useEffect(() => {
    if (!shouldLoadDefaultUser) {
      return;
    }

    const controller = new AbortController();
    const storedUserId = readStoredSuccessfulUserId();

    if (isValidEventernoteUserId(storedUserId)) {
      if (defaultSearchMode === "user") {
        router.replace(
          `/?userId=${encodeURIComponent(storedUserId)}`,
          { scroll: false },
        );
        return () => controller.abort();
      }
    } else {
      clearStoredSuccessfulUserId();
    }

    const cachedDefaultUserResult = readUserStatsCache(demoUserId);
    if (cachedDefaultUserResult) {
      // The demo user stats were already loaded in this tab session;
      // show them instantly instead of refetching on every remount.
      const frame = window.requestAnimationFrame(() => {
        setDefaultUserResult(cachedDefaultUserResult);
        setDefaultUserLoading(false);
      });
      return () => {
        controller.abort();
        window.cancelAnimationFrame(frame);
      };
    }

    loadDefaultUserStats(controller.signal)
      .then((data) => setDefaultUserResult(data))
      .catch(() => {})
      .finally(() => setDefaultUserLoading(false));

    return () => controller.abort();
  }, [defaultSearchMode, demoUserId, router, shouldLoadDefaultUser]);

  const displayResult = result ?? defaultUserResult;

  useEffect(() => {
    if (result?.state === "ok") {
      writeUserStatsCache(result);
    }
  }, [result]);

  useEffect(() => {
    if (defaultUserResult?.state === "ok") {
      writeUserStatsCache(defaultUserResult);
    }
  }, [defaultUserResult]);

  // While a user-mode navigation is in flight, only render stats that
  // already match the target user; otherwise fall back to the session
  // cache for an instant render, and only then to a loading state.
  const pendingUserStatsMatch =
    pendingUserTarget !== null &&
    displayResult?.state === "ok" &&
    normalizeEventernoteUserId(displayResult.userId).toLowerCase() ===
      pendingUserTarget.toLowerCase();
  const optimisticUserStats =
    pendingUserTarget === null || pendingUserStatsMatch
      ? null
      : readUserStatsCache(pendingUserTarget);
  const userStatsPending =
    pendingUserTarget !== null &&
    !pendingUserStatsMatch &&
    optimisticUserStats === null;

  useEffect(() => {
    if (!trimmedUserId || !displayResult || displayResult.state === "warming") {
      return;
    }

    document.cookie = clearAwaitFreshAfterCookie();
    if (displayResult.state === "ok") {
      try {
        window.localStorage.setItem(LAST_SUCCESSFUL_USER_ID_STORAGE_KEY, displayResult.userId);
      } catch {
        // Storage may be disabled by the browser.
      }
    }
  }, [displayResult, trimmedUserId]);

  useEffect(() => {
    document.title = localeCopy.metadataTitle;
  }, [localeCopy.metadataTitle]);

  return (
    <>
      <nav id="page-top" className="sticky top-0 z-50 border-b border-border-soft bg-background/85 backdrop-blur-xl">
        <div className="@container/nav-bar mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/"
              onClick={resetToDemoHome}
              className="min-w-0 truncate font-heading text-lg font-semibold tracking-[-0.04em] hover:text-accent"
            >
              <span className="sm:hidden">{localeCopy.navTitleMobile}</span>
              <span className="hidden sm:inline">{localeCopy.navTitleDesktop}</span>
            </Link>
            <SongsStatsNavLink copy={localeCopy} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {isAdminAuthenticated ? (
              <Link href="/admin" className={navPillLabel}>
                {localeCopy.adminNav}
              </Link>
            ) : null}
            <LocaleToggle locale={activeLocale} onLocaleChange={setActiveLocale} />
            <ThemeToggle copy={localeCopy} />
          </div>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-8">
        <section id="search" className="rounded-[1.15rem] border border-border-soft bg-panel px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2">
              <div className="min-w-0">
                <h1
                  className="whitespace-nowrap font-heading text-2xl font-semibold tracking-[-0.04em] sm:text-3xl"
                >
                  {searchMode === "user" ? (
                    <a
                      href="https://www.eventernote.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="transition hover:text-accent"
                    >
                      {localeCopy.searchSectionTitle}
                    </a>
                  ) : (
                    localeCopy.liveSearchSectionTitle
                  )}
                </h1>
              </div>
              <div
                role="radiogroup"
                aria-label={localeCopy.searchModeAria}
                className="inline-flex h-8 shrink-0 items-center rounded-full border border-border-soft bg-panel-strong p-0.5"
              >
                {(["user", "live"] as const).map((mode) => {
                  const active = searchMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`inline-flex h-7 items-center justify-center rounded-full px-2 text-sm font-medium leading-none sm:px-3 ${
                        active
                          ? "bg-foreground text-background shadow-sm"
                          : "text-ink-soft hover:text-foreground"
                      }`}
                      onClick={() => handleSearchModeChange(mode)}
                    >
                      {mode === "user"
                        ? localeCopy.searchModeUser
                        : localeCopy.searchModeLive}
                    </button>
                  );
                })}
              </div>
            </div>
            <Activity mode={searchMode === "user" ? "visible" : "hidden"}>
              <SearchForm
                key={pendingUserTarget ?? defaultUserId}
                defaultUserId={pendingUserTarget ?? defaultUserId}
                copy={localeCopy}
              />
            </Activity>
            <Activity mode={searchMode === "live" ? "visible" : "hidden"}>
              <LiveSetlistSearch
                defaultLive={defaultLive}
                copy={localeCopy}
                onResultChange={setSelectedLive}
              />
            </Activity>
          </div>
        </section>

        {/* Loaded song-event state belongs to one setlist only. */}
        <Activity mode={searchMode === "live" ? "visible" : "hidden"}>
          {selectedLive ? (
            <LiveSetlistResult
              key={selectedLive.eventernoteEventId}
              live={selectedLive}
              copy={localeCopy}
            />
          ) : null}
        </Activity>

        <Activity mode={searchMode === "user" ? "visible" : "hidden"}>
          {pendingUserTarget === null &&
          !trimmedUserId &&
          hasDemoUser &&
          displayResult ? (
            <p className="mt-4 text-center text-sm text-ink-soft">
              {localeCopy.demoPrefix}
              <a
                href={`https://www.eventernote.com/bd/user/${encodeURIComponent(demoUserId)}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground transition hover:text-accent"
              >
                {localeCopy.demoLinkLabel}
              </a>
              {localeCopy.demoSuffix}
            </p>
          ) : null}

          <div className="mt-8">
            {optimisticUserStats ? (
                <ResultsClient
                  userId={optimisticUserStats.userId}
                  displayName={optimisticUserStats.displayName}
                  songs={optimisticUserStats.songs}
                  matchedEvents={optimisticUserStats.matchedEvents}
                  defaultHideUnplayed={defaultHideUnplayed}
                  defaultHideVirtualBands={defaultHideVirtualBands}
                  defaultHideSonglessActivities={defaultHideSonglessActivities}
                  eventVisibilityRules={eventVisibilityRules}
                  copy={localeCopy}
                />
              ) : userStatsPending ? (
                <section className="rounded-[1.15rem] border border-border-soft bg-panel px-5 py-6 sm:px-6">
                  <WarmingTitle copy={localeCopy} />
                  <p className="mt-3 max-w-3xl text-base leading-8 text-ink-soft">
                    {localeCopy.warmingDescription}
                  </p>
                </section>
              ) : invalidUserId ? (
                <section className="rounded-[1.15rem] border border-border-soft bg-panel px-5 py-6 sm:px-6">
                  <p className="text-sm text-ink-soft">
                    {localeCopy.resultSectionLabel}
                  </p>
                  <h2 className="mt-2 font-heading text-2xl font-semibold tracking-[-0.04em]">
                    {localeCopy.invalidUserIdTitle}
                  </h2>
                  <p className="mt-3 max-w-3xl text-base leading-8 text-ink-soft">
                    {localeCopy.invalidUserIdMessage}
                  </p>
                </section>
              ) : !trimmedUserId && defaultUserLoading ? (
                <section className="rounded-[1.15rem] border border-border-soft bg-panel px-5 py-6 sm:px-6">
                  <WarmingTitle copy={localeCopy} />
                  <p className="mt-3 max-w-3xl text-base leading-8 text-ink-soft">
                    {isRestoringStoredUser
                      ? localeCopy.restoringUserDescription
                      : localeCopy.warmingDescription}
                  </p>
                </section>
              ) : !displayResult ? null : displayResult.state === "ok" ? (
                <>
                  <ResultsClient
                    userId={displayResult.userId}
                    displayName={displayResult.displayName}
                    songs={displayResult.songs}
                    matchedEvents={displayResult.matchedEvents}
                    defaultHideUnplayed={defaultHideUnplayed}
                    defaultHideVirtualBands={defaultHideVirtualBands}
                    defaultHideSonglessActivities={defaultHideSonglessActivities}
                    eventVisibilityRules={eventVisibilityRules}
                    copy={localeCopy}
                  />
                  {displayResult.staleCacheUsed ? (
                    <RefreshWhileWarming
                      enabled
                      userId={trimmedUserId || displayResult.userId}
                      removeParamNames={refreshParamNames}
                      maxAttempts={40}
                    />
                  ) : null}
                </>
              ) : displayResult.state === "warming" ? (
                <>
                  <section className="rounded-[1.15rem] border border-border-soft bg-panel px-5 py-6 sm:px-6">
                    <WarmingTitle copy={localeCopy} />
                    <p className="mt-3 max-w-3xl text-base leading-8 text-ink-soft">
                      {getWarmingMessage(localeCopy, displayResult)}
                    </p>
                    <p className="mt-2 text-sm text-ink-soft">
                      {localeCopy.warmingAutoRefresh}
                    </p>
                  </section>
                  <RefreshWhileWarming
                    enabled
                    userId={trimmedUserId || displayResult.userId}
                    removeParamNames={refreshParamNames}
                    maxAttempts={40}
                  />
                </>
              ) : (
                <section className="rounded-[1.15rem] border border-border-soft bg-panel px-5 py-6 sm:px-6">
                  <p className="text-sm text-ink-soft">
                    {localeCopy.resultSectionLabel}
                  </p>
                  <h2 className="mt-2 font-heading text-2xl font-semibold tracking-[-0.04em]">
                    {displayResult.state === "not-found"
                      ? localeCopy.notFoundTitle
                      : displayResult.state === "config-error"
                        ? localeCopy.configErrorTitle
                        : localeCopy.upstreamErrorTitle}
                  </h2>
                  <p className="mt-3 max-w-3xl text-base leading-8 text-ink-soft">
                    {displayResult.state === "not-found"
                      ? localeCopy.notFoundMessage(displayResult.userId)
                      : displayResult.state === "config-error"
                        ? localeCopy.configErrorMessage
                        : localeCopy.upstreamErrorMessage}
                  </p>
                </section>
            )}
          </div>
        </Activity>
      </main>
      <PublicFooter copy={localeCopy} />
    </>
  );
}

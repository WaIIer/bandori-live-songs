import "server-only";

import { setTimeout as sleep } from "node:timers/promises";
import { after } from "next/server";
import { unstable_cache } from "next/cache";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db/core";
import { eventernoteUserCache } from "@/lib/db/schema";
import { lookupBandoriEventIndex } from "@/lib/eventernote/bandori-event-index";
import {
  bandoriUserEventSnapshotSchema,
  createBandoriUserEventSnapshots,
} from "@/lib/eventernote/bandori-user-events";
import {
  EventernoteUserNotFoundError,
  eventernoteUserEventsParserVersion,
  fetchAllUserEvents,
  fetchUserEventCount,
} from "@/lib/eventernote/client";
import {
  normalizeEventernoteUserCacheKey,
  normalizeEventernoteUserId,
} from "@/lib/eventernote/user-id";
import { readEventVisibilityRules } from "@/lib/events/event-visibility-rules-store";

import { getSongCatalog } from "./catalog-cache";
import { getEventernoteCacheDisposition } from "./eventernote-cache-policy";
import { buildMatchedEvents } from "./build-matched-events";
import type { MatchedEventEntry, SongPoolItem } from "./aggregate";

const getMatchedEventsCached = unstable_cache(
  async (
    _cacheKey: string,
    activitiesJson: string,
    catalogJson: string,
    titleTagsJson: string,
  ) => {
    const db = getDb();
    const activities = cachePayloadSchema.parse(JSON.parse(activitiesJson));
    const songsWithLiveState = JSON.parse(catalogJson) as SongPoolItem[];
    const titleTagsToStrip = JSON.parse(titleTagsJson) as string[];
    return buildMatchedEvents(
      activities,
      songsWithLiveState,
      db,
      titleTagsToStrip,
    );
  },
  ["matched-events"],
  {
    revalidate: 60 * 5,
    tags: ["song-catalog", "song-events"],
  },
);

const refreshLeaseMs = 1000 * 60 * 5;
const inlineRefreshWaitTimeoutMs = 1000 * 50;
const inlineRefreshWaitIntervalMs = 1000;

export type UserSongStatsResult =
  | {
      state: "ok";
      userId: string;
      displayName: string | null;
      staleCacheUsed: boolean;
      songs: SongPoolItem[];
      matchedEvents: MatchedEventEntry[];
    }
  | {
      state: "warming";
      userId: string;
      message: string;
      reason: "initializing" | "refreshing";
    }
  | {
      state: "not-found";
      userId: string;
    }
  | {
      state: "config-error";
      userId: string;
      message: string;
    }
  | {
      state: "upstream-error";
      userId: string;
      message: string;
    };

const cachePayloadSchema = z.array(bandoriUserEventSnapshotSchema);
type RefreshUserEventsResult =
  | {
      status: "ok";
      displayId: string;
      displayName: string | null;
      activities: z.infer<typeof cachePayloadSchema>;
      remoteEventCount: number;
    }
  | {
      status: "not-found";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

const inFlightUserRefreshes = new Map<string, Promise<RefreshUserEventsResult>>();

async function persistFetchedUserEventsCache(
  cacheUserId: string,
  remote: Awaited<ReturnType<typeof fetchAllUserEvents>>,
  db = getDb(),
) {
  const now = new Date();
  const indexByEventId = await lookupBandoriEventIndex(
    remote.events.map((event) => event.eventernoteEventId),
    db,
  );
  const activities = cachePayloadSchema.parse(createBandoriUserEventSnapshots(remote.events, indexByEventId));
  const remoteEventCount = remote.totalCount;

  await db
    .insert(eventernoteUserCache)
    .values({
      userId: cacheUserId,
      displayId: remote.displayId,
      displayName: remote.displayName,
      parserVersion: eventernoteUserEventsParserVersion,
      activities,
      fetchStatus: "ok",
      errorMessage: null,
      lastFetchedAt: now,
      expiresAt: null,
      refreshingStartedAt: null,
      remoteEventCount,
    })
    .onConflictDoUpdate({
      target: eventernoteUserCache.userId,
      set: {
        displayId: remote.displayId,
        displayName: remote.displayName,
        parserVersion: eventernoteUserEventsParserVersion,
        activities,
        fetchStatus: "ok",
        errorMessage: null,
        lastFetchedAt: now,
        expiresAt: null,
        refreshingStartedAt: null,
        remoteEventCount,
      },
    });

  return {
    displayId: remote.displayId,
    displayName: remote.displayName,
    activities,
    remoteEventCount,
  };
}

async function markUserEventsNotFound(
  cacheUserId: string,
  errorMessage: string,
  db = getDb(),
) {
  const now = new Date();

  const existingRow = await db
    .select({
      activities: eventernoteUserCache.activities,
    })
    .from(eventernoteUserCache)
    .where(eq(eventernoteUserCache.userId, cacheUserId))
    .then((rows) => rows[0] ?? null);

  const hasExistingActivities = existingRow && (existingRow.activities as unknown[]).length > 0;

  await db
    .update(eventernoteUserCache)
    .set({
      fetchStatus: "error",
      errorMessage,
      lastFetchedAt: now,
      expiresAt: null,
      refreshingStartedAt: null,
      // Preserve existing activities if available; only clear if this is a fresh row with no data.
      ...(hasExistingActivities ? {} : { activities: [] }),
    })
    .where(eq(eventernoteUserCache.userId, cacheUserId));
}

async function releaseUserEventsAfterTransientFailure(
  cacheUserId: string,
  db = getDb(),
) {
  const existingRow = await db
    .select({
      activities: eventernoteUserCache.activities,
      fetchStatus: eventernoteUserCache.fetchStatus,
      errorMessage: eventernoteUserCache.errorMessage,
      remoteEventCount: eventernoteUserCache.remoteEventCount,
    })
    .from(eventernoteUserCache)
    .where(eq(eventernoteUserCache.userId, cacheUserId))
    .then((rows) => rows[0] ?? null);

  if (!existingRow) {
    return;
  }

  const hasSuccessfulCache =
    existingRow.remoteEventCount !== null ||
    existingRow.activities.length > 0;
  const isKnownMissingUser =
    existingRow.fetchStatus === "error" &&
    existingRow.errorMessage?.includes("不存在");

  if (isKnownMissingUser) {
    await db
      .update(eventernoteUserCache)
      .set({ refreshingStartedAt: null })
      .where(eq(eventernoteUserCache.userId, cacheUserId));
    return;
  }

  if (hasSuccessfulCache) {
    await db
      .update(eventernoteUserCache)
      .set({
        fetchStatus: "ok",
        errorMessage: null,
        refreshingStartedAt: null,
      })
      .where(eq(eventernoteUserCache.userId, cacheUserId));
    return;
  }

  // A failed first fetch has no reusable data. Removing its lease row avoids
  // persisting a transient upstream outage as a user-level cache error.
  await db
    .delete(eventernoteUserCache)
    .where(eq(eventernoteUserCache.userId, cacheUserId));
}

async function fetchAndPersistUserEvents(
  requestedUserId: string,
  cacheUserId: string,
  db = getDb(),
): Promise<RefreshUserEventsResult> {
  try {
    const remote = await fetchAllUserEvents(requestedUserId);
    const persisted = await persistFetchedUserEventsCache(cacheUserId, remote, db);

    return {
      status: "ok",
      displayId: persisted.displayId,
      displayName: persisted.displayName,
      activities: persisted.activities,
      remoteEventCount: persisted.remoteEventCount,
    };
  } catch (error) {
    if (error instanceof EventernoteUserNotFoundError) {
      const message = "Eventernote 用户不存在或不可访问。";
      await markUserEventsNotFound(cacheUserId, message, db);

      return {
        status: "not-found",
        message,
      };
    }

    const message = error instanceof Error ? error.message : "抓取 Eventernote 失败。";
    await releaseUserEventsAfterTransientFailure(cacheUserId, db);
    console.warn("[eventernote] transient user refresh failure", {
      userId: cacheUserId,
      message,
    });

    return {
      status: "error",
      message,
    };
  }
}

async function tryAcquireUserEventsRefreshLease(cacheUserId: string, displayUserId: string, db = getDb()) {
  const now = new Date();
  const leaseCutoff = new Date(now.getTime() - refreshLeaseMs);

  // For cache misses, create a placeholder row and acquire lease in one step.
  const insertedRows = await db
    .insert(eventernoteUserCache)
    .values({
      userId: cacheUserId,
      displayId: displayUserId,
      displayName: null,
      fetchStatus: "ok",
      parserVersion: eventernoteUserEventsParserVersion,
      activities: [],
      errorMessage: null,
      lastFetchedAt: now,
      expiresAt: null,
      refreshingStartedAt: now,
      remoteEventCount: null,
    })
    .onConflictDoNothing()
    .returning({ userId: eventernoteUserCache.userId });

  if (insertedRows.length > 0) {
    return true;
  }

  const rows = await db
    .update(eventernoteUserCache)
    .set({
      refreshingStartedAt: now,
    })
    .where(
      and(
        eq(eventernoteUserCache.userId, cacheUserId),
        or(isNull(eventernoteUserCache.refreshingStartedAt), lt(eventernoteUserCache.refreshingStartedAt, leaseCutoff)),
      ),
    )
    .returning({ userId: eventernoteUserCache.userId });

  return rows.length > 0;
}

function refreshCachedUserEventsDeduped(requestedUserId: string, cacheUserId: string, db = getDb()) {
  const inFlight = inFlightUserRefreshes.get(cacheUserId);
  if (inFlight) {
    return inFlight;
  }

  // Reuse one in-flight refresh per user in a single runtime instance.
  const refreshPromise = fetchAndPersistUserEvents(requestedUserId, cacheUserId, db).finally(() => {
    if (inFlightUserRefreshes.get(cacheUserId) === refreshPromise) {
      inFlightUserRefreshes.delete(cacheUserId);
    }
  });

  inFlightUserRefreshes.set(cacheUserId, refreshPromise);
  return refreshPromise;
}

function hasOutdatedUserEventsParser(cacheRow: typeof eventernoteUserCache.$inferSelect | null) {
  return Boolean(cacheRow && cacheRow.parserVersion < eventernoteUserEventsParserVersion);
}

function scheduleUserEventsRefresh(requestedUserId: string, cacheUserId: string, displayUserId: string) {
  after(async () => {
    const db = getDb();
    const leaseAcquired = await tryAcquireUserEventsRefreshLease(cacheUserId, displayUserId, db);

    if (!leaseAcquired) {
      return;
    }

    await refreshCachedUserEventsDeduped(requestedUserId, cacheUserId, db);
  });
}

async function waitForUserEventsRefresh(cacheUserId: string, timeoutMs: number, intervalMs: number, db = getDb()) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const cacheRow = await db
      .select({
        refreshingStartedAt: eventernoteUserCache.refreshingStartedAt,
      })
      .from(eventernoteUserCache)
      .where(sql`lower(${eventernoteUserCache.userId}) = ${cacheUserId}`)
      .then((rows) => rows[0] ?? null);

    if (cacheRow && !cacheRow.refreshingStartedAt) {
      return true;
    }

    await sleep(intervalMs);
  }

  return false;
}

async function refreshUserEventsInline({
  requestedUserId,
  cacheUserId,
  displayUserId,
  waitTimeoutMs,
  waitIntervalMs,
  db,
}: {
  requestedUserId: string;
  cacheUserId: string;
  displayUserId: string;
  waitTimeoutMs: number;
  waitIntervalMs: number;
  db: ReturnType<typeof getDb>;
}) {
  const leaseAcquired = await tryAcquireUserEventsRefreshLease(cacheUserId, displayUserId, db);

  if (leaseAcquired) {
    return refreshCachedUserEventsDeduped(requestedUserId, cacheUserId, db);
  }

  await waitForUserEventsRefresh(cacheUserId, waitTimeoutMs, waitIntervalMs, db);
  return null;
}

type GetUserSongStatsOptions = {
  forceRefresh?: boolean;
  awaitFreshAfter?: number;
  refreshMode?: "background" | "inline";
  refreshWaitTimeoutMs?: number;
  refreshWaitIntervalMs?: number;
};

function resolveCacheErrorResult(
  cacheRow: typeof eventernoteUserCache.$inferSelect,
  userId: string,
): UserSongStatsResult {
  if (cacheRow.errorMessage?.includes("不存在")) {
    return { state: "not-found", userId };
  }

  return {
    state: "upstream-error",
    userId,
    message: cacheRow.errorMessage ?? "抓取 Eventernote 失败。",
  };
}

export async function getUserSongStats(
  userId: string,
  {
    forceRefresh = false,
    awaitFreshAfter,
    refreshMode = "background",
    refreshWaitTimeoutMs = inlineRefreshWaitTimeoutMs,
    refreshWaitIntervalMs = inlineRefreshWaitIntervalMs,
  }: GetUserSongStatsOptions = {},
): Promise<UserSongStatsResult> {
  const requestedUserId = normalizeEventernoteUserId(userId);
  const cacheUserId = normalizeEventernoteUserCacheKey(requestedUserId);

  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    return {
      state: "config-error",
      userId: requestedUserId,
      message: "尚未配置 DATABASE_URL / DIRECT_URL，无法访问 Supabase Postgres。",
    };
  }

  const db = getDb();
  const [{ songsWithLiveState }, cacheRow, eventRules] = await Promise.all([
    getSongCatalog(),
    db
      .select()
      .from(eventernoteUserCache)
      .where(sql`lower(${eventernoteUserCache.userId}) = ${cacheUserId}`)
      .then((rows) => rows[0] ?? null),
    readEventVisibilityRules(),
  ]);
  const refreshCacheUserId = cacheRow?.userId ?? cacheUserId;
  let displayUserId = cacheRow?.displayId ?? requestedUserId;
  let displayName = cacheRow?.displayName ?? null;

  const cachedActivities = cacheRow
    ? cachePayloadSchema.parse(cacheRow.activities)
    : [];
  const isKnownMissingUser = Boolean(
    cacheRow?.fetchStatus === "error" &&
      cacheRow.errorMessage?.includes("不存在"),
  );
  const isRetryableEmptyFailure = Boolean(
    cacheRow?.fetchStatus === "error" &&
      !isKnownMissingUser &&
      cacheRow.remoteEventCount === null &&
      cachedActivities.length === 0,
  );
  const cacheRowForDisposition = isRetryableEmptyFailure
    ? null
    : cacheRow;

  // Cache misses already need the complete first page, so a separate count
  // request would fetch the same Eventernote page twice. Existing transient
  // failures also retry the complete fetch directly.
  const remoteEventCount =
    cacheRowForDisposition && !isKnownMissingUser
      ? await fetchUserEventCount(requestedUserId)
      : null;

  const cacheDisposition = getEventernoteCacheDisposition(
    cacheRowForDisposition,
    remoteEventCount,
  );
  let staleCacheUsed = cacheDisposition.staleCacheUsed;
  let activities: z.infer<typeof cachePayloadSchema> =
    cacheRow && !hasOutdatedUserEventsParser(cacheRow)
      ? cachedActivities
      : [];
  const hasFreshEnoughCache =
    typeof awaitFreshAfter === "number" &&
    cacheRow !== null &&
    new Date(cacheRow.lastFetchedAt).getTime() >= awaitFreshAfter;

  async function buildOkResult({
    cacheKeyTime,
    nextDisplayUserId,
    nextDisplayName,
    nextActivities,
    nextStaleCacheUsed,
  }: {
    cacheKeyTime: number;
    nextDisplayUserId: string;
    nextDisplayName: string | null;
    nextActivities: z.infer<typeof cachePayloadSchema>;
    nextStaleCacheUsed: boolean;
  }): Promise<UserSongStatsResult> {
    const matchedEvents = await getMatchedEventsCached(
      `${refreshCacheUserId}:${cacheKeyTime}`,
      JSON.stringify(nextActivities),
      JSON.stringify(songsWithLiveState),
      JSON.stringify(eventRules.titleTagsToStrip),
    );

    return {
      state: "ok",
      userId: nextDisplayUserId,
      displayName: nextDisplayName,
      staleCacheUsed: nextStaleCacheUsed,
      songs: songsWithLiveState,
      matchedEvents,
    };
  }

  async function refreshInlineOrWait(): Promise<UserSongStatsResult> {
    const refreshResult = await refreshUserEventsInline({
      requestedUserId,
      cacheUserId: refreshCacheUserId,
      displayUserId,
      waitTimeoutMs: refreshWaitTimeoutMs,
      waitIntervalMs: refreshWaitIntervalMs,
      db,
    });

    if (refreshResult === null) {
      return getUserSongStats(requestedUserId, {
        awaitFreshAfter,
        refreshMode: "background",
      });
    }

    if (refreshResult.status === "not-found") {
      return {
        state: "not-found",
        userId: displayUserId,
      };
    }

    if (refreshResult.status === "error") {
      return {
        state: "upstream-error",
        userId: displayUserId,
        message: refreshResult.message,
      };
    }

    return buildOkResult({
      cacheKeyTime: Date.now(),
      nextDisplayUserId: refreshResult.displayId,
      nextDisplayName: refreshResult.displayName,
      nextActivities: refreshResult.activities,
      nextStaleCacheUsed: false,
    });
  }

  if (forceRefresh) {
    if (refreshMode === "inline") {
      return refreshInlineOrWait();
    }

    scheduleUserEventsRefresh(requestedUserId, refreshCacheUserId, displayUserId);

    return {
      state: "warming",
      userId: displayUserId,
      message: "正在刷新 Eventernote 缓存，请稍候。",
      reason: "refreshing",
    };
  }

  if (hasOutdatedUserEventsParser(cacheRow)) {
    const refreshResult = await refreshCachedUserEventsDeduped(requestedUserId, refreshCacheUserId, db);

    if (refreshResult.status === "not-found") {
      return {
        state: "not-found",
        userId: displayUserId,
      };
    }

    if (refreshResult.status === "error") {
      return {
        state: "upstream-error",
        userId: displayUserId,
        message: refreshResult.message,
      };
    }

    activities = refreshResult.activities;
    displayUserId = refreshResult.displayId;
    displayName = refreshResult.displayName ?? displayName;
    staleCacheUsed = false;
  }

  if (typeof awaitFreshAfter === "number" && !hasFreshEnoughCache) {
    if (refreshMode === "inline") {
      return refreshInlineOrWait();
    }

    scheduleUserEventsRefresh(requestedUserId, refreshCacheUserId, displayUserId);

    return {
      state: "warming",
      userId: displayUserId,
      message: "正在刷新 Eventernote 缓存，请稍候。",
      reason: "refreshing",
    };
  }

  if (cacheDisposition.mode === "warm-and-refresh") {
    if (refreshMode === "inline") {
      return refreshInlineOrWait();
    }

    scheduleUserEventsRefresh(requestedUserId, refreshCacheUserId, displayUserId);

    return {
      state: "warming",
      userId: displayUserId,
      message: "正在初始化该用户的 Eventernote 缓存，请稍候。",
      reason: "initializing",
    };
  }

  if (cacheDisposition.mode === "serve-stale-and-refresh") {
    scheduleUserEventsRefresh(requestedUserId, refreshCacheUserId, displayUserId);

    return buildOkResult({
      cacheKeyTime: cacheRow!.lastFetchedAt.getTime(),
      nextDisplayUserId: displayUserId,
      nextDisplayName: displayName,
      nextActivities: activities,
      nextStaleCacheUsed: true,
    });
  }

  if (cacheRow?.fetchStatus === "error") {
    const isFreshEnough = typeof awaitFreshAfter === "number" && hasFreshEnoughCache;
    if (isFreshEnough || activities.length === 0) {
      return resolveCacheErrorResult(cacheRow, displayUserId);
    }
  }

  const refreshingInProgress =
    cacheRow &&
    cacheRow.refreshingStartedAt &&
    new Date(cacheRow.refreshingStartedAt).getTime() >= Date.now() - refreshLeaseMs;

  if (refreshingInProgress && activities.length === 0) {
    if (refreshMode === "inline") {
      const ready = await waitForUserEventsRefresh(
        refreshCacheUserId,
        refreshWaitTimeoutMs,
        refreshWaitIntervalMs,
        db,
      );

      if (ready) {
        return getUserSongStats(requestedUserId, {
          awaitFreshAfter,
          refreshMode: "background",
        });
      }
    }

    return {
      state: "warming",
      userId: displayUserId,
      message: "正在刷新 Eventernote 缓存，请稍候。",
      reason: "refreshing",
    };
  }

  const matchedEvents = await getMatchedEventsCached(
    `${refreshCacheUserId}:${cacheRow?.lastFetchedAt?.getTime() ?? 0}`,
    JSON.stringify(activities),
    JSON.stringify(songsWithLiveState),
    JSON.stringify(eventRules.titleTagsToStrip),
  );

  return {
    state: "ok",
    userId: displayUserId,
    displayName,
    staleCacheUsed,
    songs: songsWithLiveState,
    matchedEvents,
  };
}

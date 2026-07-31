import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { HomePageClient } from "@/components/home-page-client";
import { adminAuthCookieName, verifyAdminAuthToken } from "@/lib/admin/auth";
import {
  getDefaultUserId,
  isValidEventernoteUserId,
  normalizeEventernoteUserId,
} from "@/lib/eventernote/user-id";
import { awaitFreshAfterCookieName, decodeAwaitFreshAfterCookie } from "@/lib/manual-refresh-navigation";
import { readEventVisibilityRules } from "@/lib/events/event-visibility-rules-store";
import { getRequestLocale } from "@/lib/request-locale";
import { getLiveSetlist } from "@/lib/live-setlist/search";
import { eventSearchTabValue } from "@/lib/live-setlist/url";
import { getUserSongStats } from "@/lib/stats/get-user-song-stats";

export const runtime = "nodejs";

type PageProps = {
  searchParams: Promise<{
    userId?: string;
    eventId?: string;
    tab?: string;
    refresh?: string;
    awaitFreshAfter?: string;
  }>;
};

export default async function Home({ searchParams }: PageProps) {
  const {
    userId = "",
    eventId = "",
    tab = "",
    refresh = "",
    awaitFreshAfter = "",
  } = await searchParams;
  const normalizedUserId = normalizeEventernoteUserId(userId);
  const invalidUserId = normalizedUserId.length > 0 && !isValidEventernoteUserId(normalizedUserId);
  const hasExplicitUser = normalizedUserId.length > 0;
  const normalizedEventId = eventId.trim();
  const hasExplicitEvent = normalizedEventId.length > 0;
  const parsedEventId = /^\d+$/u.test(normalizedEventId)
    ? Number(normalizedEventId)
    : null;
  if (
    hasExplicitEvent &&
    (!parsedEventId ||
      !Number.isSafeInteger(parsedEventId) ||
      parsedEventId <= 0)
  ) {
    notFound();
  }
  const defaultLive =
    parsedEventId === null
      ? null
      : await getLiveSetlist(parsedEventId);
  if (hasExplicitEvent && !defaultLive) {
    notFound();
  }
  const defaultSearchMode =
    defaultLive || tab === eventSearchTabValue ? "live" : "user";
  const forceRefresh = refresh === "1";
  const cookieStore = await cookies();
  const awaitFreshAfterFromCookie = hasExplicitUser
    ? decodeAwaitFreshAfterCookie(cookieStore.get(awaitFreshAfterCookieName)?.value, normalizedUserId)
    : undefined;
  const awaitFreshAfterMs = Number(awaitFreshAfter);
  const awaitFreshAfterFromLegacyParam =
    Number.isFinite(awaitFreshAfterMs) && awaitFreshAfterMs > 0 ? awaitFreshAfterMs : undefined;
  const awaitFreshAfterValue = awaitFreshAfterFromCookie ?? awaitFreshAfterFromLegacyParam;
  const result =
    hasExplicitUser && !invalidUserId
      ? await getUserSongStats(normalizedUserId, { forceRefresh, awaitFreshAfter: awaitFreshAfterValue })
      : null;

  function cookieBool(name: string, defaultVal: boolean): boolean {
    const val = cookieStore.get(name)?.value;
    return val === undefined ? defaultVal : val === "true";
  }

  const defaultHideUnplayed = cookieBool("bdr-hide-unplayed", true);
  const defaultHideVirtualBands = cookieBool("bdr-hide-virtual-bands", true);
  const defaultHideSonglessActivities = cookieBool("bdr-hide-songless-activities", true);
  const isAdminAuthenticated = await verifyAdminAuthToken(cookieStore.get(adminAuthCookieName)?.value);
  const eventVisibilityRules = await readEventVisibilityRules();
  const locale = await getRequestLocale();
  const demoUserId = getDefaultUserId();

  return (
    <HomePageClient
      locale={locale}
      defaultUserId={normalizedUserId}
      demoUserId={demoUserId}
      invalidUserId={invalidUserId}
      result={result}
      defaultHideUnplayed={defaultHideUnplayed}
      defaultHideVirtualBands={defaultHideVirtualBands}
      defaultHideSonglessActivities={defaultHideSonglessActivities}
      isAdminAuthenticated={isAdminAuthenticated}
      eventVisibilityRules={eventVisibilityRules}
      defaultLive={defaultLive}
      defaultSearchMode={defaultSearchMode}
    />
  );
}

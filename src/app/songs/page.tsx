import { cookies } from "next/headers";
import { SongsStatsPageClient } from "@/components/songs-stats-page-client";
import {
  adminAuthCookieName,
  verifyAdminAuthToken,
} from "@/lib/admin/auth";
import { BAND_SEEDS } from "@/lib/constants/bands";
import { getRequestLocale } from "@/lib/request-locale";
import {
  getSongPerformanceStats,
  getSongStatsEventCounts,
} from "@/lib/stats/song-performance-stats";

export const runtime = "nodejs";

type SongsPageProps = {
  searchParams: Promise<{
    band?: string;
  }>;
};

export default async function SongsPage({
  searchParams,
}: SongsPageProps) {
  const [
    { band = "" },
    locale,
    stats,
    eventCounts,
    cookieStore,
  ] = await Promise.all([
    searchParams,
    getRequestLocale(),
    getSongPerformanceStats(),
    getSongStatsEventCounts(),
    cookies(),
  ]);
  const isAdminAuthenticated = await verifyAdminAuthToken(
    cookieStore.get(adminAuthCookieName)?.value,
  );
  const validBandSlugs = new Set(
    BAND_SEEDS.filter((entry) => entry.groupType === "band").map(
      (entry) => entry.slug,
    ),
  );
  const initialBandSlug = validBandSlugs.has(band) ? band : "all";

  return (
    <SongsStatsPageClient
      locale={locale}
      stats={stats}
      eventCounts={eventCounts}
      initialBandSlug={initialBandSlug}
      isAdminAuthenticated={isAdminAuthenticated}
    />
  );
}

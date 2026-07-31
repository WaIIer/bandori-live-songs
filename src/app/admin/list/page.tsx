import { cookies } from "next/headers";
import { BAND_SEEDS } from "@/lib/constants/bands";
import { getEventSetlistMeta } from "@/lib/admin/event-setlist-meta";
import { collectEventYears } from "@/lib/admin/list-event-filters";
import {
  decodeAdminListFiltersCookie,
  adminListFiltersCookieName,
  parsePersistedAdminListFilters,
  sanitizePersistedAdminListFilters,
} from "@/lib/admin/list-filters-state";
import { getCurrentDateInShanghai, listRankingEventsFromIndex } from "@/lib/eventernote/bandori-event-index";
import { readEventVisibilityRules } from "@/lib/events/event-visibility-rules-store";
import { AdminListClient } from "./list-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatDateTime(value: Date | null) {
  if (!value) {
    return "尚未抓取";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

export default async function AdminListPage() {
  const ranking = await listRankingEventsFromIndex();
  const bands = BAND_SEEDS.filter((band) => band.groupType === "band").map((band) => ({
    slug: band.slug,
    nameJa: band.nameJa,
  }));
  const cookieStore = await cookies();
  const initialFilters = sanitizePersistedAdminListFilters(
    parsePersistedAdminListFilters(
      decodeAdminListFiltersCookie(cookieStore.get(adminListFiltersCookieName)?.value),
    ),
    collectEventYears(ranking.events),
    bands.map((band) => band.slug),
  );
  const { statusByEventId, updatedAtByEventId } =
    await getEventSetlistMeta(
      ranking.events.map((event) => event.eventernoteEventId),
    );
  const eventVisibilityRules = await readEventVisibilityRules();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <AdminListClient
        generatedAtLabel={formatDateTime(ranking.updatedAt)}
        events={ranking.events}
        bands={bands}
        statusByEventId={statusByEventId}
        setlistUpdatedAtByEventId={updatedAtByEventId}
        eventVisibilityRules={eventVisibilityRules}
        initialFilters={initialFilters}
        todayDate={getCurrentDateInShanghai()}
      />
    </main>
  );
}

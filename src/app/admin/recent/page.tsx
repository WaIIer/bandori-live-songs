import { BAND_SEEDS } from "@/lib/constants/bands";
import { getEventSetlistMeta } from "@/lib/admin/event-setlist-meta";
import { listRecentEventsFromIndex } from "@/lib/eventernote/bandori-event-index";
import { readEventVisibilityRules } from "@/lib/events/event-visibility-rules-store";
import { EventRankingClient } from "./event-ranking-client";

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

export default async function RecentEventPage() {
  const ranking = await listRecentEventsFromIndex();
  const { statusByEventId, updatedAtByEventId } =
    await getEventSetlistMeta(
      ranking.events.map((event) => event.eventernoteEventId),
    );
  const eventVisibilityRules = await readEventVisibilityRules();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <EventRankingClient
        eyebrow="Recent"
        title="近期活动列表"
        description={`数据来自乐队 Eventernote actor 活动页，写入 bandori_event_index。页面仅显示 ${ranking.filteredFrom} 至 ${ranking.filteredThrough} 的活动，列表按日期倒序显示，同日按参加人数倒序排列，歌单收录状态实时读取数据库。`}
        generatedAtLabel={formatDateTime(ranking.updatedAt)}
        events={ranking.events}
        bands={BAND_SEEDS.filter((band) => band.groupType === "band").map((band) => ({
          slug: band.slug,
          nameJa: band.nameJa,
        }))}
        statusByEventId={statusByEventId}
        setlistUpdatedAtByEventId={updatedAtByEventId}
        eventVisibilityRules={eventVisibilityRules}
      />
    </main>
  );
}

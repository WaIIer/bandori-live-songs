import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/core";
import { eventernoteUserCache } from "@/lib/db/schema";
import {
  AdminUserCacheClient,
  type AdminUserCacheRow,
} from "./user-cache-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);
}

export default async function AdminUserCachePage() {
  const db = getDb();
  const rows = await db
    .select({
      userId: eventernoteUserCache.userId,
      displayId: eventernoteUserCache.displayId,
      displayName: eventernoteUserCache.displayName,
      fetchStatus: eventernoteUserCache.fetchStatus,
      lastFetchedAt: eventernoteUserCache.lastFetchedAt,
      remoteEventCount: eventernoteUserCache.remoteEventCount,
    })
    .from(eventernoteUserCache)
    .orderBy(desc(eventernoteUserCache.lastFetchedAt));

  const clientRows: AdminUserCacheRow[] = rows.map((row) => ({
    ...row,
    lastFetchedAt: formatDateTime(row.lastFetchedAt),
  }));

  return <AdminUserCacheClient rows={clientRows} />;
}

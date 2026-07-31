import { eq, inArray, max } from "drizzle-orm";
import { getDb } from "@/lib/db/core";
import { events, setlistEntries } from "@/lib/db/schema";

export type AdminEventSetlistStatus =
  | "missing"
  | "partial"
  | "complete"
  | null;

export async function getEventSetlistMeta(eventIds: number[]) {
  const statusByEventId: Record<number, AdminEventSetlistStatus> = {};
  const updatedAtByEventId: Record<number, string | null> = {};

  if (
    eventIds.length === 0 ||
    (!process.env.DATABASE_URL && !process.env.DIRECT_URL)
  ) {
    return { statusByEventId, updatedAtByEventId };
  }

  const db = getDb();
  const rows = await db
    .select({
      eventernoteEventId: events.eventernoteEventId,
      setlistStatus: events.setlistStatus,
      setlistUpdatedAt: max(setlistEntries.createdAt),
    })
    .from(events)
    .leftJoin(setlistEntries, eq(setlistEntries.eventId, events.id))
    .where(inArray(events.eventernoteEventId, [...new Set(eventIds)]))
    .groupBy(events.id);

  for (const row of rows) {
    statusByEventId[row.eventernoteEventId] = row.setlistStatus;
    updatedAtByEventId[row.eventernoteEventId] =
      row.setlistUpdatedAt?.toISOString() ?? null;
  }

  return { statusByEventId, updatedAtByEventId };
}

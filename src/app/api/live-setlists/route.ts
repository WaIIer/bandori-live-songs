import { NextResponse } from "next/server";
import {
  getLiveSetlist,
  searchLiveSetlistCandidates,
} from "@/lib/live-setlist/search";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const eventernoteEventIdValue = url.searchParams.get("eventernoteEventId");

  if (eventernoteEventIdValue !== null) {
    const eventernoteEventId = Number.parseInt(eventernoteEventIdValue, 10);
    if (
      !Number.isSafeInteger(eventernoteEventId) ||
      eventernoteEventId <= 0 ||
      String(eventernoteEventId) !== eventernoteEventIdValue
    ) {
      return NextResponse.json(
        { error: "Eventernote 活动 ID 格式不正确。" },
        { status: 400 },
      );
    }

    const live = await getLiveSetlist(eventernoteEventId);
    if (!live) {
      return NextResponse.json(
        { error: "没有找到该 Live 的歌单。" },
        { status: 404 },
      );
    }

    return NextResponse.json({ live });
  }

  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 100) {
    return NextResponse.json(
      { error: "Live 标题须为 2 至 100 个字符。" },
      { status: 400 },
    );
  }

  const candidates = await searchLiveSetlistCandidates(query);
  return NextResponse.json({ candidates });
}

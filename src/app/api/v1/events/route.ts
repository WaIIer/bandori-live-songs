import { getPublicApiSnapshot } from "@/lib/public-api/data";
import {
  buildNextLink,
  parseBoundedQuery,
  publicApiInvalidParameterResponse,
  publicApiJsonResponse,
  publicApiOptionsResponse,
} from "@/lib/public-api/http";
import {
  paginateById,
  parseLimit,
  PublicApiParameterError,
} from "@/lib/public-api/pagination";

export const runtime = "nodejs";

function parseDateFilter(rawValue: string | null, name: string) {
  if (rawValue === null || rawValue === "") return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    throw new PublicApiParameterError(
      `invalid_${name}`,
      `${name} must use YYYY-MM-DD format.`,
    );
  }
  return rawValue;
}

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const snapshot = await getPublicApiSnapshot();
    const limit = parseLimit(url.searchParams.get("limit"));
    const query = parseBoundedQuery(url.searchParams.get("q"), "q");
    const band = url.searchParams.get("band") ?? "";
    const from = parseDateFilter(url.searchParams.get("from"), "from");
    const to = parseDateFilter(url.searchParams.get("to"), "to");
    const setlistStatus =
      url.searchParams.get("setlistStatus") ?? "";
    const order = url.searchParams.get("order") ?? "desc";

    if (band && !snapshot.bands.some((item) => item.slug === band)) {
      throw new PublicApiParameterError(
        "invalid_band",
        `No band exists with slug "${band}".`,
      );
    }
    if (
      setlistStatus &&
      !["missing", "partial", "complete"].includes(setlistStatus)
    ) {
      throw new PublicApiParameterError(
        "invalid_setlist_status",
        "setlistStatus must be missing, partial, or complete.",
      );
    }
    if (!["asc", "desc"].includes(order)) {
      throw new PublicApiParameterError(
        "invalid_order",
        "order must be asc or desc.",
      );
    }
    if (from && to && from > to) {
      throw new PublicApiParameterError(
        "invalid_date_range",
        "from must be earlier than or equal to to.",
      );
    }

    const normalizedQuery = query.toLocaleLowerCase();
    const filtered = snapshot.events
      .filter(
        (event) =>
          (!normalizedQuery ||
            event.title.toLocaleLowerCase().includes(normalizedQuery)) &&
          (!band || event.performingBandSlugs.includes(band)) &&
          (!from || event.eventDate >= from) &&
          (!to || event.eventDate <= to) &&
          (!setlistStatus ||
            event.setlistStatus === setlistStatus),
      )
      .map((event) => ({
        eventernoteEventId: event.eventernoteEventId,
        title: event.title,
        eventDate: event.eventDate,
        venue: event.venue,
        performingBandSlugs: event.performingBandSlugs,
        setlistStatus: event.setlistStatus,
        sourceUrl: event.sourceUrl,
      }))
      .sort((left, right) => {
        const delta =
          left.eventDate.localeCompare(right.eventDate) ||
          left.eventernoteEventId - right.eventernoteEventId;
        return order === "asc" ? delta : -delta;
      });
    const fingerprint = JSON.stringify({
      q: normalizedQuery,
      band,
      from,
      to,
      setlistStatus,
      order,
    });
    const page = paginateById({
      items: filtered,
      limit,
      rawCursor: url.searchParams.get("cursor"),
      resource: "events",
      fingerprint,
      getId: (event) => event.eventernoteEventId,
    });
    const nextLink = buildNextLink(request, page.nextCursor);

    return publicApiJsonResponse(
      request,
      {
        data: page.data,
        pagination: {
          limit,
          nextCursor: page.nextCursor,
        },
      },
      {
        headers: nextLink ? { Link: nextLink } : undefined,
      },
    );
  } catch (error) {
    return publicApiInvalidParameterResponse(request, error);
  }
}

export { handle as GET, handle as HEAD };
export const OPTIONS = publicApiOptionsResponse;

import { getPublicApiSnapshot } from "@/lib/public-api/data";
import {
  parsePositiveInteger,
  publicApiInvalidParameterResponse,
  publicApiJsonResponse,
  publicApiOptionsResponse,
  publicApiProblemResponse,
} from "@/lib/public-api/http";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ eventernoteEventId: string }>;
};

async function handle(request: Request, context: Context) {
  try {
    const { eventernoteEventId: rawId } = await context.params;
    const eventernoteEventId = parsePositiveInteger(
      rawId,
      "eventernote_event_id",
    );
    const snapshot = await getPublicApiSnapshot();
    const event = snapshot.events.find(
      (item) =>
        item.eventernoteEventId === eventernoteEventId,
    );
    if (!event) {
      return publicApiProblemResponse(request, {
        status: 404,
        code: "event_not_found",
        title: "Event not found",
        detail: `No setlist event exists with Eventernote id ${eventernoteEventId}.`,
      });
    }
    return publicApiJsonResponse(request, { data: event });
  } catch (error) {
    return publicApiInvalidParameterResponse(request, error);
  }
}

export { handle as GET, handle as HEAD };
export const OPTIONS = publicApiOptionsResponse;


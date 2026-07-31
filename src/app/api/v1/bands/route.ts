import { getPublicApiSnapshot } from "@/lib/public-api/data";
import {
  publicApiInvalidParameterResponse,
  publicApiJsonResponse,
  publicApiOptionsResponse,
} from "@/lib/public-api/http";

export const runtime = "nodejs";

async function handle(request: Request) {
  try {
    const snapshot = await getPublicApiSnapshot();
    return publicApiJsonResponse(request, { data: snapshot.bands });
  } catch (error) {
    return publicApiInvalidParameterResponse(request, error);
  }
}

export { handle as GET, handle as HEAD };
export const OPTIONS = publicApiOptionsResponse;

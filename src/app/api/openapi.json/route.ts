import {
  publicApiJsonResponse,
  publicApiOptionsResponse,
} from "@/lib/public-api/http";
import { publicApiOpenApiDocument } from "@/lib/public-api/openapi";

export const runtime = "nodejs";

function handle(request: Request) {
  return publicApiJsonResponse(request, publicApiOpenApiDocument);
}

export { handle as GET, handle as HEAD };
export const OPTIONS = publicApiOptionsResponse;

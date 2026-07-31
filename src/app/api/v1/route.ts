import {
  publicApiJsonResponse,
  publicApiOptionsResponse,
} from "@/lib/public-api/http";

export const runtime = "nodejs";

async function handle(request: Request) {
  const origin = new URL(request.url).origin;
  return publicApiJsonResponse(request, {
    data: {
      apiVersion: "1",
      documentation: `${origin}/api`,
      openapi: `${origin}/api/openapi.json`,
      resources: {
        bands: `${origin}/api/v1/bands`,
        songs: `${origin}/api/v1/songs`,
        events: `${origin}/api/v1/events`,
      },
    },
  });
}

export { handle as GET, handle as HEAD };
export const OPTIONS = publicApiOptionsResponse;

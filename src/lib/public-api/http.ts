import { createHash } from "node:crypto";
import { PublicApiParameterError } from "./pagination";

const baseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "If-None-Match",
  "Access-Control-Expose-Headers": "ETag, Link",
  "Cache-Control": "public, max-age=0, must-revalidate",
};

export function publicApiOptionsResponse() {
  return new Response(null, { status: 204, headers: baseHeaders });
}

export function publicApiJsonResponse(
  request: Request,
  payload: unknown,
  options: {
    status?: number;
    headers?: Record<string, string>;
  } = {},
) {
  const body = `${JSON.stringify(payload)}\n`;
  const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;
  const headers = {
    ...baseHeaders,
    "Content-Type": "application/json; charset=utf-8",
    ETag: etag,
    ...options.headers,
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(request.method === "HEAD" ? null : body, {
    status: options.status ?? 200,
    headers,
  });
}

export function publicApiProblemResponse(
  request: Request,
  {
    status,
    code,
    title,
    detail,
  }: {
    status: number;
    code: string;
    title: string;
    detail: string;
  },
) {
  const body = `${JSON.stringify({
    type: "about:blank",
    title,
    status,
    detail,
    instance: new URL(request.url).pathname,
    code,
  })}\n`;
  return new Response(request.method === "HEAD" ? null : body, {
    status,
    headers: {
      ...baseHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/problem+json; charset=utf-8",
    },
  });
}

export function publicApiInvalidParameterResponse(
  request: Request,
  error: unknown,
) {
  if (error instanceof PublicApiParameterError) {
    return publicApiProblemResponse(request, {
      status: 400,
      code: error.code,
      title: "Invalid request parameter",
      detail: error.message,
    });
  }
  console.error("[public-api] request failed", error);
  return publicApiProblemResponse(request, {
    status: 500,
    code: "internal_error",
    title: "Internal server error",
    detail: "The request could not be completed.",
  });
}

export function parsePositiveInteger(
  rawValue: string,
  parameterName: string,
) {
  if (!/^\d+$/.test(rawValue)) {
    throw new PublicApiParameterError(
      `invalid_${parameterName}`,
      `${parameterName} must be a positive integer.`,
    );
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PublicApiParameterError(
      `invalid_${parameterName}`,
      `${parameterName} must be a positive integer.`,
    );
  }
  return value;
}

export function parseBoundedQuery(
  rawValue: string | null,
  parameterName: string,
  maxLength = 100,
) {
  const value = rawValue?.trim() ?? "";
  if (value.length > maxLength) {
    throw new PublicApiParameterError(
      `invalid_${parameterName}`,
      `${parameterName} must be at most ${maxLength} characters.`,
    );
  }
  return value;
}

export function buildNextLink(
  request: Request,
  nextCursor: string | null,
) {
  if (!nextCursor) return undefined;
  const url = new URL(request.url);
  url.searchParams.set("cursor", nextCursor);
  return `<${url.toString()}>; rel="next"`;
}

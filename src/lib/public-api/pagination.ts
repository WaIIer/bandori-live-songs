export const publicApiDefaultLimit = 500;
export const publicApiMaxLimit = 1000;

type CursorPayload = {
  v: 1;
  resource: string;
  fingerprint: string;
  lastId: number;
};

export class PublicApiParameterError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function parseLimit(rawValue: string | null) {
  if (rawValue === null) return publicApiDefaultLimit;
  if (!/^\d+$/.test(rawValue)) {
    throw new PublicApiParameterError(
      "invalid_limit",
      "limit must be an integer.",
    );
  }

  const limit = Number(rawValue);
  if (limit < 1 || limit > publicApiMaxLimit) {
    throw new PublicApiParameterError(
      "invalid_limit",
      `limit must be between 1 and ${publicApiMaxLimit}.`,
    );
  }
  return limit;
}

function encodeCursor(payload: CursorPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(rawValue: string): CursorPayload {
  try {
    const parsed = JSON.parse(
      Buffer.from(rawValue, "base64url").toString("utf8"),
    ) as Partial<CursorPayload>;
    if (
      parsed.v !== 1 ||
      typeof parsed.resource !== "string" ||
      typeof parsed.fingerprint !== "string" ||
      !Number.isSafeInteger(parsed.lastId) ||
      Number(parsed.lastId) <= 0
    ) {
      throw new Error("invalid cursor");
    }
    return parsed as CursorPayload;
  } catch {
    throw new PublicApiParameterError(
      "invalid_cursor",
      "cursor is invalid or malformed.",
    );
  }
}

export function paginateById<T>({
  items,
  limit,
  rawCursor,
  resource,
  fingerprint,
  getId,
}: {
  items: T[];
  limit: number;
  rawCursor: string | null;
  resource: string;
  fingerprint: string;
  getId: (item: T) => number;
}) {
  let startIndex = 0;
  if (rawCursor) {
    const cursor = decodeCursor(rawCursor);
    if (
      cursor.resource !== resource ||
      cursor.fingerprint !== fingerprint
    ) {
      throw new PublicApiParameterError(
        "cursor_mismatch",
        "cursor does not match the current resource and filters.",
      );
    }
    const cursorIndex = items.findIndex(
      (item) => getId(item) === cursor.lastId,
    );
    if (cursorIndex < 0) {
      throw new PublicApiParameterError(
        "cursor_expired",
        "cursor no longer points to an item in this result set.",
      );
    }
    startIndex = cursorIndex + 1;
  }

  const data = items.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + data.length < items.length;
  const last = data.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          v: 1,
          resource,
          fingerprint,
          lastId: getId(last),
        })
      : null;

  return { data, nextCursor };
}


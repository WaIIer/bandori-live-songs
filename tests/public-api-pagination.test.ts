import { describe, expect, it } from "vitest";
import {
  paginateById,
  parseLimit,
  PublicApiParameterError,
} from "@/lib/public-api/pagination";

describe("public API pagination", () => {
  const items = [
    { id: 10, title: "A" },
    { id: 7, title: "B" },
    { id: 42, title: "C" },
  ];

  it("uses a 500 item default and allows at most 1000", () => {
    expect(parseLimit(null)).toBe(500);
    expect(parseLimit("1000")).toBe(1000);
    expect(() => parseLimit("1001")).toThrow(PublicApiParameterError);
    expect(() => parseLimit("0")).toThrow(PublicApiParameterError);
  });

  it("continues from an opaque cursor in the current ordering", () => {
    const firstPage = paginateById({
      items,
      limit: 2,
      rawCursor: null,
      resource: "songs",
      fingerprint: "same-query",
      getId: (item) => item.id,
    });
    expect(firstPage.data.map((item) => item.id)).toEqual([10, 7]);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = paginateById({
      items,
      limit: 2,
      rawCursor: firstPage.nextCursor,
      resource: "songs",
      fingerprint: "same-query",
      getId: (item) => item.id,
    });
    expect(secondPage.data.map((item) => item.id)).toEqual([42]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("rejects a cursor reused with different filters", () => {
    const firstPage = paginateById({
      items,
      limit: 1,
      rawCursor: null,
      resource: "songs",
      fingerprint: "first-query",
      getId: (item) => item.id,
    });

    expect(() =>
      paginateById({
        items,
        limit: 1,
        rawCursor: firstPage.nextCursor,
        resource: "songs",
        fingerprint: "changed-query",
        getId: (item) => item.id,
      }),
    ).toThrow(PublicApiParameterError);
  });
});

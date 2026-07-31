import { describe, expect, it } from "vitest";
import {
  buildGoogleSetlistSearchHref,
  buildSetlistImportHref,
} from "@/lib/admin/setlist-import-url";

describe("admin setlist URLs", () => {
  it("builds the local setlist editor URL", () => {
    expect(buildSetlistImportHref(1234)).toBe(
      "/admin/setlist-import?event=1234",
    );
  });

  it("builds a Google query from the event title and セットリスト", () => {
    const href = buildGoogleSetlistSearchHref("MyGO!!!!! 7th LIVE");
    const url = new URL(href);

    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("q")).toBe(
      "MyGO!!!!! 7th LIVE セットリスト",
    );
  });
});

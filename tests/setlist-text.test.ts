import { describe, expect, it } from "vitest";
import { stripSetlistNumbering } from "@/lib/music/setlist-text";

describe("stripSetlistNumbering", () => {
  it.each([
    ["M1.XXX", "XXX"],
    ["EN1.XXX", "XXX"],
    ["M 1. XXX", "XXX"],
    ["EN 2　XXX", "XXX"],
    ["3. XXX", "XXX"],
    ["4 XXX", "XXX"],
  ])("strips %s", (input, expected) => {
    expect(stripSetlistNumbering(input)).toBe(expected);
  });

  it("keeps titles without a complete numbering prefix", () => {
    expect(stripSetlistNumbering("M八七")).toBe("M八七");
    expect(stripSetlistNumbering("ENCOUNT")).toBe("ENCOUNT");
  });
});

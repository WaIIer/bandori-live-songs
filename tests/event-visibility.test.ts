import { describe, expect, it } from "vitest";
import {
  defaultEventTitleTagsToStrip,
  filterEventsByVisibilityRules,
  shouldHideEventByRulesWithRules,
  type EventVisibilityRules,
} from "@/lib/events/event-visibility";

const rules: EventVisibilityRules = {
  version: 1,
  hiddenTitleKeywords: ["トークイベント", "舞台挨拶"],
  allowedTitleKeywords: ["ミニライブ"],
  hiddenEventernoteEventIds: [12345],
  titleTagsToStrip: [...defaultEventTitleTagsToStrip],
};

describe("event visibility rules", () => {
  it("matches configured title keywords and event ids", () => {
    expect(
      shouldHideEventByRulesWithRules(
        {
          eventernoteEventId: 1,
          title: "昼のトークイベント",
        },
        rules,
      ),
    ).toBe(true);

    expect(
      shouldHideEventByRulesWithRules(
        {
          eventernoteEventId: 6,
          title: "合同リリースイベント",
        },
        {
          ...rules,
          hiddenTitleKeywords: ["」リリースイベント"],
        },
      ),
    ).toBe(false);

    expect(
      shouldHideEventByRulesWithRules(
        {
          eventernoteEventId: 7,
          title: "リリース記念ライブ DAY1",
        },
        {
          ...rules,
          hiddenTitleKeywords: ["」リリースイベント"],
        },
      ),
    ).toBe(false);

    expect(
      shouldHideEventByRulesWithRules(
        {
          eventernoteEventId: 12345,
          title: "普通のライブ",
        },
        rules,
      ),
    ).toBe(true);

    expect(
      shouldHideEventByRulesWithRules(
        {
          eventernoteEventId: 2,
          title: "バンドライブ",
        },
        rules,
      ),
    ).toBe(false);

    expect(
      shouldHideEventByRulesWithRules(
        {
          eventernoteEventId: 3,
          title: "発売記念 トーク＆ミニライブ",
        },
        {
          ...rules,
          hiddenTitleKeywords: ["発売記念", "トーク"],
        },
      ),
    ).toBe(false);

    expect(
      shouldHideEventByRulesWithRules(
        {
          eventernoteEventId: 4,
          title: "ガルパーティ！キャストと協力ライブ！",
        },
        {
          ...rules,
          hiddenTitleKeywords: ["協力ライブ"],
        },
      ),
    ).toBe(true);

    expect(
      shouldHideEventByRulesWithRules(
        {
          eventernoteEventId: 5,
          title: "発売記念 トーク＆ライブ",
        },
        {
          ...rules,
          hiddenTitleKeywords: ["発売記念", "トーク"],
        },
      ),
    ).toBe(true);

    expect(
      shouldHideEventByRulesWithRules(
        {
          eventernoteEventId: 12345,
          title: "発売記念 ミニライブ",
        },
        {
          ...rules,
          hiddenTitleKeywords: ["発売記念"],
        },
      ),
    ).toBe(true);
  });

  it("filters only when the toggle is enabled", () => {
    const events = [
      { eventernoteEventId: 1, title: "昼のトークイベント" },
      { eventernoteEventId: 2, title: "バンドライブ" },
    ];

    expect(
      filterEventsByVisibilityRules(events, true, rules).map((event) => event.eventernoteEventId),
    ).toEqual([2]);
    expect(
      filterEventsByVisibilityRules(events, false, rules).map((event) => event.eventernoteEventId),
    ).toEqual([1, 2]);
  });
});

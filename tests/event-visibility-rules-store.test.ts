import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  eventVisibilityRulesToFormText,
  parseEventVisibilityRulesForm,
  readEventVisibilityRulesFromFile,
} from "@/lib/events/event-visibility-rules-store";
import { defaultEventTitleTagsToStrip } from "@/lib/events/event-visibility";

describe("event visibility rules store", () => {
  it("parses editable textarea values into normalized rules", () => {
    expect(
      parseEventVisibilityRulesForm({
        hiddenTitleKeywordsText: " トーク \n\n舞台挨拶\nトーク ",
        allowedTitleKeywordsText: " ミニライブ \n\nミニライブ ",
        hiddenEventernoteEventIdsText: "123\nabc\n456, 123 -1",
        titleTagsToStripText: " 出演者変更 \n\n振替\n出演者変更 ",
      }),
    ).toEqual({
      version: 1,
      hiddenTitleKeywords: ["トーク", "舞台挨拶"],
      allowedTitleKeywords: ["ミニライブ"],
      hiddenEventernoteEventIds: [123, 456],
      titleTagsToStrip: ["出演者変更", "振替"],
    });
  });

  it("reads seed rules from the JSON file (used by scripts/seed-visibility-rules.ts)", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bdr-rules-"));
    const filePath = path.join(dir, "event-visibility-rules.json");
    const rules = {
      version: 1 as const,
      hiddenTitleKeywords: ["トーク"],
      hiddenEventernoteEventIds: [123],
    };

    await writeFile(filePath, `${JSON.stringify(rules)}\n`, "utf8");

    expect(await readEventVisibilityRulesFromFile(filePath)).toEqual({
      ...rules,
      allowedTitleKeywords: [],
      titleTagsToStrip: [...defaultEventTitleTagsToStrip],
    });
  });

  it("formats rules for admin textarea editing", () => {
    expect(
      eventVisibilityRulesToFormText({
        version: 1,
        hiddenTitleKeywords: ["トーク", "舞台挨拶"],
        allowedTitleKeywords: ["ミニライブ"],
        hiddenEventernoteEventIds: [123, 456],
        titleTagsToStrip: ["出演者変更", "振替"],
      }),
    ).toEqual({
      hiddenTitleKeywordsText: "トーク\n舞台挨拶",
      allowedTitleKeywordsText: "ミニライブ",
      hiddenEventernoteEventIdsText: "123\n456",
      titleTagsToStripText: "出演者変更\n振替",
    });
  });
});

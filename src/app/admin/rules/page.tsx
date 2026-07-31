import { getAdminAuthStatus } from "@/lib/admin/server-auth";
import {
  eventVisibilityRulesToFormText,
  parseEventVisibilityRulesForm,
  readEventVisibilityRules,
  readEventVisibilityRuleEventSummaries,
  writeEventVisibilityRules,
} from "@/lib/events/event-visibility-rules-store";
import { RulesForm, type RulesActionState } from "./rules-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function submitRules(
  _: RulesActionState,
  formData: FormData,
): Promise<RulesActionState> {
  "use server";

  const authStatus = await getAdminAuthStatus();
  if (!authStatus.authenticated) {
    return {
      status: "error",
      message: authStatus.message,
    };
  }

  const rules = parseEventVisibilityRulesForm({
    hiddenTitleKeywordsText: String(formData.get("hiddenTitleKeywordsText") ?? ""),
    allowedTitleKeywordsText: String(formData.get("allowedTitleKeywordsText") ?? ""),
    hiddenEventernoteEventIdsText: String(formData.get("hiddenEventernoteEventIdsText") ?? ""),
    titleTagsToStripText: String(formData.get("titleTagsToStripText") ?? ""),
  });

  try {
    await writeEventVisibilityRules(rules);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "保存规则失败。",
    };
  }

  return {
    status: "success",
    message: `已保存 ${rules.hiddenTitleKeywords.length} 个屏蔽词、${rules.allowedTitleKeywords.length} 个正向词、${rules.hiddenEventernoteEventIds.length} 个 event ID 和 ${rules.titleTagsToStrip.length} 个标题清理标签。`,
  };
}

export default async function RulesPage() {
  const rules = await readEventVisibilityRules();
  const formText = eventVisibilityRulesToFormText(rules);
  const hiddenEventSummaries = await readEventVisibilityRuleEventSummaries(rules.hiddenEventernoteEventIds);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <section className="mb-6 space-y-2">
        <p className="text-sm text-ink-soft">Admin</p>
        <h1 className="font-heading text-3xl font-semibold tracking-[-0.04em] text-foreground">活动规则</h1>
      </section>
      <RulesForm action={submitRules} hiddenEventSummaries={hiddenEventSummaries} {...formText} />
    </main>
  );
}

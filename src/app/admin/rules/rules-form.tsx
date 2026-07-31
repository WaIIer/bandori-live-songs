"use client";

import { useActionState, useState } from "react";
import type { EventVisibilityRuleEventSummary } from "@/lib/events/event-visibility-rules-store";

export type RulesActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

type RulesFormProps = {
  action: (state: RulesActionState, formData: FormData) => Promise<RulesActionState>;
  hiddenTitleKeywordsText: string;
  allowedTitleKeywordsText: string;
  hiddenEventernoteEventIdsText: string;
  titleTagsToStripText: string;
  hiddenEventSummaries: EventVisibilityRuleEventSummary[];
};

const initialState: RulesActionState = {
  status: "idle",
};

export function RulesForm({
  action,
  hiddenTitleKeywordsText,
  allowedTitleKeywordsText,
  hiddenEventernoteEventIdsText,
  titleTagsToStripText,
  hiddenEventSummaries,
}: RulesFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [keywordsText, setKeywordsText] = useState(hiddenTitleKeywordsText);
  const [allowedKeywordsText, setAllowedKeywordsText] = useState(allowedTitleKeywordsText);
  const [eventIdsText, setEventIdsText] = useState(hiddenEventernoteEventIdsText);
  const [titleTagsText, setTitleTagsText] = useState(titleTagsToStripText);

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-4xl flex-col gap-5 rounded-[1.75rem] border border-border-soft bg-panel p-6">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-foreground">
          屏蔽词
          <textarea
            name="hiddenTitleKeywordsText"
            value={keywordsText}
            onChange={(event) => setKeywordsText(event.target.value)}
            rows={20}
            className="rounded-xl border border-border-soft bg-panel-strong px-4 py-3 font-mono text-sm outline-none placeholder:text-ink-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-foreground">
          <span>正向词</span>
          <span className="text-xs leading-5 text-ink-soft">
            标题同时命中屏蔽词和正向词时保留；Event ID 特例始终优先。
          </span>
          <textarea
            name="allowedTitleKeywordsText"
            value={allowedKeywordsText}
            onChange={(event) => setAllowedKeywordsText(event.target.value)}
            rows={17}
            className="rounded-xl border border-border-soft bg-panel-strong px-4 py-3 font-mono text-sm outline-none placeholder:text-ink-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-foreground">
          <span>Eventernote event ID 特例</span>
          <span className="text-xs leading-5 text-ink-soft">
            每行一个；仅用于无法用活动名称规则稳定覆盖的特殊场次。ID 屏蔽优先于正向词。
          </span>
          <textarea
            name="hiddenEventernoteEventIdsText"
            value={eventIdsText}
            onChange={(event) => setEventIdsText(event.target.value)}
            rows={14}
            className="rounded-xl border border-border-soft bg-panel-strong px-4 py-3 font-mono text-sm outline-none placeholder:text-ink-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <div className="rounded-xl border border-border-soft bg-panel-strong p-4 text-sm text-foreground">
          <p className="font-medium">当前 ID 特例名称参考（{hiddenEventSummaries.length}）</p>
          <div className="mt-3 max-h-80 overflow-y-auto pr-2">
            {hiddenEventSummaries.length > 0 ? (
              <ul className="space-y-2 text-xs leading-5 text-ink-soft">
                {hiddenEventSummaries.map((event) => (
                  <li key={event.eventernoteEventId}>
                    <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="font-mono text-accent hover:underline">
                      {event.eventernoteEventId}
                    </a>{" "}
                    {event.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs leading-5 text-ink-soft">暂无可显示的 ID 特例。</p>
            )}
          </div>
        </div>
      </div>
      <label className="flex flex-col gap-2 text-sm text-foreground">
        <span>标题清理标签</span>
        <span className="text-xs leading-5 text-ink-soft">
          每行一个；仅清理活动标题首尾完整匹配的【标签】或[标签]。
        </span>
        <textarea
          name="titleTagsToStripText"
          value={titleTagsText}
          onChange={(event) => setTitleTagsText(event.target.value)}
          rows={8}
          className="rounded-xl border border-border-soft bg-panel-strong px-4 py-3 font-mono text-sm outline-none placeholder:text-ink-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-foreground px-5 font-medium text-background transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "保存中..." : "保存规则"}
      </button>
      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-3 text-sm font-medium text-black dark:text-emerald-100"
              : "rounded-xl border border-amber-500/40 bg-amber-500/20 px-4 py-3 text-sm font-medium text-black dark:text-amber-100"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

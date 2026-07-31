"use client";

import { useActionState } from "react";
import { useState } from "react";
import type { SongCategory } from "@/lib/music/song-category";
import { stripSetlistNumbering } from "@/lib/music/setlist-text";
import type { SetlistImportActionState } from "./types";

type SetlistImportFormProps = {
  action: (
    state: SetlistImportActionState,
    formData: FormData,
  ) => Promise<SetlistImportActionState>;
  defaultEventInput?: string;
  defaultSetlistText?: string;
  existingRecord?: boolean;
  existingEventTitle?: string | null;
  bandOptions: { slug: string; label: string }[];
};

const initialState: SetlistImportActionState = {
  status: "idle",
};

function QuickAddSongControls({
  lineNumber,
  bandOptions,
  pending,
  hasCandidates,
}: {
  lineNumber: number;
  bandOptions: { slug: string; label: string }[];
  pending: boolean;
  hasCandidates: boolean;
}) {
  const [category, setCategory] = useState<SongCategory>("cover");

  return (
    <div className="grid gap-2 rounded-lg border border-rose-400/30 bg-panel/50 p-3">
      {hasCandidates ? (
        <p className="text-xs text-ink-soft">
          候选均不正确？可直接新增这首歌曲。
        </p>
      ) : null}
      <label className="grid gap-1 text-xs">
        歌曲分类
        <select
          form="setlist-import-form"
          name={`quickAddCategory:${lineNumber}`}
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as SongCategory)
          }
          className="min-h-10 rounded-lg border border-border-soft bg-panel-strong px-3 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        >
          <option value="cover">翻唱曲</option>
          <option value="project-common">企划共通</option>
          <option value="original">乐队原创曲</option>
        </select>
      </label>
      {category === "original" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs">
            乐队
            <select
              form="setlist-import-form"
              name={`quickAddBandSlug:${lineNumber}`}
              defaultValue={bandOptions[0]?.slug ?? ""}
              className="min-h-10 rounded-lg border border-border-soft bg-panel-strong px-3 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              {bandOptions.map((band) => (
                <option key={band.slug} value={band.slug}>
                  {band.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            发行日期
            <input
              form="setlist-import-form"
              type="date"
              name={`quickAddReleaseDate:${lineNumber}`}
              className="min-h-10 rounded-lg border border-border-soft bg-panel-strong px-3 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        </div>
      ) : null}
      <button
        form="setlist-import-form"
        type="submit"
        name="intent"
        value={`quick-add:${lineNumber}`}
        disabled={pending}
        className="inline-flex min-h-10 items-center justify-center rounded-lg bg-foreground px-4 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "处理中..." : "新增歌曲并继续匹配"}
      </button>
    </div>
  );
}

export function SetlistImportForm({
  action,
  defaultEventInput = "",
  defaultSetlistText = "",
  existingRecord = false,
  existingEventTitle = null,
  bandOptions,
}: SetlistImportFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [eventInput, setEventInput] = useState(defaultEventInput);
  const [setlistText, setSetlistText] = useState(defaultSetlistText);
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [spotifyImporting, setSpotifyImporting] = useState(false);
  const [spotifyMessage, setSpotifyMessage] = useState<string | null>(null);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);

  const treatsAsExisting = existingRecord || Boolean(state.existingRecord);

  function handleStripNumbering() {
    setSetlistText((prev) =>
      prev
        .split(/\r?\n/u)
        .map(stripSetlistNumbering)
        .filter((line) => line.length > 0)
        .join("\n"),
    );
  }

  async function handleSpotifyImport() {
    const trimmedSpotifyUrl = spotifyUrl.trim();
    if (!trimmedSpotifyUrl) {
      setSpotifyError("请先粘贴 Spotify 链接。");
      setSpotifyMessage(null);
      return;
    }

    setSpotifyImporting(true);
    setSpotifyError(null);
    setSpotifyMessage(null);

    try {
      const response = await fetch("/admin/spotify-setlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: trimmedSpotifyUrl }),
      });
      const payload = (await response.json()) as {
        error?: string;
        sourceTitle?: string;
        tracks?: string[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Spotify 解析失败。");
      }

      const tracks = payload.tracks ?? [];
      if (tracks.length === 0) {
        throw new Error("没有从 Spotify 链接中解析到歌曲。");
      }

      const nextText = tracks.join("\n");
      setSetlistText((prev) => (prev.trim().length > 0 ? `${prev.trimEnd()}\n${nextText}` : nextText));
      setSpotifyMessage(`已从 ${payload.sourceTitle ?? "Spotify"} 导入 ${tracks.length} 首歌。`);
    } catch (error) {
      setSpotifyError(error instanceof Error ? error.message : "Spotify 解析失败。");
    } finally {
      setSpotifyImporting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-[1.75rem] border border-border-soft bg-panel p-6">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold tracking-[-0.04em] text-foreground">歌单导入</h1>
        <p className="text-sm text-ink-soft">
          填写 Eventernote 链接或数字 event 号；歌单每行一首。点击提交会先校验，全部匹配后自动写入。
        </p>
        {existingRecord ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            已加载数据库中的 setlist
            {existingEventTitle ? `（${existingEventTitle}）` : ""}。点击“确认并替换”后将直接整场替换。
          </p>
        ) : null}
      </div>

      <form
        id="setlist-import-form"
        action={formAction}
        className="flex flex-col gap-4"
      >
        <input
          type="hidden"
          name="confirmOverwrite"
          value={treatsAsExisting ? "1" : "0"}
          readOnly
        />
        <label className="flex flex-col gap-2 text-sm text-foreground">
          Eventernote 链接或 event 号
          <input
            required
            name="eventInput"
            value={eventInput}
            onChange={(event) => {
              setEventInput(event.target.value);
            }}
            placeholder="https://www.eventernote.com/events/1142 或 1142"
            className="min-h-11 rounded-xl border border-border-soft bg-panel-strong px-4 outline-none placeholder:text-ink-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>

        <div className="flex flex-col gap-2 text-sm text-foreground">
          Spotify 链接导入
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={spotifyUrl}
              onChange={(event) => {
                setSpotifyUrl(event.target.value);
              }}
              placeholder="https://open.spotify.com/playlist/..."
              className="min-h-11 flex-1 rounded-xl border border-border-soft bg-panel-strong px-4 outline-none placeholder:text-ink-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="button"
              onClick={handleSpotifyImport}
              disabled={spotifyImporting}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-soft bg-panel-strong px-4 text-sm font-medium text-foreground transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {spotifyImporting ? "解析中..." : "解析并填入"}
            </button>
          </div>
          {spotifyMessage ? <p className="text-xs text-emerald-700 dark:text-emerald-200">{spotifyMessage}</p> : null}
          {spotifyError ? <p className="text-xs text-rose-700 dark:text-rose-200">{spotifyError}</p> : null}
        </div>

        <label className="flex flex-col gap-2 text-sm text-foreground">
          歌单（每行一首）
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleStripNumbering}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border-soft bg-panel-strong px-3 text-xs text-ink-soft transition hover:border-accent hover:text-foreground"
            >
              清除标号
            </button>
          </div>
          <textarea
            required
            name="setlistText"
            value={setlistText}
            onChange={(event) => {
              setSetlistText(event.target.value);
            }}
            rows={14}
            placeholder={"STAR BEAT!\nNO GIRL NO CRY\nFreedom"}
            className="rounded-xl border border-border-soft bg-panel-strong px-4 py-3 font-mono text-sm outline-none placeholder:text-ink-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-foreground px-5 font-medium text-background transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "提交中..." : treatsAsExisting ? "确认并替换" : "提交"}
        </button>
      </form>

      {state.message ? (
        <div
          className={
            state.status === "success"
              ? "rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-3 text-sm font-medium text-black dark:text-emerald-100"
              : "rounded-xl border border-amber-500/40 bg-amber-500/20 px-4 py-3 text-sm font-medium text-black dark:text-amber-100"
          }
        >
          {state.message}
        </div>
      ) : null}

      {state.eventernoteEventId ? (
        <div className="rounded-xl border border-border-soft bg-panel-strong px-4 py-3 text-sm text-ink-soft">
          <p>
            Event #{state.eventernoteEventId} {state.eventTitle ? `- ${state.eventTitle}` : ""}
          </p>
          <p>
            日期: {state.eventDate ?? "未知"} | 场地: {state.venue ?? "未知"}
          </p>
        </div>
      ) : null}

      {state.resolutionLines && state.resolutionLines.length > 0 ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/20 px-4 py-3 text-sm font-medium text-black dark:text-rose-100">
          <p className="mb-3 font-medium">
            以下行需要绑定具体曲库记录：
          </p>
          <ul className="space-y-4">
            {state.resolutionLines.map((item) => (
              <li
                key={`${item.lineNumber}-${item.value}`}
                className="space-y-2"
              >
                <p>
                  第 {item.lineNumber} 行：{item.value}
                </p>
                {item.candidates.length > 0 ? (
                  <div className="grid gap-2">
                    {item.candidates.map((candidate) => (
                      <label
                        key={candidate.songId}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-rose-400/30 bg-panel/50 px-3 py-2 text-xs"
                      >
                        <input
                          form="setlist-import-form"
                          type="radio"
                          name={`songResolution:${item.lineNumber}`}
                          value={candidate.songId}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-medium">
                            {candidate.title}
                          </span>
                          <span className="ml-2 opacity-75">
                            {candidate.category === "original"
                              ? "原创"
                              : candidate.category === "cover"
                                ? "翻唱"
                                : "企划共通"}
                            {candidate.bandLabel
                              ? ` · ${candidate.bandLabel}`
                              : ""}
                            {` · 相似度 ${(candidate.score * 100).toFixed(0)}%`}
                          </span>
                        </span>
                      </label>
                    ))}
                    <QuickAddSongControls
                      lineNumber={item.lineNumber}
                      bandOptions={bandOptions}
                      pending={pending}
                      hasCandidates
                    />
                  </div>
                ) : (
                  <QuickAddSongControls
                    lineNumber={item.lineNumber}
                    bandOptions={bandOptions}
                    pending={pending}
                    hasCandidates={false}
                  />
                )}
              </li>
            ))}
          </ul>
          {state.resolutionLines.every(
            (item) => item.candidates.length > 0,
          ) ? (
            <button
              form="setlist-import-form"
              type="submit"
              disabled={pending}
              className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "提交中..." : "使用所选曲目并重新提交"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
} from "react";
import { getBandTextColor } from "@/lib/constants/bands";
import type { CopyDefinition } from "@/lib/i18n";
import type { LiveSetlist } from "@/lib/live-setlist/types";
import { buildLiveSetlistHref } from "@/lib/live-setlist/url";
import type { SongEventReference } from "@/lib/stats/aggregate";

export function LiveSetlistResult({
  live,
  copy,
}: {
  live: LiveSetlist;
  copy: CopyDefinition;
}) {
  const [activeEntryKey, setActiveEntryKey] = useState<string | null>(null);
  const [songEventsBySongId, setSongEventsBySongId] = useState<
    Record<number, SongEventReference[]>
  >({});
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const songIds = useMemo(
    () => [
      ...new Set(
        live.entries.flatMap((entry) =>
          entry.songId === null ? [] : [entry.songId],
        ),
      ),
    ],
    [live.entries],
  );
  const solePerformingBand =
    live.performingBands?.length === 1
      ? live.performingBands[0]
      : null;

  async function loadSongEvents() {
    if (eventsLoaded || eventsLoading || songIds.length === 0) {
      return;
    }

    setEventsLoading(true);
    try {
      const response = await fetch(
        `/api/song-events?songIds=${songIds.join(",")}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        songEventsBySongId: Record<string, SongEventReference[]>;
      };
      setSongEventsBySongId(
        Object.fromEntries(
          Object.entries(payload.songEventsBySongId).map(
            ([songId, events]) => [Number(songId), events],
          ),
        ),
      );
      setEventsLoaded(true);
    } catch (error) {
      console.error("Failed to load song events", error);
    } finally {
      setEventsLoading(false);
    }
  }

  function handleSongClick(entryKey: string) {
    void loadSongEvents();
    setActiveEntryKey((current) =>
      current === entryKey ? null : entryKey,
    );
  }

  return (
    <section className="mt-8 rounded-[1.15rem] border border-border-soft bg-panel px-5 py-6 sm:px-6">
      <h2 className="font-heading text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
        <a
          href={`https://www.eventernote.com/events/${live.eventernoteEventId}`}
          target="_blank"
          rel="noreferrer"
          className="transition hover:text-accent"
        >
          {live.title}
        </a>
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        {live.eventDate}
        <span className="mx-1.5">·</span>
        {live.venue ?? copy.venueMissing}
      </p>
      {(live.performingBands ?? []).length > 0 ? (
        <p className="mt-2 text-sm text-foreground">
          <span className="inline-flex flex-wrap items-center gap-x-1">
            {(live.performingBands ?? []).map((band, index) => {
              const textColor = getBandTextColor(band.slug);

              return (
                <span
                  key={`${live.eventernoteEventId}-${band.slug}-${index}`}
                >
                  {index > 0 ? (
                    <span className="mx-0.5 text-ink-soft">·</span>
                  ) : null}
                  <span
                    style={textColor ? { color: textColor } : undefined}
                  >
                    {band.name}
                  </span>
                </span>
              );
            })}
          </span>
        </p>
      ) : null}

      <ol className="mt-4 divide-y divide-border-soft border-y border-border-soft">
        {live.entries.map((entry) => {
          const textColor = entry.bandSlug
            ? getBandTextColor(entry.bandSlug)
            : null;
          const currentEventTextColor =
            textColor ??
            (solePerformingBand
              ? getBandTextColor(solePerformingBand.slug)
              : null);
          const entryKey = `${entry.position}-${entry.title}`;
          const isActive = activeEntryKey === entryKey;
          const relatedEvents =
            entry.songId === null
              ? []
              : songEventsBySongId[entry.songId] ?? [];

          return (
            <li
              key={`${entry.position}-${entry.title}`}
              className="relative grid grid-cols-[2.5rem_1fr] gap-1.5 py-1.5 text-sm leading-6 sm:py-2"
              style={textColor ? { color: textColor } : undefined}
            >
              <span className="text-right tabular-nums opacity-70">
                {entry.isFirstPerformance ? "*" : ""}
                {entry.position}.
              </span>
              <button
                type="button"
                disabled={entry.songId === null}
                aria-expanded={entry.songId === null ? undefined : isActive}
                onClick={
                  entry.songId === null
                    ? undefined
                    : () => handleSongClick(entryKey)
                }
                className="flex min-w-0 items-center rounded-md text-left transition enabled:cursor-pointer enabled:hover:bg-panel-strong disabled:cursor-default"
              >
                <span className="min-w-0">{entry.title}</span>
                {entry.category === "cover" ? (
                  <span className="ml-2 inline-flex shrink-0 rounded-full border border-current/20 px-1.5 py-0.5 text-xs font-medium leading-none opacity-75">
                    {copy.coverSongBadge}
                  </span>
                ) : null}
              </button>
              {isActive ? (
                <div className="absolute left-0 top-full z-20 mt-2 max-w-full rounded-[1rem] border border-border-soft bg-panel px-3 py-3 text-left font-normal text-foreground shadow-lg sm:left-[2.875rem] sm:min-w-[24rem] sm:max-w-[calc(100%-2.875rem)]">
                  {relatedEvents.length > 0 ? (
                    <>
                      {entry.firstReleaseDate ? (
                        <p className="text-xs text-ink-soft">
                          {copy.releaseDateLabel(entry.firstReleaseDate)}
                        </p>
                      ) : null}
                      <p
                        className={`text-xs text-ink-soft ${
                          entry.firstReleaseDate ? "mt-1.5" : ""
                        }`}
                      >
                        {copy.relatedEventsLabel(relatedEvents.length)}
                      </p>
                      <div className="mt-1.5 space-y-1.5">
                        {relatedEvents.map((event) => (
                          <Link
                            key={`${entry.songId}-${event.eventernoteEventId}`}
                            href={buildLiveSetlistHref(
                              event.eventernoteEventId,
                            )}
                            className="block text-sm leading-5 transition hover:opacity-80"
                            style={
                              event.eventernoteEventId ===
                                live.eventernoteEventId &&
                              currentEventTextColor
                                ? {
                                    color: currentEventTextColor,
                                  }
                                : undefined
                            }
                          >
                            <span className="font-medium">
                              {event.eventDate}
                            </span>
                            <span className="mx-1.5 text-ink-soft">·</span>
                            <span>{event.title}</span>
                          </Link>
                        ))}
                      </div>
                    </>
                  ) : !eventsLoaded || eventsLoading ? (
                    <p className="text-sm text-ink-soft">
                      {copy.loadingEvents}
                    </p>
                  ) : (
                    <p className="text-sm text-ink-soft">
                      {copy.noSongEvents}
                    </p>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

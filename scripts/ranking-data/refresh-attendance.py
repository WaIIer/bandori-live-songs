"""Refresh Eventernote attendance and publish the ranking dataset."""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIRECTORY = REPOSITORY_ROOT / ".ranking-data-cache"
PUBLIC_DATA_DIRECTORY = REPOSITORY_ROOT / "public/ranking-data"
REFERENCE_CACHE_PATH = CACHE_DIRECTORY / "bandori-public-api-cache.json"
ATTENDANCE_CACHE_PATH = CACHE_DIRECTORY / "event-attendance.json"
DETAILS_PATH = PUBLIC_DATA_DIRECTORY / "profile-details.json"
ATTENDANCE_PATH = PUBLIC_DATA_DIRECTORY / "event-attendance.json"
RESULTS_PATH = PUBLIC_DATA_DIRECTORY / "all-bandori-results.csv"
REQUEST_ATTEMPTS = 4
RETRY_DELAY_SECONDS = 1.5
DEFAULT_WORKERS = 12
ATTENDEE_PAGE_SIZE = 750
USER_AGENT = "Mozilla/5.0 (compatible; bandori-live-songs-ranking-refresh/1.0)"
TOTAL_ATTENDEES_RE = re.compile(r'<span class="number">(\d+)</span>人')
ATTENDEE_LINK_RE = re.compile(r'<p class="img"><a href="/users/([^"/]+)/')


def fetch_text(url: str, timeout: int = 30) -> str:
    last_error: Exception | None = None
    for attempt in range(1, REQUEST_ATTEMPTS + 1):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "ja,en-US;q=0.9"})
            with urlopen(request, timeout=timeout) as response:
                return response.read().decode("utf-8", errors="replace")
        except (HTTPError, URLError, TimeoutError) as error:
            last_error = error
            if attempt < REQUEST_ATTEMPTS:
                time.sleep(RETRY_DELAY_SECONDS * attempt)
    raise RuntimeError(f"Request failed for {url}: {last_error}")


def load_reference_data() -> tuple[list[dict[str, object]], list[dict[str, object]], dict[int, dict[str, object]]]:
    if not REFERENCE_CACHE_PATH.exists():
        raise RuntimeError("Reference cache not found. Run refresh-reference.py first.")
    cached = json.loads(REFERENCE_CACHE_PATH.read_text(encoding="utf-8"))
    if cached.get("version") != 4:
        raise RuntimeError("Reference cache is outdated. Run refresh-reference.py first.")
    return (
        list(cached["eligibleSongs"]),
        list(cached["catalogSongs"]),
        {int(event_id): detail for event_id, detail in cached["events"].items()},
    )


def load_attendance() -> dict[str, object]:
    if ATTENDANCE_CACHE_PATH.exists():
        attendance = json.loads(ATTENDANCE_CACHE_PATH.read_text(encoding="utf-8"))
        attendance.setdefault("events", {})
        attendance.setdefault("errors", {})
        attendance.setdefault("reportedCounts", {})
        return attendance
    return {"version": 3, "events": {}, "errors": {}, "reportedCounts": {}}


def save_attendance(attendance: dict[str, object]) -> None:
    CACHE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    PUBLIC_DATA_DIRECTORY.mkdir(parents=True, exist_ok=True)
    contents = json.dumps(attendance, ensure_ascii=False)
    ATTENDANCE_CACHE_PATH.write_text(contents, encoding="utf-8")
    ATTENDANCE_PATH.write_text(contents, encoding="utf-8")


def fetch_event_attendance(event_id: int) -> dict[str, object]:
    base_url = f"https://www.eventernote.com/events/{event_id}/users"
    first_page = fetch_text(f"{base_url}?event_id={event_id}&limit={ATTENDEE_PAGE_SIZE}&page=1")
    total_match = TOTAL_ATTENDEES_RE.search(first_page)
    if not total_match:
        raise RuntimeError("Eventernote did not return an attendee count.")
    total_attendees = int(total_match.group(1))
    attendees = set(ATTENDEE_LINK_RE.findall(first_page))
    page_count = max(1, math.ceil(total_attendees / ATTENDEE_PAGE_SIZE))
    for page_number in range(2, page_count + 1):
        page_html = fetch_text(f"{base_url}?event_id={event_id}&limit={ATTENDEE_PAGE_SIZE}&page={page_number}")
        attendees.update(ATTENDEE_LINK_RE.findall(page_html))
    difference = total_attendees - len(attendees)
    if difference < 0 or difference > 1:
        raise RuntimeError(f"Expected {total_attendees} attendees, parsed {len(attendees)}.")
    return {"attendees": sorted(attendees), "reportedAttendeeCount": total_attendees}


def write_outputs(
    songs: list[dict[str, object]],
    catalog_songs: list[dict[str, object]],
    events: dict[int, dict[str, object]],
    attendance: dict[str, object],
) -> None:
    PUBLIC_DATA_DIRECTORY.mkdir(parents=True, exist_ok=True)
    eligible_song_ids = {int(song["id"]) for song in songs}
    bands: dict[str, dict[str, object]] = {}
    for song in songs:
        slug = str(song["bandSlug"])
        band = bands.setdefault(slug, {"slug": slug, "name": song.get("bandName", slug), "total": 0})
        band["total"] = int(band["total"]) + 1

    attendee_lists = attendance["events"]
    user_event_ids: dict[str, set[int]] = {}
    for event_id_text, attendees in attendee_lists.items():
        event_id = int(event_id_text)
        if event_id not in events:
            continue
        for user in attendees:
            user_event_ids.setdefault(str(user), set()).add(event_id)

    catalog_band_names = {
        str(song["bandSlug"]): str(song["bandName"])
        for song in catalog_songs
        if song.get("bandSlug") and song.get("bandName")
    }
    detailed_events: dict[int, dict[str, object]] = {}
    for event_id, event in events.items():
        performing_band_slugs = [str(slug) for slug in event.get("performingBandSlugs", [])]
        performing_band_names = [catalog_band_names.get(slug, slug) for slug in performing_band_slugs]
        detailed_events[event_id] = {
            **event,
            "performingBandSlugs": performing_band_slugs,
            "performingBandNames": performing_band_names,
            "attendeeCount": len(attendee_lists.get(str(event_id), [])),
        }

    catalog_song_ids = {int(song["id"]) for song in catalog_songs}
    performed_bands_by_song_id = {song_id: set() for song_id in catalog_song_ids}
    for event in events.values():
        for song_id in event.get("heardSongIds", []):
            normalized_song_id = int(song_id)
            if normalized_song_id in performed_bands_by_song_id:
                performed_bands_by_song_id[normalized_song_id].update(event.get("performingBandSlugs", []))
    enriched_catalog_songs = [
        {
            **song,
            "performedBandSlugs": sorted(performed_bands_by_song_id[int(song["id"])]),
            "performedBandNames": [
                catalog_band_names.get(slug, slug)
                for slug in sorted(performed_bands_by_song_id[int(song["id"])])
            ],
        }
        for song in catalog_songs
    ]

    profiles: dict[str, object] = {}
    rows: list[dict[str, object]] = []
    user_catalog_song_ids: dict[str, set[int]] = {}
    for user, event_ids in user_event_ids.items():
        heard_song_ids = {
            int(song_id)
            for event_id in event_ids
            for song_id in events[event_id].get("heardSongIds", [])
        }
        eligible_heard_song_ids = heard_song_ids & eligible_song_ids
        band_summaries = []
        for slug, band in bands.items():
            total = int(band["total"])
            heard = sum(1 for song in songs if song["bandSlug"] == slug and int(song["id"]) in eligible_heard_song_ids)
            band_summaries.append({**band, "listened": heard, "percentage": heard / total * 100 if total else 0})
        profiles[user] = {
            "user": user,
            "heardSongIds": sorted(eligible_heard_song_ids),
            "matchedEventIds": sorted(event_ids),
            "bands": sorted(band_summaries, key=lambda band: str(band["name"])),
        }
        rows.append({
            "user": user,
            "listened": len(eligible_heard_song_ids),
            "total": len(eligible_song_ids),
            "percentage": len(eligible_heard_song_ids) / len(eligible_song_ids) * 100 if eligible_song_ids else 0,
            "hits": len(event_ids),
            "status": "ok",
        })
        user_catalog_song_ids[user] = heard_song_ids

    song_audience = []
    for song in enriched_catalog_songs:
        song_id = int(song["id"])
        song_audience.append({
            "id": song_id,
            "title": song["title"],
            "bandSlug": song.get("bandSlug"),
            "bandName": song.get("bandName"),
            "category": song.get("category"),
            "firstReleaseDate": song.get("firstReleaseDate"),
            "uniqueAttendees": sum(song_id in song_ids for song_ids in user_catalog_song_ids.values()),
            "indexedEventCount": sum(song_id in event.get("heardSongIds", []) for event in events.values()),
        })
    song_audience.sort(key=lambda song: (-int(song["uniqueAttendees"]), -int(song["indexedEventCount"]), str(song["title"])))

    details = {
        "version": 4,
        "population": "all unique Eventernote attendees across cached Bandori events",
        "filters": {
            "includeVirtualBands": True,
            "hideUnplayedSongs": True,
            "completionSongCategory": "original",
        },
        "coverage": {
            "indexedEvents": len(events),
            "eventsWithAttendanceFetched": len(attendee_lists),
            "uniqueUsers": len(profiles),
            "completionSongs": len(songs),
            "liveCatalogSongs": len(enriched_catalog_songs),
            "liveCoverSongs": sum(song.get("category") == "cover" for song in enriched_catalog_songs),
        },
        "songs": songs,
        "catalogSongs": enriched_catalog_songs,
        "events": detailed_events,
        "profiles": profiles,
        "analytics": {"songAudience": song_audience},
    }
    DETAILS_PATH.write_text(json.dumps(details, ensure_ascii=False), encoding="utf-8")

    rows.sort(key=lambda row: (-float(row["percentage"]), -int(row["hits"]), str(row["user"]).casefold()))
    with RESULTS_PATH.open("w", encoding="utf-8", newline="") as result_file:
        writer = csv.DictWriter(result_file, fieldnames=["user", "listened", "total", "percentage", "hits", "status"])
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Refetch attendance for every indexed event instead of only new events.")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Concurrent Eventernote requests.")
    arguments = parser.parse_args()

    songs, catalog_songs, events = load_reference_data()
    attendance = load_attendance()
    cached_event_ids = {int(event_id) for event_id in attendance["events"]}
    pending_event_ids = list(events) if arguments.refresh else [event_id for event_id in events if event_id not in cached_event_ids]
    print(
        f"Fetching attendance for {len(pending_event_ids)} events; {len(cached_event_ids)} cached.",
        flush=True,
    )

    with ThreadPoolExecutor(max_workers=max(1, arguments.workers)) as executor:
        futures = {executor.submit(fetch_event_attendance, event_id): event_id for event_id in pending_event_ids}
        for index, future in enumerate(as_completed(futures), start=1):
            event_id = futures[future]
            try:
                event_attendance = future.result()
                attendance["events"][str(event_id)] = event_attendance["attendees"]
                attendance["reportedCounts"][str(event_id)] = event_attendance["reportedAttendeeCount"]
                attendance["errors"].pop(str(event_id), None)
            except RuntimeError as error:
                attendance["errors"][str(event_id)] = str(error)
            if index % max(1, arguments.workers) == 0 or index == len(pending_event_ids):
                save_attendance(attendance)
                print(f"Fetched {index}/{len(pending_event_ids)} event attendee lists.", flush=True)

    save_attendance(attendance)
    write_outputs(songs, catalog_songs, events, attendance)
    print(
        f"Published {len(attendance['events'])} attendee lists and {len(json.loads(DETAILS_PATH.read_text(encoding='utf-8'))['profiles'])} eventers.",
        flush=True,
    )


if __name__ == "__main__":
    main()
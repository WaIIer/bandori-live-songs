"""Refresh the Bandori public song, event, and setlist cache for rankings."""

from __future__ import annotations

import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIRECTORY = REPOSITORY_ROOT / ".ranking-data-cache"
REFERENCE_CACHE_PATH = CACHE_DIRECTORY / "bandori-public-api-cache.json"
EVENT_RULES_PATH = REPOSITORY_ROOT / "src/data/event-visibility-rules.json"
PUBLIC_API_BASE_URL = "https://bandori.live/api/v1"
REQUEST_ATTEMPTS = 4
RETRY_DELAY_SECONDS = 1.5
DEFAULT_WORKERS = 12
USER_AGENT = "Mozilla/5.0 (compatible; bandori-live-songs-ranking-refresh/1.0)"


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


def fetch_json(path: str) -> dict[str, object]:
    return json.loads(fetch_text(f"{PUBLIC_API_BASE_URL}{path}"))


def is_hidden_event(event: dict[str, object], hidden_keywords: tuple[str, ...], hidden_ids: set[int]) -> bool:
    event_id = int(event["eventernoteEventId"])
    title = str(event["title"]).casefold()
    return event_id in hidden_ids or any(keyword.casefold() in title for keyword in hidden_keywords)


def load_cached_events() -> dict[int, dict[str, object]]:
    if not REFERENCE_CACHE_PATH.exists():
        return {}
    cached = json.loads(REFERENCE_CACHE_PATH.read_text(encoding="utf-8"))
    if cached.get("version") not in {3, 4}:
        return {}
    return {int(event_id): detail for event_id, detail in cached.get("events", {}).items()}


def fetch_event_detail(event: dict[str, object]) -> tuple[int, dict[str, object]]:
    event_id = int(event["eventernoteEventId"])
    detail = fetch_json(f"/events/{event_id}").get("data", {})
    heard_song_ids = [
        int(entry["song"]["id"])
        for entry in detail.get("setlist", [])
        if entry.get("song")
    ]
    return event_id, {**event, "heardSongIds": heard_song_ids}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh-setlists", action="store_true", help="Refetch setlists for events already present in the local cache.")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Concurrent public API requests.")
    arguments = parser.parse_args()

    CACHE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    songs = list(fetch_json("/songs?limit=1000").get("data", []))
    events = list(fetch_json("/events?limit=1000").get("data", []))
    bands = {
        str(band["slug"]): band
        for band in fetch_json("/bands").get("data", [])
    }
    catalog_songs = [
        {**song, "bandName": bands.get(str(song["bandSlug"]), {}).get("nameJa", song["bandSlug"])}
        for song in songs
        if song.get("hasBeenPlayedLive")
    ]
    eligible_songs = [song for song in catalog_songs if song.get("category") == "original"]

    rules = json.loads(EVENT_RULES_PATH.read_text(encoding="utf-8"))
    today = date.today().isoformat()
    indexed_events = [
        event
        for event in events
        if str(event.get("eventDate", "")) <= today
        and not is_hidden_event(
            event,
            tuple(rules["hiddenTitleKeywords"]),
            set(rules["hiddenEventernoteEventIds"]),
        )
    ]
    cached_events = load_cached_events()
    details: dict[int, dict[str, object]] = {}
    pending_events: list[dict[str, object]] = []
    for event in indexed_events:
        event_id = int(event["eventernoteEventId"])
        cached = cached_events.get(event_id)
        if cached and not arguments.refresh_setlists and "heardSongIds" in cached:
            details[event_id] = {**cached, **event}
        else:
            pending_events.append(event)

    print(
        f"Refreshing {len(pending_events)} event setlists; {len(details)} reused from cache.",
        flush=True,
    )
    with ThreadPoolExecutor(max_workers=max(1, arguments.workers)) as executor:
        futures = [executor.submit(fetch_event_detail, event) for event in pending_events]
        for index, future in enumerate(as_completed(futures), start=1):
            event_id, detail = future.result()
            details[event_id] = detail
            if index % max(1, arguments.workers) == 0 or index == len(pending_events):
                print(f"Fetched {index}/{len(pending_events)} event setlists.", flush=True)

    reference_data = {
        "version": 4,
        "refreshedAt": date.today().isoformat(),
        "eligibleSongs": eligible_songs,
        "catalogSongs": catalog_songs,
        "events": details,
    }
    REFERENCE_CACHE_PATH.write_text(json.dumps(reference_data, ensure_ascii=False), encoding="utf-8")
    print(
        f"Cached {len(eligible_songs)} original completion songs, {len(catalog_songs)} live catalog songs, and {len(details)} indexed events.",
        flush=True,
    )


if __name__ == "__main__":
    main()
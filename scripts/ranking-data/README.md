# Ranking Data Refresh

The ranking page reads its generated files from `public/ranking-data`.

Run a normal incremental refresh with:

```powershell
npm run data:refresh:ranking
```

The reference stage refreshes the public Bandori song and event index, then fetches setlists only for new events. The attendee stage fetches Eventernote attendance only for events not already cached.

Use these direct commands when a full refresh is needed:

```powershell
python scripts/ranking-data/refresh-reference.py --refresh-setlists
python scripts/ranking-data/refresh-attendance.py --refresh
```

The scripts use only Python's standard library. Their request cache lives in `.ranking-data-cache`, which is intentionally ignored by Git. Commit the changed files in `public/ranking-data` after reviewing the refresh.
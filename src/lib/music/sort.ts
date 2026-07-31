/**
 * Shared comparators for sorting songs.
 */

type SongLike = {
  firstReleaseDate: string | null;
  title: string;
};

type BandSongLike = SongLike & {
  bandDisplayOrder: number | null;
};

/** Ascending by firstReleaseDate, then ascending by title (ja locale). */
export function compareSongsByReleaseDate(left: SongLike, right: SongLike) {
  const dateCompare = (left.firstReleaseDate ?? "9999-12-31").localeCompare(
    right.firstReleaseDate ?? "9999-12-31",
  );
  if (dateCompare !== 0) {
    return dateCompare;
  }

  return left.title.localeCompare(right.title, "ja");
}

/** Ascending by bandDisplayOrder, then by firstReleaseDate, then by title (ja locale). */
export function compareSongsByBandThenReleaseDate(left: BandSongLike, right: BandSongLike) {
  const bandCompare =
    (left.bandDisplayOrder ?? Number.MAX_SAFE_INTEGER) -
    (right.bandDisplayOrder ?? Number.MAX_SAFE_INTEGER);
  if (bandCompare !== 0) {
    return bandCompare;
  }

  return compareSongsByReleaseDate(left, right);
}

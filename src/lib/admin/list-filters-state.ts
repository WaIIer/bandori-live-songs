import type { AdminListSetlistStatus } from "@/lib/admin/list-event-filters";

export const adminListFiltersStorageKey = "admin-list-filters";
export const adminListFiltersCookieName = adminListFiltersStorageKey;
export const adminListFiltersMaxAgeSeconds = 31536000;

export type PersistedAdminListFilters = {
  selectedStatus: AdminListSetlistStatus;
  selectedYears: string[];
  selectedBandSlugs: string[];
  hideSonglessActivities: boolean;
  hideFutureEvents: boolean;
};

export const defaultAdminListFilters: PersistedAdminListFilters = {
  selectedStatus: "all",
  selectedYears: [],
  selectedBandSlugs: [],
  hideSonglessActivities: false,
  hideFutureEvents: true,
};

function isAdminListSetlistStatus(value: unknown): value is AdminListSetlistStatus {
  return value === "all" || value === "missing" || value === "partial" || value === "complete";
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item): item is string => typeof item === "string"))];
}

export function parsePersistedAdminListFilters(value: string | undefined): PersistedAdminListFilters {
  if (!value) {
    return { ...defaultAdminListFilters };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { ...defaultAdminListFilters };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ...defaultAdminListFilters };
  }

  const candidate = parsed as Partial<PersistedAdminListFilters>;
  return {
    selectedStatus: isAdminListSetlistStatus(candidate.selectedStatus)
      ? candidate.selectedStatus
      : defaultAdminListFilters.selectedStatus,
    selectedYears: readStringArray(candidate.selectedYears),
    selectedBandSlugs: readStringArray(candidate.selectedBandSlugs),
    hideSonglessActivities:
      typeof candidate.hideSonglessActivities === "boolean"
        ? candidate.hideSonglessActivities
        : defaultAdminListFilters.hideSonglessActivities,
    hideFutureEvents:
      typeof candidate.hideFutureEvents === "boolean"
        ? candidate.hideFutureEvents
        : defaultAdminListFilters.hideFutureEvents,
  };
}

export function serializePersistedAdminListFilters(filters: PersistedAdminListFilters) {
  return JSON.stringify(filters);
}

export function sanitizePersistedAdminListFilters(
  filters: PersistedAdminListFilters,
  availableYears: Iterable<string>,
  availableBandSlugs: Iterable<string>,
) {
  const yearSet = new Set(availableYears);
  const bandSlugSet = new Set(availableBandSlugs);

  return {
    ...filters,
    selectedYears: filters.selectedYears.filter((year) => yearSet.has(year)),
    selectedBandSlugs: filters.selectedBandSlugs.filter((slug) => bandSlugSet.has(slug)),
  };
}

export function decodeAdminListFiltersCookie(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

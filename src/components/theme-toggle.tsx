"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { navPillOutline } from "@/components/nav-pill";
import { cnCopy } from "@/lib/i18n/cn";
import type { CopyDefinition } from "@/lib/i18n";

const storageKey = "bdr-theme";

const options = [
  { value: "light", Icon: SunIcon },
  { value: "system", Icon: MonitorIcon },
  { value: "dark", Icon: MoonIcon },
] as const;

type ThemePreference = (typeof options)[number]["value"];
type ThemeToggleLabels = {
  ariaLabel: string;
  light: string;
  system: string;
  dark: string;
};

const mediaQuery = "(prefers-color-scheme: dark)";
const fallbackTheme: ThemePreference = "system";

const themeListeners = new Set<() => void>();

function isThemePreference(value: string | undefined | null): value is ThemePreference {
  return value === "light" || value === "system" || value === "dark";
}

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  const resolved =
    theme === "system" ? (window.matchMedia(mediaQuery).matches ? "dark" : "light") : theme;

  root.dataset.theme = resolved;
  root.dataset.themePreference = theme;

  if (theme === "system") {
    window.localStorage.removeItem(storageKey);
  } else {
    window.localStorage.setItem(storageKey, theme);
  }
}

function getThemePreferenceSnapshot(): ThemePreference {
  if (typeof document === "undefined") {
    return fallbackTheme;
  }

  const datasetTheme = document.documentElement.dataset.themePreference;
  if (isThemePreference(datasetTheme)) {
    return datasetTheme;
  }

  const storedTheme = window.localStorage.getItem(storageKey);
  return isThemePreference(storedTheme) ? storedTheme : fallbackTheme;
}

function notifyThemeListeners() {
  for (const listener of themeListeners) {
    listener();
  }
}

function subscribeThemePreference(listener: () => void) {
  themeListeners.add(listener);

  const media = window.matchMedia(mediaQuery);
  const handleMediaChange = () => {
    if (getThemePreferenceSnapshot() === "system") {
      applyTheme("system");
      notifyThemeListeners();
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) {
      notifyThemeListeners();
    }
  };

  media.addEventListener("change", handleMediaChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    themeListeners.delete(listener);
    media.removeEventListener("change", handleMediaChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function ThemeToggle({
  copy = cnCopy,
  labels: customLabels,
}: {
  copy?: CopyDefinition;
  labels?: ThemeToggleLabels;
}) {
  const theme = useSyncExternalStore(
    subscribeThemePreference,
    getThemePreferenceSnapshot,
    () => fallbackTheme,
  );
  const labels: Record<ThemePreference, string> = customLabels
    ? {
        light: customLabels.light,
        system: customLabels.system,
        dark: customLabels.dark,
      }
    : {
        light: copy.themeLight,
        system: copy.themeSystem,
        dark: copy.themeDark,
      };

  return (
    <div
      className={`${navPillOutline} p-0.5`}
      role="radiogroup"
      aria-label={customLabels?.ariaLabel || copy.themeToggleAria}
    >
      {options.map((option) => {
        const active = theme === option.value;
        const label = labels[option.value];
        const Icon = option.Icon;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            data-theme-option={option.value}
            className="theme-option flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:text-foreground"
            onClick={() => {
              applyTheme(option.value);
              notifyThemeListeners();
            }}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

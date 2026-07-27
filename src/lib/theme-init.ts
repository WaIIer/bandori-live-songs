/**
 * Inline script that runs before React hydration to prevent FOUC
 * for theme (light/dark/system).
 *
 * Also installs a MutationObserver to restore the theme attributes if
 * React strips them during RSC reconciliation (e.g. after `router.refresh()`).
 */
export function buildThemeInitScript() {
  return `
(() => {
  const themeKey = "bdr-theme";

  function readTheme() {
    const saved = window.localStorage.getItem(themeKey);
    const stored = saved === "light" || saved === "dark" ? saved : "system";
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = stored === "system" ? (systemDark ? "dark" : "light") : stored;
    return { resolved, stored };
  }

  function applyTheme() {
    const { resolved, stored } = readTheme();
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = stored;
  }

  applyTheme();

  // Keep both attributes stable so CSS can paint the selected control
  // correctly without waiting for React hydration.
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (
        m.type === "attributes" &&
        (m.attributeName === "data-theme" || m.attributeName === "data-theme-preference")
      ) {
        const { resolved, stored } = readTheme();
        if (
          document.documentElement.dataset.theme !== resolved ||
          document.documentElement.dataset.themePreference !== stored
        ) {
          applyTheme();
        }
      }
    }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-theme-preference"],
  });
})();
`;
}

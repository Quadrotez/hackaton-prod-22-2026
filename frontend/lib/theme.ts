export type Theme = "light" | "dark";

export const themeStorageKey = "petcare_theme";
const themeChangeEvent = "petcare_theme_change";

// Выполняется до первой отрисовки, чтобы страница не мигала светлой перед тёмной темой.
export const themeInitScript = `(function(){try{var saved=localStorage.getItem("${themeStorageKey}");var dark=saved?saved==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(dark)document.documentElement.classList.add("dark");}catch(e){}})();`;

export function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(themeStorageKey, theme);
  } catch {
    // Тема всё равно применится до перезагрузки страницы.
  }
  document.documentElement.classList.toggle("dark", theme === "dark");
  window.dispatchEvent(new Event(themeChangeEvent));
}

export function subscribeToTheme(onChange: () => void) {
  window.addEventListener(themeChangeEvent, onChange);
  return () => window.removeEventListener(themeChangeEvent, onChange);
}

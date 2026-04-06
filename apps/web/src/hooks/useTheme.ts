import { useState, useEffect } from "react";

/** Read saved or system preference (same rules as useTheme initial state). */
export function getStoredIsDark(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem("theme");
  if (stored) return stored === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Apply theme to <html> before React mounts so routes without ThemeToggle stay consistent after refresh. */
export function applyStoredTheme(): void {
  if (typeof window === "undefined") return;
  document.documentElement.classList.toggle("dark", getStoredIsDark());
}

export function useTheme() {
  const [isDark, setIsDark] = useState(() => getStoredIsDark());

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  return { isDark, toggle: () => setIsDark((d) => !d) };
}

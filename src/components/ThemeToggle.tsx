"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "mailclean-theme";

/** Applies a theme by setting data-theme on <html>; "system" follows the OS setting. */
export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
}

/** Inline script for <head>: applies the saved theme before first paint so the page doesn't flash. */
export const themeInitScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "System", icon: <path d="M2 3h12v8H2zM6 14h4M8 11v3" /> },
  { value: "light", label: "Light", icon: <><circle cx="8" cy="8" r="3" /><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1" /></> },
  { value: "dark", label: "Dark", icon: <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" /> },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch { /* storage unavailable: stay on system */ }
  }, []);

  function choose(t: Theme) {
    setTheme(t);
    applyTheme(t);
    try {
      if (t === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch { /* not persisted */ }
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg border border-line bg-muted p-0.5">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={theme === o.value} title={o.label} aria-label={o.label}
          onClick={() => choose(o.value)}
          className={`grid h-7 w-8 place-items-center rounded-md ${theme === o.value ? "bg-card text-ink shadow-sm" : "text-subtle hover:text-ink"}`}>
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            {o.icon}
          </svg>
        </button>
      ))}
    </div>
  );
}

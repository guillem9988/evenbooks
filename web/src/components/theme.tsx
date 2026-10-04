"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useT } from "@/i18n";
import { THEME_KEY } from "@/lib/theme-script";
import { cn } from "@/lib/utils";

export type ThemePreference = "light" | "dark" | "system";

interface ThemeState {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function readPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // ignore
  }
  return "system";
}

function apply(preference: ThemePreference) {
  const dark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    setPreferenceState(readPreference());
  }, []);

  useEffect(() => {
    apply(preference);
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}

const OPTIONS = [
  ["light", SunIcon],
  ["dark", MoonIcon],
  ["system", MonitorIcon],
] as const;

export function ThemeSwitcher({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("theme.label")} className={cn("inline-flex gap-0.5 rounded-lg bg-muted p-0.5", className)}>
      {OPTIONS.map(([value, Icon]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          title={t(`theme.${value}`)}
          aria-label={t(`theme.${value}`)}
          onClick={() => setPreference(value)}
          className={cn(
            "flex h-7 flex-1 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
            preference === value ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}

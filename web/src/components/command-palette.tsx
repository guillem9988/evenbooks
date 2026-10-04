"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CornerDownLeftIcon, MonitorIcon, MoonIcon, SearchIcon, SunIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ALL_NAV_LINKS, CREATE_LINKS } from "@/components/nav";
import { useTheme, type ThemePreference } from "@/components/theme";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  group: "create" | "navigate" | "preferences";
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  run: () => void;
}

/** Lowercase and strip accents so "cataleg" matches "Catàleg". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const router = useRouter();
  const { setPreference } = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const theme = (value: ThemePreference) => () => setPreference(value);
    return [
      ...CREATE_LINKS.map((link) => ({ id: link.href, group: "create" as const, label: t(link.labelKey), icon: link.icon, run: go(link.href) })),
      ...ALL_NAV_LINKS.map((link) => ({ id: link.href, group: "navigate" as const, label: t(link.labelKey), icon: link.icon, run: go(link.href) })),
      { id: "theme-light", group: "preferences", label: t("command.themeLight"), icon: SunIcon, run: theme("light") },
      { id: "theme-dark", group: "preferences", label: t("command.themeDark"), icon: MoonIcon, run: theme("dark") },
      { id: "theme-system", group: "preferences", label: t("command.themeSystem"), icon: MonitorIcon, run: theme("system") },
    ];
  }, [router, setPreference, t]);

  const results = useMemo(() => {
    const needle = fold(query.trim());
    if (needle === "") return commands;
    const words = needle.split(/\s+/);
    return commands.filter((command) => {
      const haystack = fold(command.label);
      return words.every((word) => haystack.includes(word));
    });
  }, [commands, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (command: Command | undefined) => {
    if (!command) return;
    onOpenChange(false);
    command.run();
  };

  const groups: Array<[Command["group"], string]> = [
    ["create", t("command.groupCreate")],
    ["navigate", t("command.groupNavigate")],
    ["preferences", t("command.groupPreferences")],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 shadow-2xl sm:max-w-lg">
        <DialogTitle className="sr-only">{t("command.title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("command.description")}</DialogDescription>
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            aria-label={t("command.placeholder")}
            placeholder={t("command.placeholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((current) => (results.length === 0 ? 0 : (current + 1) % results.length));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((current) => (results.length === 0 ? 0 : (current - 1 + results.length) % results.length));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(results[active]);
              }
            }}
            className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
          />
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">Esc</kbd>
        </div>
        <ul ref={listRef} id={listId} role="listbox" aria-label={t("command.title")} className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground" role="presentation">
              {t("command.empty", { query })}
            </li>
          ) : (
            groups.map(([group, label]) => {
              const items = results.map((command, index) => ({ command, index })).filter(({ command }) => command.group === group);
              if (items.length === 0) return null;
              return (
                <li key={group} role="presentation">
                  <p className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground" aria-hidden>
                    {label}
                  </p>
                  <ul role="group" aria-label={label}>
                    {items.map(({ command, index }) => (
                      <li
                        key={`${group}-${command.id}`}
                        id={`${listId}-${index}`}
                        data-index={index}
                        role="option"
                        aria-selected={index === active}
                        onMouseMove={() => setActive(index)}
                        onClick={() => choose(command)}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                          index === active ? "bg-accent text-accent-foreground" : "text-foreground",
                        )}
                      >
                        <command.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="flex-1 truncate">{command.label}</span>
                        {index === active ? <CornerDownLeftIcon className="size-3.5 text-muted-foreground" aria-hidden /> : null}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })
          )}
        </ul>
        <p className="border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t("command.hint")}</p>
      </DialogContent>
    </Dialog>
  );
}

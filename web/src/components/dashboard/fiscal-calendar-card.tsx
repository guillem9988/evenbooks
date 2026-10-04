"use client";

import { ArrowRightIcon, CalendarClockIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, today } from "@/components/ui-kit";
import { useI18n } from "@/i18n";
import { daysBetween, upcomingDeadlines } from "@/lib/fiscal-calendar";
import { cn } from "@/lib/utils";

export function FiscalCalendarCard() {
  const { t, dict, locale } = useI18n();
  const now = today();
  const deadlines = upcomingDeadlines(now, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClockIcon className="size-4 text-primary" aria-hidden />
          {t("home.fiscalTitle")}
        </CardTitle>
        <CardDescription>{t("home.fiscalHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ol className="flex flex-col gap-2">
          {deadlines.map((deadline) => {
            const days = daysBetween(now, deadline.due);
            const open = now >= deadline.opens;
            const urgent = open && days <= 7;
            const when = days === 0 ? t("home.fiscalToday") : days === 1 ? t("home.fiscalTomorrow") : t("home.fiscalDaysLeft", { count: days });
            const title =
              deadline.kind === "quarterly"
                ? t("home.fiscalQuarterly", { quarter: dict.period.quarterN[(deadline.quarter ?? 1) - 1] ?? "", year: deadline.year })
                : t("home.fiscalAnnual", { year: deadline.year });
            return (
              <li
                key={`${deadline.kind}-${deadline.year}-${deadline.quarter ?? 0}`}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3",
                  urgent ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40" : "bg-card",
                )}
              >
                <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-md bg-muted leading-none" aria-hidden>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">
                    {new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(`${deadline.due}T00:00:00Z`)).replace(".", "")}
                  </span>
                  <span className="text-base font-semibold tabular-nums">{Number(deadline.due.slice(8, 10))}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-pretty">{title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("home.fiscalDue", { date: formatDate(deadline.due) })}
                    {open ? ` · ${t("home.fiscalOpen")}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                    urgent ? "bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-100" : "bg-muted text-muted-foreground",
                  )}
                >
                  {when}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-xs text-xs text-muted-foreground">{t("home.fiscalNote")}</p>
          <ButtonLink href="/impostos" variant="outline" size="sm">
            {t("home.fiscalCta")} <ArrowRightIcon />
          </ButtonLink>
        </div>
      </CardContent>
    </Card>
  );
}

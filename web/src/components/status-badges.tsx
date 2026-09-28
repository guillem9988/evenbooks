"use client";

import { StatusBadge, type Tone } from "@/components/ui-kit";
import { useT } from "@/i18n";

export function PaidBadge({ status }: { status: "PAID" | "UNPAID" }) {
  const t = useT();
  return status === "PAID" ? <StatusBadge tone="success">{t("badges.paid")}</StatusBadge> : <StatusBadge tone="warning">{t("badges.unpaid")}</StatusBadge>;
}

export function RectificativaBadge({ of }: { of?: string | null }) {
  const t = useT();
  return (
    <StatusBadge tone="violet" title={of ? t("badges.rectifies", { series: of }) : undefined}>
      {t("badges.rectificativa")}
    </StatusBadge>
  );
}

export function QuoteBadge({ status }: { status: "OPEN" | "CONVERTED" }) {
  const t = useT();
  return status === "CONVERTED" ? <StatusBadge tone="success">{t("badges.quoted")}</StatusBadge> : <StatusBadge tone="info">{t("badges.open")}</StatusBadge>;
}

export type MatchKind = "auto" | "manual" | "suggestion";

export function MatchBadge({ kind }: { kind: MatchKind }) {
  const t = useT();
  const entry: Record<MatchKind, { label: string; tone: Tone; title: string }> = {
    auto: { label: t("badges.matchAuto"), tone: "success", title: t("badges.matchAutoTitle") },
    manual: { label: t("badges.matchManual"), tone: "info", title: t("badges.matchManualTitle") },
    suggestion: { label: t("badges.matchSuggestion"), tone: "warning", title: t("badges.matchSuggestionTitle") },
  };
  const current = entry[kind];
  return (
    <StatusBadge tone={current.tone} title={current.title}>
      {current.label}
    </StatusBadge>
  );
}

export function ExpenseStatusBadge({ status }: { status: string }) {
  const t = useT();
  const map: Record<string, { label: string; tone: Tone }> = {
    PARSED: { label: t("badges.expenseParsed"), tone: "success" },
    PROCESSING: { label: t("badges.expenseProcessing"), tone: "warning" },
    UPLOADED: { label: t("badges.expenseUploaded"), tone: "neutral" },
    FAILED: { label: t("badges.expenseFailed"), tone: "danger" },
  };
  const entry = map[status] ?? { label: status, tone: "neutral" as const };
  return <StatusBadge tone={entry.tone}>{entry.label}</StatusBadge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  const t = useT();
  return active ? <StatusBadge tone="success">{t("badges.active")}</StatusBadge> : <StatusBadge tone="neutral">{t("badges.paused")}</StatusBadge>;
}

export function RoleBadge({ role }: { role: string }) {
  const t = useT();
  return role === "CLIENT" ? <StatusBadge tone="info">{t("badges.client")}</StatusBadge> : <StatusBadge tone="neutral">{t("badges.supplier")}</StatusBadge>;
}

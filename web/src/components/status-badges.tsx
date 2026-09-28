import { StatusBadge, type Tone } from "@/components/ui-kit";

export function PaidBadge({ status }: { status: "PAID" | "UNPAID" }) {
  return status === "PAID" ? <StatusBadge tone="success">Cobrada</StatusBadge> : <StatusBadge tone="warning">Pendent</StatusBadge>;
}

export function RectificativaBadge({ of }: { of?: string | null }) {
  return (
    <StatusBadge tone="violet" title={of ? `Rectifica la factura ${of}` : undefined}>
      Rectificativa
    </StatusBadge>
  );
}

export function QuoteBadge({ status }: { status: "OPEN" | "CONVERTED" }) {
  return status === "CONVERTED" ? <StatusBadge tone="success">Facturat</StatusBadge> : <StatusBadge tone="info">Obert</StatusBadge>;
}

export type MatchKind = "auto" | "manual" | "suggestion";

const MATCH: Record<MatchKind, { label: string; tone: Tone; title: string }> = {
  auto: { label: "Auto", tone: "success", title: "Conciliada automàticament" },
  manual: { label: "Manual", tone: "info", title: "Confirmada a mà" },
  suggestion: { label: "Suggeriment", tone: "warning", title: "Cal revisar-la" },
};

export function MatchBadge({ kind }: { kind: MatchKind }) {
  const entry = MATCH[kind];
  return (
    <StatusBadge tone={entry.tone} title={entry.title}>
      {entry.label}
    </StatusBadge>
  );
}

const EXPENSE: Record<string, { label: string; tone: Tone }> = {
  PARSED: { label: "Analitzada", tone: "success" },
  PROCESSING: { label: "Processant", tone: "warning" },
  UPLOADED: { label: "A la cua", tone: "neutral" },
  FAILED: { label: "No llegible", tone: "danger" },
};

export function ExpenseStatusBadge({ status }: { status: string }) {
  const entry = EXPENSE[status] ?? { label: status, tone: "neutral" as const };
  return <StatusBadge tone={entry.tone}>{entry.label}</StatusBadge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? <StatusBadge tone="success">Activa</StatusBadge> : <StatusBadge tone="neutral">En pausa</StatusBadge>;
}

export function RoleBadge({ role }: { role: string }) {
  return role === "CLIENT" ? <StatusBadge tone="info">Client</StatusBadge> : <StatusBadge tone="neutral">Proveïdor</StatusBadge>;
}

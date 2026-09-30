"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { FormDialog, Field, NativeSelect, notifyError, today } from "@/components/ui-kit";
import { LineEditor, emptyLine, validateLines, type CatalogPick, type DraftLine, type LineErrors, type ParsedLine } from "@/components/line-editor";
import { useT } from "@/i18n";

export type { CatalogPick } from "@/components/line-editor";

export interface Contact {
  id: string;
  legalName: string;
  role: string;
  email?: string | null;
  taxId?: string;
}

export interface DocumentPayload {
  contactId: string;
  date: string;
  seriesNumber: string;
  lines: ParsedLine[];
}

interface HeaderErrors {
  contactId?: string;
  seriesNumber?: string;
  date?: string;
}

export function DocumentDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  contacts,
  catalog = [],
  suggestedSeries = "",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  contacts: Contact[];
  catalog?: CatalogPick[];
  suggestedSeries?: string;
  onSubmit: (payload: DocumentPayload) => Promise<void>;
}) {
  const t = useT();
  const [contactId, setContactId] = useState("");
  const [date, setDate] = useState(today);
  const [seriesNumber, setSeriesNumber] = useState(suggestedSeries);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [lineErrors, setLineErrors] = useState<LineErrors>([]);
  const [errors, setErrors] = useState<HeaderErrors>({});
  const [busy, setBusy] = useState(false);

  function reset() {
    setContactId("");
    setDate(today());
    setSeriesNumber(suggestedSeries);
    setLines([emptyLine()]);
    setLineErrors([]);
    setErrors({});
  }

  async function submit() {
    const header: HeaderErrors = {};
    if (contactId === "") header.contactId = t("validation.pickClient");
    if (seriesNumber.trim() === "") header.seriesNumber = t("validation.writeNumber");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) header.date = t("validation.pickDate");
    const checked = validateLines(lines, {
      concept: t("validation.concept"),
      qtyMin: t("validation.qtyMin"),
      money: { required: t("money.required"), invalid: t("money.invalid"), zero: t("money.zero") },
    });
    setErrors(header);
    setLineErrors(checked.errors);
    if (Object.keys(header).length > 0 || checked.parsed === null) return;
    setBusy(true);
    try {
      await onSubmit({ contactId, date, seriesNumber: seriesNumber.trim(), lines: checked.parsed });
      reset();
      onOpenChange(false);
    } catch (cause) {
      notifyError(cause, t("document.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSeriesNumber((current) => current || suggestedSeries);
        onOpenChange(next);
      }}
      title={title}
      description={description}
      submitLabel={submitLabel}
      busy={busy}
      onSubmit={submit}
      wide
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="doc-contact" label={t("common.client")} error={errors.contactId}>
          <NativeSelect id="doc-contact" value={contactId} onChange={(event) => setContactId(event.target.value)}>
            <option value="">{t("validation.pickClient")}</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.legalName}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="doc-series" label={t("common.number")} error={errors.seriesNumber}>
          <Input id="doc-series" value={seriesNumber} onChange={(event) => setSeriesNumber(event.target.value)} placeholder="2026-001" />
        </Field>
        <Field id="doc-date" label={t("common.date")} error={errors.date}>
          <Input id="doc-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
      </div>
      <LineEditor idPrefix="doc" lines={lines} onChange={setLines} errors={lineErrors} catalog={catalog} />
    </FormDialog>
  );
}

/** Next number after the highest `PREFIX-NNN` style series, or an empty string when there is no pattern. */
export function nextSeries(existing: string[]): string {
  let best: { prefix: string; number: number; width: number } | null = null;
  for (const value of existing) {
    const match = /^(.*?)(\d+)$/.exec(value);
    if (!match) continue;
    const number = Number(match[2]);
    if (best === null || number > best.number) best = { prefix: match[1] ?? "", number, width: match[2]?.length ?? 1 };
  }
  if (best === null) return `${new Date().getFullYear()}-001`;
  return `${best.prefix}${String(best.number + 1).padStart(best.width, "0")}`;
}

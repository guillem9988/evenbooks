"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EuroInput, Field, NativeSelect } from "@/components/ui-kit";
import { useT } from "@/i18n";
import { euroError, euroInput, euros, parseEuroInput, type EuroMessages } from "@/lib/money";

export interface CatalogPick {
  id: string;
  name: string;
  unitAmountCents: string;
  taxRate: number;
}

export interface DraftLine {
  description: string;
  quantity: string;
  price: string;
  taxRate: string;
}

export interface ParsedLine {
  description: string;
  quantity: number;
  unitAmountCents: string;
  taxRate: number;
}

export type LineErrors = Array<Partial<Record<keyof DraftLine, string>>>;

export const TAX_RATES = ["21", "10", "4", "0"] as const;

export const emptyLine = (): DraftLine => ({ description: "", quantity: "1", price: "", taxRate: "21" });

export function validateLines(
  lines: DraftLine[],
  messages: { concept: string; qtyMin: string; money: EuroMessages },
): { errors: LineErrors; parsed: ParsedLine[] | null } {
  const errors: LineErrors = lines.map((line) => {
    const entry: Partial<Record<keyof DraftLine, string>> = {};
    if (line.description.trim() === "") entry.description = messages.concept;
    if (!/^\d+$/.test(line.quantity.trim()) || Number(line.quantity) < 1) entry.quantity = messages.qtyMin;
    const price = euroError(line.price, { allowZero: true, messages: messages.money });
    if (price) entry.price = price;
    return entry;
  });
  if (errors.some((entry) => Object.keys(entry).length > 0)) {
    return { errors, parsed: null };
  }
  return {
    errors,
    parsed: lines.map((line) => ({
      description: line.description.trim(),
      quantity: Number(line.quantity),
      unitAmountCents: parseEuroInput(line.price) ?? "0",
      taxRate: Number(line.taxRate),
    })),
  };
}

export function lineTotals(lines: DraftLine[]): { base: bigint; tax: bigint } {
  return lines.reduce(
    (total, line) => {
      const cents = parseEuroInput(line.price);
      const quantity = /^\d+$/.test(line.quantity) ? BigInt(line.quantity) : 0n;
      if (cents === null) return total;
      const base = BigInt(cents) * quantity;
      const tax = (base * BigInt(line.taxRate) + 50n) / 100n;
      return { base: total.base + base, tax: total.tax + tax };
    },
    { base: 0n, tax: 0n },
  );
}

export function LineEditor({
  idPrefix,
  lines,
  onChange,
  errors,
  catalog = [],
}: {
  idPrefix: string;
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  errors: LineErrors;
  catalog?: CatalogPick[];
}) {
  const t = useT();
  function update(index: number, patch: Partial<DraftLine>) {
    onChange(lines.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  }
  const totals = lineTotals(lines);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">{t("lines.title")}</legend>
      {lines.map((line, index) => {
        const id = `${idPrefix}-line-${index}`;
        const lineErrors = errors[index] ?? {};
        return (
          <div key={index} className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_5.5rem_auto] sm:items-start">
            {catalog.length > 0 ? (
              <Field id={`${id}-catalog`} label={t("lines.fromCatalog")} className="sm:col-span-full">
                <NativeSelect
                  id={`${id}-catalog`}
                  value=""
                  onChange={(event) => {
                    const item = catalog.find((entry) => entry.id === event.target.value);
                    if (!item) return;
                    update(index, { description: item.name, price: euroInput(item.unitAmountCents), taxRate: String(item.taxRate) });
                  }}
                >
                  <option value="">{t("lines.pickOrType")}</option>
                  {catalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {euros(item.unitAmountCents)} · {t("common.vat")} {item.taxRate}%
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            <Field id={`${id}-description`} label={t("lines.concept")} error={lineErrors.description}>
              <Input id={`${id}-description`} value={line.description} onChange={(event) => update(index, { description: event.target.value })} />
            </Field>
            <Field id={`${id}-quantity`} label={t("lines.quantity")} error={lineErrors.quantity}>
              <Input id={`${id}-quantity`} inputMode="numeric" value={line.quantity} onChange={(event) => update(index, { quantity: event.target.value })} />
            </Field>
            <Field id={`${id}-price`} label={t("lines.unitPrice")} error={lineErrors.price}>
              <EuroInput id={`${id}-price`} value={line.price} onChange={(price) => update(index, { price })} />
            </Field>
            <Field id={`${id}-rate`} label={t("common.vat")}>
              <NativeSelect id={`${id}-rate`} value={line.taxRate} onChange={(event) => update(index, { taxRate: event.target.value })}>
                {TAX_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}%
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="sm:mt-6"
              aria-label={t("lines.removeLine", { n: index + 1 })}
              disabled={lines.length === 1}
              onClick={() => onChange(lines.filter((_, position) => position !== index))}
            >
              <Trash2Icon />
            </Button>
          </div>
        );
      })}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" className="self-start" onClick={() => onChange([...lines, emptyLine()])}>
          <PlusIcon /> {t("lines.addLine")}
        </Button>
        <dl className="grid grid-cols-3 gap-4 text-sm tabular-nums sm:text-right" aria-live="polite">
          <div>
            <dt className="text-muted-foreground">{t("common.base")}</dt>
            <dd className="font-medium">{euros(totals.base)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("common.vat")}</dt>
            <dd className="font-medium">{euros(totals.tax)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("common.total")}</dt>
            <dd className="font-semibold">{euros(totals.base + totals.tax)}</dd>
          </div>
        </dl>
      </div>
    </fieldset>
  );
}

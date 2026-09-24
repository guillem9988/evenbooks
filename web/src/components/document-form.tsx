"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorBanner, Field, NativeSelect, today } from "@/components/ui-kit";
import { euros, parseEuroInput } from "@/lib/money";

export interface Contact {
  id: string;
  legalName: string;
  role: string;
}

export interface DocumentPayload {
  contactId: string;
  date: string;
  seriesNumber: string;
  lines: Array<{ description: string; quantity: number; unitAmountCents: string; taxRate: number }>;
}

interface DraftLine {
  description: string;
  quantity: string;
  price: string;
  taxRate: string;
}

const emptyLine = (): DraftLine => ({ description: "", quantity: "1", price: "", taxRate: "21" });

export function DocumentForm({
  title,
  description,
  submitLabel,
  contacts,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  contacts: Contact[];
  onSubmit: (payload: DocumentPayload) => Promise<void>;
}) {
  const [contactId, setContactId] = useState("");
  const [date, setDate] = useState(today);
  const [seriesNumber, setSeriesNumber] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = lines.reduce(
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

  function update(index: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = [];
    for (const line of lines) {
      const unitAmountCents = parseEuroInput(line.price);
      if (unitAmountCents === null || !/^\d+$/.test(line.quantity) || Number(line.quantity) < 1) {
        setError("Cada línia necessita una quantitat entera i un preu en euros, per exemple 100,00.");
        return;
      }
      parsed.push({
        description: line.description,
        quantity: Number(line.quantity),
        unitAmountCents,
        taxRate: Number(line.taxRate),
      });
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ contactId, date, seriesNumber, lines: parsed });
      setSeriesNumber("");
      setLines([emptyLine()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No s'ha pogut desar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Primer afegeix un client a <a href="/contactes" className="font-medium text-primary underline-offset-4 hover:underline">Contactes</a>.
          </p>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field id="doc-contact" label="Client">
                <NativeSelect id="doc-contact" value={contactId} onChange={(event) => setContactId(event.target.value)} required>
                  <option value="">Tria un client</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>{contact.legalName}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="doc-series" label="Número">
                <Input id="doc-series" value={seriesNumber} onChange={(event) => setSeriesNumber(event.target.value)} placeholder="2026-001" required />
              </Field>
              <Field id="doc-date" label="Data">
                <Input id="doc-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
              </Field>
            </div>

            <div className="flex flex-col gap-3">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_5rem_7rem_6rem_auto] sm:items-end">
                  <Field id={`line-${index}-description`} label="Concepte">
                    <Input
                      id={`line-${index}-description`}
                      value={line.description}
                      onChange={(event) => update(index, { description: event.target.value })}
                      required
                    />
                  </Field>
                  <Field id={`line-${index}-quantity`} label="Quantitat">
                    <Input
                      id={`line-${index}-quantity`}
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(event) => update(index, { quantity: event.target.value })}
                      required
                    />
                  </Field>
                  <Field id={`line-${index}-price`} label="Preu unitari">
                    <Input
                      id={`line-${index}-price`}
                      inputMode="decimal"
                      placeholder="100,00"
                      value={line.price}
                      onChange={(event) => update(index, { price: event.target.value })}
                      required
                    />
                  </Field>
                  <Field id={`line-${index}-rate`} label="IVA">
                    <NativeSelect id={`line-${index}-rate`} value={line.taxRate} onChange={(event) => update(index, { taxRate: event.target.value })}>
                      <option value="21">21%</option>
                      <option value="10">10%</option>
                      <option value="4">4%</option>
                      <option value="0">0%</option>
                    </NativeSelect>
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Elimina la línia"
                    disabled={lines.length === 1}
                    onClick={() => setLines((current) => current.filter((_, position) => position !== index))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" className="self-start" onClick={() => setLines((current) => [...current, emptyLine()])}>
                <PlusIcon /> Afegeix una línia
              </Button>
            </div>

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <dl className="grid grid-cols-3 gap-4 text-sm tabular-nums">
                <div>
                  <dt className="text-muted-foreground">Base</dt>
                  <dd className="font-medium">{euros(preview.base.toString())}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">IVA</dt>
                  <dd className="font-medium">{euros(preview.tax.toString())}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="font-semibold">{euros((preview.base + preview.tax).toString())}</dd>
                </div>
              </dl>
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? "Desant…" : submitLabel}
              </Button>
            </div>
            <ErrorBanner message={error} />
          </form>
        )}
      </CardContent>
    </Card>
  );
}

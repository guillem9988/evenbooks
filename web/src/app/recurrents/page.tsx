"use client";

import { useCallback, useEffect, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOrganizationId } from "@/components/shell";
import { EmptyState, ErrorBanner, Field, LoadingRows, NativeSelect, Notice, PageHeader, StatusBadge, messageOf } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { euroInput, euros, parseEuroInput } from "@/lib/money";

interface Contact {
  id: string;
  legalName: string;
  role: string;
}

interface CatalogItem {
  id: string;
  name: string;
  unitAmountCents: string;
  taxRate: number;
}

interface Series {
  id: string;
  contactName: string;
  dayOfMonth: number;
  active: boolean;
  lines: Array<{ description: string; quantity: number; unitAmountCents: string; taxRate: number | null }>;
}

interface DraftLine {
  description: string;
  quantity: string;
  price: string;
  taxRate: string;
}

const emptyLine = (): DraftLine => ({ description: "", quantity: "1", price: "", taxRate: "21" });

export default function RecurringPage() {
  const organizationId = useOrganizationId();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [contactId, setContactId] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [people, products, listed] = await Promise.all([
        api<{ contacts: Contact[] }>(`/organizations/${organizationId}/contacts`),
        api<{ items: CatalogItem[] }>(`/organizations/${organizationId}/catalog`),
        api<{ recurringInvoices: Series[] }>(`/organizations/${organizationId}/recurring-invoices`),
      ]);
      setContacts(people.contacts.filter((contact) => contact.role === "CLIENT"));
      setCatalog(products.items);
      setSeries(listed.recurringInvoices);
    } catch (cause) {
      setError(messageOf(cause, "No s’han pogut carregar les sèries"));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const parsed = [];
    for (const line of lines) {
      const unitAmountCents = parseEuroInput(line.price);
      if (unitAmountCents === null || !/^\d+$/.test(line.quantity)) {
        setError("Cada línia necessita una quantitat i un preu en euros, per exemple 3,50.");
        return;
      }
      parsed.push({ description: line.description, quantity: Number(line.quantity), unitAmountCents, taxRate: Number(line.taxRate) });
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/organizations/${organizationId}/recurring-invoices`, {
        method: "POST",
        body: JSON.stringify({ contactId, dayOfMonth: Number(dayOfMonth), lines: parsed }),
      });
      setNotice("Sèrie creada.");
      setLines([emptyLine()]);
      await load();
    } catch (cause) {
      setError(messageOf(cause, "No s’ha pogut crear la sèrie"));
    } finally {
      setBusy(false);
    }
  }

  async function pause(row: Series) {
    setBusy(true);
    setError(null);
    try {
      await api(`/organizations/${organizationId}/recurring-invoices/${row.id}/pause`, { method: "POST" });
      setNotice(row.active ? "Sèrie en pausa." : "Sèrie activada.");
      await load();
    } catch (cause) {
      setError(messageOf(cause, "No s’ha pogut canviar l’estat"));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const body = await api<{ created: unknown[] }>(`/organizations/${organizationId}/recurring-invoices/run`, { method: "POST" });
      setNotice(body.created.length === 0 ? "Aquest mes ja estan generades." : `S’han creat ${body.created.length} factures.`);
    } catch (cause) {
      setError(messageOf(cause, "No s’han pogut generar les factures"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Recurrents"
        description="Sèries mensuals per a un client. El dia és entre l’1 i el 28."
        actions={
          <Button type="button" onClick={run} disabled={busy}>
            Genera les d’aquest mes
          </Button>
        }
      />
      <ErrorBanner message={error} onRetry={load} />
      <Notice message={notice} />
      <Card>
        <CardHeader>
          <CardTitle>Nova sèrie</CardTitle>
          <CardDescription>Tria un producte del catàleg o escriu la línia. El preu és en euros.</CardDescription>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Primer afegeix un client a Contactes.</p>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={create}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="rec-contact" label="Client">
                  <NativeSelect id="rec-contact" value={contactId} onChange={(event) => setContactId(event.target.value)} required>
                    <option value="">Tria un client</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>{contact.legalName}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="rec-day" label="Dia del mes">
                  <Input id="rec-day" inputMode="numeric" min={1} max={28} value={dayOfMonth} onChange={(event) => setDayOfMonth(event.target.value)} required />
                </Field>
              </div>
              {lines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_5rem_7rem_6rem_auto] sm:items-end">
                  {catalog.length > 0 ? (
                    <Field id={`rec-${index}-catalog`} label="Del catàleg" className="sm:col-span-full">
                      <NativeSelect
                        id={`rec-${index}-catalog`}
                        value=""
                        onChange={(event) => {
                          const item = catalog.find((entry) => entry.id === event.target.value);
                          if (!item) return;
                          setLines((current) => current.map((row, position) => position === index ? { ...row, description: item.name, price: euroInput(item.unitAmountCents), taxRate: String(item.taxRate) } : row));
                        }}
                      >
                        <option value="">Escriu la línia a mà o tria un producte</option>
                        {catalog.map((item) => (
                          <option key={item.id} value={item.id}>{item.name} · {euros(item.unitAmountCents)}</option>
                        ))}
                      </NativeSelect>
                    </Field>
                  ) : null}
                  <Field id={`rec-${index}-description`} label="Concepte">
                    <Input id={`rec-${index}-description`} value={line.description} onChange={(event) => setLines((current) => current.map((row, position) => position === index ? { ...row, description: event.target.value } : row))} required />
                  </Field>
                  <Field id={`rec-${index}-quantity`} label="Quantitat">
                    <Input id={`rec-${index}-quantity`} inputMode="numeric" value={line.quantity} onChange={(event) => setLines((current) => current.map((row, position) => position === index ? { ...row, quantity: event.target.value } : row))} required />
                  </Field>
                  <Field id={`rec-${index}-price`} label="Preu">
                    <Input id={`rec-${index}-price`} inputMode="decimal" placeholder="3,50" value={line.price} onChange={(event) => setLines((current) => current.map((row, position) => position === index ? { ...row, price: event.target.value } : row))} required />
                  </Field>
                  <Field id={`rec-${index}-rate`} label="IVA">
                    <NativeSelect id={`rec-${index}-rate`} value={line.taxRate} onChange={(event) => setLines((current) => current.map((row, position) => position === index ? { ...row, taxRate: event.target.value } : row))}>
                      <option value="21">21%</option>
                      <option value="10">10%</option>
                      <option value="4">4%</option>
                      <option value="0">0%</option>
                    </NativeSelect>
                  </Field>
                  <Button type="button" variant="ghost" size="icon" aria-label="Elimina la línia" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" className="self-start" onClick={() => setLines((current) => [...current, emptyLine()])}>
                <PlusIcon /> Afegeix una línia
              </Button>
              <Button type="submit" disabled={busy}>{busy ? "Desant…" : "Crea la sèrie"}</Button>
            </form>
          )}
        </CardContent>
      </Card>
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Sèries</h2>
        {loading ? <LoadingRows /> : series.length === 0 ? (
          <EmptyState title="Encara no hi ha sèries" hint="Crea la primera amb el formulari de dalt." />
        ) : (
          <ul className="flex flex-col gap-2">
            {series.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{row.contactName}</p>
                  <p className="text-sm text-muted-foreground">Dia {row.dayOfMonth} · {row.lines.map((line) => `${line.description} ${euros(line.unitAmountCents)}`).join(", ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={row.active ? "success" : "neutral"}>{row.active ? "Activa" : "En pausa"}</StatusBadge>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => pause(row)}>
                    {row.active ? "Pausa" : "Activa"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

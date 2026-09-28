"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { PauseIcon, PlayIcon, PlusIcon, RepeatIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineEditor, emptyLine, lineTotals, validateLines, type CatalogPick, type DraftLine, type LineErrors } from "@/components/line-editor";
import { useOrganizationId } from "@/components/shell";
import { ActiveBadge } from "@/components/status-badges";
import {
  EmptyState,
  ErrorBanner,
  Field,
  FormDialog,
  MONTHS,
  NativeSelect,
  PageHeader,
  TableSkeleton,
  notifyError,
  notifySuccess,
  useLoad,
} from "@/components/ui-kit";
import { api } from "@/lib/api";
import { euroInput, euros } from "@/lib/money";

interface Contact {
  id: string;
  legalName: string;
  role: string;
}

interface Series {
  id: string;
  contactName: string;
  dayOfMonth: number;
  active: boolean;
  lines: Array<{ description: string; quantity: number; unitAmountCents: string; taxRate: number | null }>;
}

interface RecurringData {
  contacts: Contact[];
  catalog: CatalogPick[];
  series: Series[];
}

export default function RecurringPage() {
  const organizationId = useOrganizationId();
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState(false);
  const [contactId, setContactId] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [lineErrors, setLineErrors] = useState<LineErrors>([]);
  const [errors, setErrors] = useState<{ contactId?: string; dayOfMonth?: string }>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<RecurringData> => {
    const [people, products, listed] = await Promise.all([
      api<{ contacts: Contact[] }>(`/organizations/${organizationId}/contacts`),
      api<{ items: CatalogPick[] }>(`/organizations/${organizationId}/catalog`),
      api<{ recurringInvoices: Series[] }>(`/organizations/${organizationId}/recurring-invoices`),
    ]);
    return { contacts: people.contacts.filter((contact) => contact.role === "CLIENT"), catalog: products.items, series: listed.recurringInvoices };
  }, [organizationId]);

  const { data, error, initialLoading, reload } = useLoad(load, "No s’han pogut carregar les sèries");
  const series = data?.series ?? [];
  const contacts = data?.contacts ?? [];
  const activeCount = series.filter((row) => row.active).length;
  const monthName = MONTHS[new Date().getMonth()];

  function openCreate() {
    setContactId("");
    setDayOfMonth("1");
    setLines([emptyLine()]);
    setLineErrors([]);
    setErrors({});
    setCreating(true);
  }

  async function create() {
    const header: typeof errors = {};
    if (contactId === "") header.contactId = "Tria un client.";
    const day = Number(dayOfMonth);
    if (!/^\d+$/.test(dayOfMonth.trim()) || day < 1 || day > 28) header.dayOfMonth = "Un dia entre l’1 i el 28.";
    const checked = validateLines(lines);
    setErrors(header);
    setLineErrors(checked.errors);
    if (Object.keys(header).length > 0 || checked.parsed === null) return;
    setBusy("create");
    try {
      await api(`/organizations/${organizationId}/recurring-invoices`, {
        method: "POST",
        body: JSON.stringify({ contactId, dayOfMonth: day, lines: checked.parsed }),
      });
      notifySuccess("Sèrie creada. Es facturarà cada mes.");
      setCreating(false);
      await reload();
    } catch (cause) {
      notifyError(cause, "No s’ha pogut crear la sèrie");
    } finally {
      setBusy(null);
    }
  }

  async function toggle(row: Series) {
    setBusy(row.id);
    try {
      await api(`/organizations/${organizationId}/recurring-invoices/${row.id}/pause`, { method: "POST" });
      notifySuccess(row.active ? `Sèrie de ${row.contactName} en pausa.` : `Sèrie de ${row.contactName} activada.`);
      await reload();
    } catch (cause) {
      notifyError(cause, "No s’ha pogut canviar l’estat");
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    setBusy("run");
    try {
      const body = await api<{ created: unknown[] }>(`/organizations/${organizationId}/recurring-invoices/run`, { method: "POST" });
      notifySuccess(
        body.created.length === 0
          ? "Les factures d’aquest mes ja estaven generades."
          : `S’han creat ${body.created.length} ${body.created.length === 1 ? "factura" : "factures"}. Les trobaràs a Ingressos.`,
      );
      setRunning(false);
    } catch (cause) {
      notifyError(cause, "No s’han pogut generar les factures");
    } finally {
      setBusy(null);
    }
  }

  const monthly = (row: Series) => {
    const draft = row.lines.map((line) => ({
      description: line.description,
      quantity: String(line.quantity),
      price: euroInput(line.unitAmountCents),
      taxRate: String(line.taxRate ?? 0),
    }));
    const totals = lineTotals(draft);
    return euros(totals.base + totals.tax);
  };

  const toggleButton = (row: Series) => (
    <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => toggle(row)}>
      {row.active ? (
        <>
          <PauseIcon /> Pausa
        </>
      ) : (
        <>
          <PlayIcon /> Activa
        </>
      )}
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Recurrents"
        description="Sèries mensuals per a un client: quotes, manteniments o lloguers que factures cada mes."
        actions={
          <>
            <Button variant="outline" onClick={() => setRunning(true)} disabled={initialLoading || activeCount === 0}>
              <RepeatIcon /> Genera les de {monthName}
            </Button>
            <Button onClick={openCreate} disabled={initialLoading || contacts.length === 0}>
              <PlusIcon /> Nova sèrie
            </Button>
          </>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      {initialLoading ? (
        <TableSkeleton columns={5} rows={3} />
      ) : data ? (
        contacts.length === 0 && series.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="Primer necessites un client"
            hint="Cada sèrie factura un client. Afegeix-lo a Contactes."
            action={<Button render={<Link href="/contactes?nou=1" />}>Afegeix un client</Button>}
          />
        ) : series.length === 0 ? (
          <EmptyState
            icon={RepeatIcon}
            title="Encara no hi ha sèries recurrents"
            hint="Crea una sèrie i cada mes podràs generar-ne la factura amb un clic."
            action={
              <Button onClick={openCreate}>
                <PlusIcon /> Nova sèrie
              </Button>
            }
          />
        ) : (
          <section aria-label="Sèries" className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {activeCount} {activeCount === 1 ? "sèrie activa" : "sèries actives"} de {series.length}.
            </p>
            <div className="hidden overflow-hidden rounded-xl border md:block">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Concepte</TableHead>
                    <TableHead>Dia</TableHead>
                    <TableHead className="text-right">Total mensual</TableHead>
                    <TableHead>Estat</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Accions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {series.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.contactName}</TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground" title={row.lines.map((line) => line.description).join(", ")}>
                        {row.lines.map((line) => line.description).join(", ")}
                      </TableCell>
                      <TableCell className="tabular-nums">Dia {row.dayOfMonth}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{monthly(row)}</TableCell>
                      <TableCell>
                        <ActiveBadge active={row.active} />
                      </TableCell>
                      <TableCell className="text-right">{toggleButton(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="flex flex-col gap-2 md:hidden">
              {series.map((row) => (
                <li key={row.id} className="flex flex-col gap-3 rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{row.contactName}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        Dia {row.dayOfMonth} · {row.lines.map((line) => line.description).join(", ")}
                      </p>
                    </div>
                    <ActiveBadge active={row.active} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-lg font-semibold tabular-nums">{monthly(row)}</p>
                    {toggleButton(row)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      ) : null}

      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Nova sèrie recurrent"
        description="Tria el client, el dia del mes i les línies. El preu és en euros."
        submitLabel="Crea la sèrie"
        busy={busy === "create"}
        onSubmit={create}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Field id="rec-contact" label="Client" error={errors.contactId}>
            <NativeSelect id="rec-contact" value={contactId} onChange={(event) => setContactId(event.target.value)}>
              <option value="">Tria un client</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.legalName}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="rec-day" label="Dia del mes" error={errors.dayOfMonth} hint="De l’1 al 28.">
            <Input id="rec-day" inputMode="numeric" value={dayOfMonth} onChange={(event) => setDayOfMonth(event.target.value)} />
          </Field>
        </div>
        <LineEditor idPrefix="rec" lines={lines} onChange={setLines} errors={lineErrors} catalog={data?.catalog ?? []} />
      </FormDialog>

      <FormDialog
        open={running}
        onOpenChange={setRunning}
        title={`Genera les factures de ${monthName}`}
        description={`Es crearà una factura per a cada sèrie activa (${activeCount}). Si ja estan generades aquest mes, no se’n duplica cap.`}
        submitLabel="Genera les factures"
        busy={busy === "run"}
        onSubmit={run}
      />
    </>
  );
}

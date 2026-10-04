"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  FileDownIcon,
  FilePenLineIcon,
  MailIcon,
  ClockIcon,
  BellRingIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UndoIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentDialog, nextSeries, type CatalogPick, type Contact, type DocumentPayload } from "@/components/document-form";
import { useOrganizationId } from "@/components/shell";
import { PaidBadge, RectificativaBadge } from "@/components/status-badges";
import {
  CardsSkeleton,
  EmptyState,
  ErrorBanner,
  Field,
  FormDialog,
  KpiCard,
  PageHeader,
  Segmented,
  TableSkeleton,
  StatusBadge,
  daysSince,
  formatDate,
  notifyError,
  notifySuccess,
  sumCents,
  useLoad,
} from "@/components/ui-kit";
import { useT } from "@/i18n";
import { api, apiPath } from "@/lib/api";
import { euros } from "@/lib/money";

interface IssuedInvoice {
  id: string;
  seriesNumber: string;
  invoiceDate: string;
  status: "PAID" | "UNPAID";
  contactName: string;
  rectifiesSeriesNumber: string | null;
  baseAmountCents: string;
  taxAmountCents: string;
  totalAmountCents: string;
}

interface IncomeData {
  contacts: Contact[];
  invoices: IssuedInvoice[];
  catalog: CatalogPick[];
}

type Filter = "ALL" | "UNPAID" | "PAID" | "RECTIFICATIVA";

export default function IncomePage() {
  const t = useT();
  const organizationId = useOrganizationId();
  const [creating, setCreating] = useState(false);
  const [rectifying, setRectifying] = useState<IssuedInvoice | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deletingInvoice, setDeletingInvoice] = useState<IssuedInvoice | null>(null);

  const [emailingInvoice, setEmailingInvoice] = useState<IssuedInvoice | null>(null);
  const [emailMode, setEmailMode] = useState<"invoice" | "reminder">("invoice");
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const load = useCallback(async (): Promise<IncomeData> => {
    const [people, issued, products] = await Promise.all([
      api<{ contacts: Contact[] }>(`/organizations/${organizationId}/contacts`),
      api<{ issuedInvoices: IssuedInvoice[] }>(`/organizations/${organizationId}/issued-invoices`),
      api<{ items: CatalogPick[] }>(`/organizations/${organizationId}/catalog`),
    ]);
    return { contacts: people.contacts.filter((contact) => contact.role === "CLIENT"), invoices: issued.issuedInvoices, catalog: products.items };
  }, [organizationId]);

  const { data, error, initialLoading, reload } = useLoad(load, t("income.loadFailed"));
  const invoices = useMemo(() => data?.invoices ?? [], [data]);
  const contacts = data?.contacts ?? [];

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("nova") === "1") {
      setCreating(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const visible = invoices.filter((invoice) => {
    if (filter === "UNPAID" && invoice.status !== "UNPAID") return false;
    if (filter === "PAID" && invoice.status !== "PAID") return false;
    if (filter === "RECTIFICATIVA" && invoice.rectifiesSeriesNumber === null) return false;

    if (dateFrom && invoice.invoiceDate < dateFrom) return false;
    if (dateTo && invoice.invoiceDate > dateTo) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchSeries = invoice.seriesNumber.toLowerCase().includes(q);
      const matchContact = invoice.contactName.toLowerCase().includes(q);
      const matchAmount = (Number(invoice.totalAmountCents) / 100).toFixed(2).includes(q);
      if (!matchSeries && !matchContact && !matchAmount) return false;
    }

    return true;
  });
  const unpaid = invoices.filter((invoice) => invoice.status === "UNPAID");
  const rectifiedSeries = new Set(invoices.map((invoice) => invoice.rectifiesSeriesNumber).filter(Boolean));

  function startEmailInvoice(invoice: IssuedInvoice, mode: "invoice" | "reminder" = "invoice") {
    const contact = contacts.find((c) => c.legalName === invoice.contactName);
    const params = {
      client: invoice.contactName,
      series: invoice.seriesNumber,
      amount: euros(invoice.totalAmountCents),
      date: formatDate(invoice.invoiceDate),
      days: daysSince(invoice.invoiceDate),
    };
    setEmailMode(mode);
    setEmailingInvoice(invoice);
    setEmailRecipient(contact?.email ?? "");
    setEmailSubject(mode === "reminder" ? t("income.reminderSubject", params) : t("income.emailSubjectDefault", params));
    setEmailMessage(mode === "reminder" ? t("income.reminderBody", params) : t("income.emailBodyDefault", params));
  }

  // `?recorda=<id>` (from the dashboard) opens the reminder for that invoice once the list has loaded.
  const remindHandled = useRef(false);
  useEffect(() => {
    if (remindHandled.current || data === null) return;
    const id = new URLSearchParams(window.location.search).get("recorda");
    if (id === null) return;
    remindHandled.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    const invoice = data.invoices.find((row) => row.id === id);
    if (invoice) startEmailInvoice(invoice, "reminder");
    // startEmailInvoice only reads `data`, which is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function sendInvoiceEmail() {
    if (!emailingInvoice) return;
    setSendingEmail(true);
    try {
      const res = await api<{ ok: boolean; simulated?: boolean; message?: string }>(
        `/organizations/${organizationId}/issued-invoices/${emailingInvoice.id}/send-email`,
        {
          method: "POST",
          body: JSON.stringify({
            recipientEmail: emailRecipient.trim(),
            subject: emailSubject.trim() || undefined,
            message: emailMessage.trim() || undefined,
          }),
        }
      );
      notifySuccess(
        res.simulated
          ? t("income.sendEmailSimulated")
          : t(emailMode === "reminder" ? "income.reminderSuccess" : "income.sendEmailSuccess", { email: emailRecipient.trim() })
      );
      setEmailingInvoice(null);
    } catch (cause) {
      notifyError(cause, t("income.sendEmailFailed"));
    } finally {
      setSendingEmail(false);
    }
  }

  async function create(payload: DocumentPayload) {
    await api(`/organizations/${organizationId}/issued-invoices`, {
      method: "POST",
      body: JSON.stringify({ contactId: payload.contactId, invoiceDate: payload.date, seriesNumber: payload.seriesNumber, lines: payload.lines }),
    });
    notifySuccess(t("income.created", { series: payload.seriesNumber }));
    await reload();
  }

  async function rectify(invoice: IssuedInvoice) {
    setPending(invoice.id);
    try {
      const created = await api<{ seriesNumber: string }>(`/organizations/${organizationId}/issued-invoices/${invoice.id}/rectify`, { method: "POST" });
      notifySuccess(t("income.rectificativaCreated", { series: created.seriesNumber }));
      setRectifying(null);
      await reload();
    } catch (cause) {
      notifyError(cause, t("income.rectifyFailed"));
    } finally {
      setPending(null);
    }
  }

  async function togglePaid(invoice: IssuedInvoice) {
    setPending(invoice.id);
    try {
      await api(`/organizations/${organizationId}/issued-invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ paid: invoice.status !== "PAID" }),
      });
      notifySuccess(
        invoice.status === "PAID"
          ? t("income.markedUnpaid", { series: invoice.seriesNumber })
          : t("income.markedPaid", { series: invoice.seriesNumber }),
      );
      await reload();
    } catch (cause) {
      notifyError(cause, t("income.statusFailed"));
    } finally {
      setPending(null);
    }
  }

  async function deleteInvoice() {
    if (!deletingInvoice) return;
    setPending(deletingInvoice.id);
    try {
      await api(`/organizations/${organizationId}/issued-invoices/${deletingInvoice.id}`, {
        method: "DELETE",
      });
      notifySuccess(t("income.deleteSuccess"));
      setDeletingInvoice(null);
      await reload();
    } catch (cause) {
      notifyError(cause, t("income.deleteFailed"));
    } finally {
      setPending(null);
    }
  }

  const actions = (invoice: IssuedInvoice) => (
    <InvoiceActions
      invoice={invoice}
      organizationId={organizationId}
      pending={pending === invoice.id}
      canRectify={invoice.rectifiesSeriesNumber === null && !rectifiedSeries.has(invoice.seriesNumber)}
      canDelete={!rectifiedSeries.has(invoice.seriesNumber)}
      onPaid={() => togglePaid(invoice)}
      onRectify={() => setRectifying(invoice)}
      onEmail={() => startEmailInvoice(invoice)}
      onRemind={() => startEmailInvoice(invoice, "reminder")}
      onDelete={() => setDeletingInvoice(invoice)}
    />
  );

  return (
    <>
      <PageHeader
        title={t("income.title")}
        description={t("income.description")}
        actions={
          <Button onClick={() => setCreating(true)} disabled={initialLoading || contacts.length === 0}>
            <PlusIcon /> {t("income.newInvoice")}
          </Button>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      {initialLoading ? (
        <>
          <CardsSkeleton count={3} className="lg:grid-cols-3" />
          <TableSkeleton columns={6} />
        </>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard
              label={t("income.billed")}
              value={euros(sumCents(invoices.map((invoice) => invoice.totalAmountCents)))}
              hint={t("income.billedHint", { count: invoices.length })}
            />
            <KpiCard
              label={t("income.unpaid")}
              value={euros(sumCents(unpaid.map((invoice) => invoice.totalAmountCents)))}
              hint={t("income.unpaidHint", { count: unpaid.length })}
            />
            <KpiCard
              label={t("income.paid")}
              value={euros(sumCents(invoices.filter((invoice) => invoice.status === "PAID").map((invoice) => invoice.totalAmountCents)))}
            />
          </div>

          {contacts.length === 0 && invoices.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title={t("income.needClient")}
              hint={t("income.needClientHint")}
              action={<ButtonLink href="/contactes?nou=1">{t("income.addClient")}</ButtonLink>}
            />
          ) : invoices.length === 0 ? (
            <EmptyState
              title={t("income.empty")}
              hint={t("income.emptyHint")}
              action={
                <Button onClick={() => setCreating(true)}>
                  <PlusIcon /> {t("income.newInvoice")}
                </Button>
              }
            />
          ) : (
            <section className="flex flex-col gap-3" aria-label={t("income.listLabel")}>
              <Segmented
                label={t("income.filter")}
                value={filter}
                onChange={setFilter}
                options={[
                  ["ALL", t("income.all"), invoices.length],
                  ["UNPAID", t("income.pending"), unpaid.length],
                  ["PAID", t("income.collected"), invoices.length - unpaid.length],
                  ["RECTIFICATIVA", t("income.rectificatives"), invoices.filter((invoice) => invoice.rectifiesSeriesNumber !== null).length],
                ]}
              />

              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1">
                  <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("income.searchPlaceholder")}
                    className="pl-8 text-sm"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{t("income.dateFrom")}:</span>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-8 w-auto text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{t("income.dateTo")}:</span>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-8 w-auto text-xs"
                    />
                  </div>
                  {searchQuery || dateFrom || dateTo ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchQuery("");
                        setDateFrom("");
                        setDateTo("");
                      }}
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <XIcon className="mr-1 size-3.5" />
                      {t("income.clearFilters")}
                    </Button>
                  ) : null}
                </div>
              </div>

              {(searchQuery || dateFrom || dateTo || filter !== "ALL") ? (
                <p className="text-xs text-muted-foreground">
                  {t("income.showingCount", { visible: visible.length, total: invoices.length })}
                </p>
              ) : null}

              {visible.length === 0 ? (
                <EmptyState title={t("income.emptyFilter")} />
              ) : (
                <>
                  <div className="hidden overflow-hidden rounded-xl border md:block">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead>{t("common.number")}</TableHead>
                          <TableHead>{t("common.client")}</TableHead>
                          <TableHead>{t("common.date")}</TableHead>
                          <TableHead className="text-right">{t("common.base")}</TableHead>
                          <TableHead className="text-right">{t("common.vat")}</TableHead>
                          <TableHead className="text-right">{t("common.total")}</TableHead>
                          <TableHead>{t("common.status")}</TableHead>
                          <TableHead className="text-right">
                            <span className="sr-only">{t("common.actions")}</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visible.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">
                              <div className="flex flex-col gap-1">
                                {invoice.seriesNumber}
                                {invoice.rectifiesSeriesNumber ? (
                                  <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                                    <RectificativaBadge of={invoice.rectifiesSeriesNumber} />{" "}
                                    {t("income.ofSeries", { series: invoice.rectifiesSeriesNumber })}
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-48 truncate">{invoice.contactName}</TableCell>
                            <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                            <TableCell className="text-right tabular-nums">{euros(invoice.baseAmountCents)}</TableCell>
                            <TableCell className="text-right tabular-nums">{euros(invoice.taxAmountCents)}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{euros(invoice.totalAmountCents)}</TableCell>
                            <TableCell>
                              <span className="flex flex-wrap items-center gap-1.5">
                                <PaidBadge status={invoice.status} />
                                <OverdueChip invoice={invoice} />
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{actions(invoice)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <ul className="flex flex-col gap-2 md:hidden">
                    {visible.map((invoice) => (
                      <li key={invoice.id} className="flex flex-col gap-3 rounded-xl border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">{invoice.seriesNumber}</p>
                            <p className="truncate text-sm text-muted-foreground">
                              {invoice.contactName} · {formatDate(invoice.invoiceDate)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <PaidBadge status={invoice.status} />
                            <OverdueChip invoice={invoice} />
                            {invoice.rectifiesSeriesNumber ? <RectificativaBadge of={invoice.rectifiesSeriesNumber} /> : null}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-lg font-semibold tabular-nums">{euros(invoice.totalAmountCents)}</p>
                          {actions(invoice)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </>
      ) : null}

      <DocumentDialog
        open={creating}
        onOpenChange={setCreating}
        title={t("income.dialogTitle")}
        description={t("income.dialogDescription")}
        submitLabel={t("income.dialogSubmit")}
        contacts={contacts}
        catalog={data?.catalog ?? []}
        suggestedSeries={nextSeries(invoices.filter((invoice) => invoice.rectifiesSeriesNumber === null).map((invoice) => invoice.seriesNumber))}
        onSubmit={create}
      />

      <FormDialog
        open={rectifying !== null}
        onOpenChange={(open) => !open && setRectifying(null)}
        title={t("income.rectifyTitle", { series: rectifying?.seriesNumber ?? "" })}
        description={t("income.rectifyDescription")}
        submitLabel={t("income.rectifySubmit")}
        busy={rectifying !== null && pending === rectifying.id}
        destructive
        onSubmit={() => (rectifying ? rectify(rectifying) : undefined)}
      >
        {rectifying ? (
          <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("common.client")}</dt>
              <dd className="font-medium">{rectifying.contactName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("income.totalToRectify")}</dt>
              <dd className="font-medium tabular-nums">{euros(rectifying.totalAmountCents)}</dd>
            </div>
          </dl>
        ) : null}
      </FormDialog>

      <Dialog open={emailingInvoice !== null} onOpenChange={(open) => !open && setEmailingInvoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{emailMode === "reminder" ? t("income.reminderTitle") : t("income.sendEmailTitle")}</DialogTitle>
            <DialogDescription>{emailMode === "reminder" ? t("income.reminderDescription") : t("income.sendEmailDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">{t("income.sendEmailAttachment")}:</span>
              <span className="font-mono font-medium">{emailingInvoice?.seriesNumber}.pdf</span>
            </div>
            <Field id="email-recipient" label={t("income.sendEmailRecipient")}>
              <Input
                id="email-recipient"
                type="email"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
                placeholder="client@exemple.cat"
              />
            </Field>
            <Field id="email-subject" label={t("income.sendEmailSubject")}>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </Field>
            <Field id="email-message" label={t("income.sendEmailMessage")}>
              <textarea
                id="email-message"
                rows={emailMode === "reminder" ? 9 : 5}
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              />
            </Field>
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEmailingInvoice(null)} disabled={sendingEmail}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={sendInvoiceEmail} disabled={sendingEmail || !emailRecipient.trim()}>
              {sendingEmail ? t("common.wait") : emailMode === "reminder" ? t("income.reminderSubmit") : t("income.sendEmailSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FormDialog
        open={deletingInvoice !== null}
        onOpenChange={(open) => !open && setDeletingInvoice(null)}
        title={t("income.deleteTitle")}
        description={deletingInvoice ? `${deletingInvoice.seriesNumber} · ${deletingInvoice.contactName} (${euros(deletingInvoice.totalAmountCents)})` : undefined}
        submitLabel={t("income.deleteInvoice")}
        destructive
        busy={pending === deletingInvoice?.id}
        onSubmit={deleteInvoice}
      >
        <p className="text-sm text-muted-foreground">{t("income.deleteConfirm")}</p>
      </FormDialog>
    </>
  );
}

/** Days since issue for an unpaid invoice older than 30 days; nothing otherwise. */
function OverdueChip({ invoice }: { invoice: IssuedInvoice }) {
  const t = useT();
  const days = daysSince(invoice.invoiceDate);
  if (invoice.status !== "UNPAID" || invoice.totalAmountCents.startsWith("-") || days <= 30) return null;
  return (
    <StatusBadge tone={days > 90 ? "danger" : "warning"} title={t("home.daysAgo", { count: days })}>
      <ClockIcon /> {t("income.daysOverdue", { count: days })}
    </StatusBadge>
  );
}

function InvoiceActions({
  invoice,
  organizationId,
  pending,
  canRectify,
  canDelete,
  onPaid,
  onRectify,
  onEmail,
  onRemind,
  onDelete,
}: {
  invoice: IssuedInvoice;
  organizationId: string;
  pending: boolean;
  canRectify: boolean;
  canDelete: boolean;
  onPaid: () => void;
  onRectify: () => void;
  onEmail: () => void;
  onRemind: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onPaid}>
        {invoice.status === "PAID" ? (
          <>
            <UndoIcon /> {t("income.pendingBtn")}
          </>
        ) : (
          <>
            <CheckIcon /> {t("income.paidBtn")}
          </>
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("income.moreActions", { series: invoice.seriesNumber })} />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<a href={apiPath(`/organizations/${organizationId}/issued-invoices/${invoice.id}.pdf`)} />}>
            <FileDownIcon /> {t("income.downloadPdf")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEmail}>
            <MailIcon /> {t("income.sendEmail")}
          </DropdownMenuItem>
          {invoice.status === "UNPAID" && !invoice.totalAmountCents.startsWith("-") ? (
            <DropdownMenuItem onClick={onRemind}>
              <BellRingIcon /> {t("income.sendReminder")}
            </DropdownMenuItem>
          ) : null}
          {canRectify ? (
            <DropdownMenuItem onClick={onRectify}>
              <FilePenLineIcon /> {t("income.createRectificativa")}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
              <Trash2Icon /> {t("income.deleteInvoice")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

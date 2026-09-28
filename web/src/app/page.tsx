"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BanknoteIcon,
  CheckCircle2Icon,
  FileTextIcon,
  LandmarkIcon,
  PlusIcon,
  ReceiptIcon,
  ScaleIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationId } from "@/components/shell";
import { PaidBadge, RectificativaBadge } from "@/components/status-badges";
import {
  CardsSkeleton,
  EmptyState,
  ErrorBanner,
  KpiCard,
  PageHeader,
  PeriodPicker,
  currentPeriod,
  formatDate,
  periodLabel,
  periodRange,
  sumCents,
  useLoad,
  type Period,
} from "@/components/ui-kit";
import { api } from "@/lib/api";
import { euros } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Dashboard {
  incomeCents: string;
  expenseCents: string;
  profitCents: string;
  ivaRepercutitCents: string;
  ivaSuportatCents: string;
  unmatchedBankLines: number;
}

interface IssuedInvoice {
  id: string;
  seriesNumber: string;
  invoiceDate: string;
  status: "PAID" | "UNPAID";
  contactName: string;
  rectifiesSeriesNumber: string | null;
  totalAmountCents: string;
}

interface Expense {
  id: string;
  status: string;
  expenseCategory: string | null;
}

interface Quote {
  id: string;
  status: "OPEN" | "CONVERTED";
  totalAmountCents: string;
}

interface OverviewData {
  dashboard: Dashboard;
  invoices: IssuedInvoice[];
  expenses: Expense[];
  quotes: Quote[];
}

interface Task {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  href: string;
  cta: string;
  tone: "warning" | "danger" | "info";
}

export default function HomePage() {
  const organizationId = useOrganizationId();
  const [period, setPeriod] = useState<Period>(() => currentPeriod("quarter"));
  const { from, to } = periodRange(period);

  const load = useCallback(async (): Promise<OverviewData> => {
    const base = `/organizations/${organizationId}`;
    const [dashboard, issued, spent, listed] = await Promise.all([
      api<Dashboard>(`${base}/dashboard?from=${from}&to=${to}`),
      api<{ issuedInvoices: IssuedInvoice[] }>(`${base}/issued-invoices`),
      api<{ expenses: Expense[] }>(`${base}/expenses`),
      api<{ quotes: Quote[] }>(`${base}/quotes`),
    ]);
    return { dashboard, invoices: issued.issuedInvoices, expenses: spent.expenses, quotes: listed.quotes };
  }, [organizationId, from, to]);

  const { data, error, loading, reload } = useLoad(load, "No s’ha pogut carregar el resum");
  const showSkeleton = loading;

  return (
    <>
      <PageHeader
        title="Inici"
        description={`Resum del ${periodLabel(period)}: el que has facturat, el que has gastat i el que està pendent.`}
        actions={<PeriodPicker value={period} onChange={setPeriod} />}
      />
      <ErrorBanner message={error} onRetry={reload} />
      {showSkeleton ? (
        <>
          <CardsSkeleton count={4} />
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </>
      ) : data ? (
        <Overview data={data} />
      ) : null}
    </>
  );
}

function Overview({ data }: { data: OverviewData }) {
  const { dashboard, invoices, expenses, quotes } = data;
  const vatBalance = (BigInt(dashboard.ivaRepercutitCents) - BigInt(dashboard.ivaSuportatCents)).toString();
  const unpaid = invoices.filter((invoice) => invoice.status === "UNPAID" && !invoice.totalAmountCents.startsWith("-"));
  const unpaidTotal = sumCents(unpaid.map((invoice) => invoice.totalAmountCents));
  const overdue = unpaid.filter((invoice) => daysSince(invoice.invoiceDate) > 30);
  const failed = expenses.filter((expense) => expense.status === "FAILED");
  const uncategorized = expenses.filter((expense) => expense.status === "PARSED" && expense.expenseCategory === null);
  const openQuotes = quotes.filter((quote) => quote.status === "OPEN");

  const tasks: Task[] = [];
  if (overdue.length > 0) {
    tasks.push({
      key: "overdue",
      icon: AlertCircleIcon,
      title: `${overdue.length} ${overdue.length === 1 ? "factura vençuda" : "factures vençudes"}`,
      detail: `Emeses fa més de 30 dies i encara pendents: ${euros(sumCents(overdue.map((invoice) => invoice.totalAmountCents)))}.`,
      href: "/ingressos",
      cta: "Revisa els cobraments",
      tone: "danger",
    });
  }
  if (dashboard.unmatchedBankLines > 0) {
    tasks.push({
      key: "bank",
      icon: LandmarkIcon,
      title: `${dashboard.unmatchedBankLines} ${dashboard.unmatchedBankLines === 1 ? "moviment sense conciliar" : "moviments sense conciliar"}`,
      detail: "Moviments del banc d’aquest període que encara no tenen factura.",
      href: "/banc",
      cta: "Concilia el banc",
      tone: "warning",
    });
  }
  if (failed.length > 0) {
    tasks.push({
      key: "failed",
      icon: ReceiptIcon,
      title: `${failed.length} ${failed.length === 1 ? "despesa no llegible" : "despeses no llegibles"}`,
      detail: "No se n’han pogut extreure els imports. Torna a pujar-les amb més qualitat.",
      href: "/despeses",
      cta: "Obre les despeses",
      tone: "danger",
    });
  }
  if (uncategorized.length > 0) {
    tasks.push({
      key: "uncategorized",
      icon: ReceiptIcon,
      title: `${uncategorized.length} ${uncategorized.length === 1 ? "despesa sense categoria" : "despeses sense categoria"}`,
      detail: "Classifica-les perquè el resum de despeses sigui útil.",
      href: "/despeses",
      cta: "Classifica",
      tone: "info",
    });
  }
  if (openQuotes.length > 0) {
    tasks.push({
      key: "quotes",
      icon: FileTextIcon,
      title: `${openQuotes.length} ${openQuotes.length === 1 ? "pressupost obert" : "pressupostos oberts"}`,
      detail: `Per valor de ${euros(sumCents(openQuotes.map((quote) => quote.totalAmountCents)))}. Converteix-los quan el client accepti.`,
      href: "/pressupostos",
      cta: "Veure pressupostos",
      tone: "info",
    });
  }

  const recent = invoices.slice(0, 5);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Ingressos" value={euros(dashboard.incomeCents)} hint="Total de les factures emeses" icon={BanknoteIcon} />
        <KpiCard label="Despeses" value={euros(dashboard.expenseCents)} hint="Factures rebudes analitzades" icon={ReceiptIcon} />
        <KpiCard
          label="Benefici"
          value={euros(dashboard.profitCents)}
          hint="Ingressos menys despeses"
          icon={TrendingUpIcon}
          tone={dashboard.profitCents.startsWith("-") ? "negative" : "positive"}
        />
        <KpiCard
          label={vatBalance.startsWith("-") ? "IVA a compensar" : "IVA a ingressar"}
          value={euros(vatBalance.replace("-", ""))}
          hint={`Repercutit ${euros(dashboard.ivaRepercutitCents)} · suportat ${euros(dashboard.ivaSuportatCents)}`}
          icon={ScaleIcon}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Què cal fer</CardTitle>
            <CardDescription>El que necessita la teva atenció ara mateix.</CardDescription>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm">
                <CheckCircle2Icon className="size-5 text-emerald-600" aria-hidden />
                <span>Tot al dia. No hi ha res pendent de revisar.</span>
              </div>
            ) : (
              <ul className="flex flex-col divide-y">
                {tasks.map((task) => (
                  <li key={task.key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                          task.tone === "danger" && "bg-red-100 text-red-700",
                          task.tone === "warning" && "bg-amber-100 text-amber-800",
                          task.tone === "info" && "bg-sky-100 text-sky-800",
                        )}
                        aria-hidden
                      >
                        <task.icon className="size-4" />
                      </span>
                      <div>
                        <p className="text-sm font-medium">{task.title}</p>
                        <p className="text-sm text-muted-foreground">{task.detail}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="self-start sm:self-auto" render={<Link href={task.href} />}>
                      {task.cta} <ArrowRightIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pendent de cobrament</CardTitle>
            <CardDescription>Totes les factures emeses que encara no has cobrat.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{euros(unpaidTotal)}</p>
              <p className="text-sm text-muted-foreground">
                {unpaid.length} {unpaid.length === 1 ? "factura" : "factures"}
                {overdue.length > 0 ? ` · ${overdue.length} de fa més de 30 dies` : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button render={<Link href="/ingressos?nova=1" />}>
                <PlusIcon /> Nova factura
              </Button>
              <Button variant="outline" render={<Link href="/banc" />}>
                <LandmarkIcon /> Importa el banc
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Últimes factures</CardTitle>
            <CardDescription>Les cinc més recents.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" render={<Link href="/ingressos" />}>
            Totes <ArrowRightIcon />
          </Button>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              title="Encara no has emès cap factura"
              hint="Crea la primera i apareixerà aquí."
              action={
                <Button render={<Link href="/ingressos?nova=1" />}>
                  <PlusIcon /> Nova factura
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col divide-y">
              {recent.map((invoice) => (
                <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {invoice.seriesNumber}
                      {invoice.rectifiesSeriesNumber ? <RectificativaBadge of={invoice.rectifiesSeriesNumber} /> : null}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {invoice.contactName} · {formatDate(invoice.invoiceDate)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-medium tabular-nums">{euros(invoice.totalAmountCents)}</span>
                    <PaidBadge status={invoice.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function daysSince(date: string): number {
  const then = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(then) ? 0 : Math.floor((Date.now() - then) / 86_400_000);
}

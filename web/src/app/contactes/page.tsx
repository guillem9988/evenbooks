"use client";

import { useCallback, useEffect, useState } from "react";
import { PlusIcon, SearchIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganizationId } from "@/components/shell";
import { RoleBadge } from "@/components/status-badges";
import {
  EMAIL,
  EmptyState,
  ErrorBanner,
  Field,
  FormDialog,
  NativeSelect,
  PageHeader,
  Segmented,
  TableSkeleton,
  notifyError,
  notifySuccess,
  useLoad,
} from "@/components/ui-kit";
import { api } from "@/lib/api";

type Role = "CLIENT" | "SUPPLIER";

interface Contact {
  id: string;
  legalName: string;
  taxId: string;
  email: string;
  role: Role;
}

type Errors = Partial<Record<"legalName" | "taxId" | "email", string>>;

const TAX_ID = /^[A-Z0-9][A-Z0-9-]{3,}$/;

export default function ContactsPage() {
  const organizationId = useOrganizationId();
  const [filter, setFilter] = useState<Role | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("CLIENT");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const body = await api<{ contacts: Contact[] }>(`/organizations/${organizationId}/contacts`);
    return body.contacts;
  }, [organizationId]);

  const { data, error, initialLoading, reload } = useLoad(load, "No s’han pogut carregar els contactes");
  const contacts = data ?? [];

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("nou") === "1") {
      setCreating(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const needle = query.trim().toLowerCase();
  const visible = contacts.filter(
    (contact) =>
      (filter === "ALL" || contact.role === filter) &&
      (needle === "" || contact.legalName.toLowerCase().includes(needle) || contact.taxId.toLowerCase().includes(needle) || contact.email.toLowerCase().includes(needle)),
  );
  const clients = contacts.filter((contact) => contact.role === "CLIENT").length;

  function openCreate() {
    setLegalName("");
    setTaxId("");
    setEmail("");
    setRole("CLIENT");
    setErrors({});
    setCreating(true);
  }

  async function createContact() {
    const next: Errors = {};
    if (legalName.trim() === "") next.legalName = "Escriu la raó social.";
    if (!TAX_ID.test(taxId.trim().toUpperCase())) next.taxId = "Escriu un NIF o CIF vàlid, per exemple B12345678.";
    if (!EMAIL.test(email.trim())) next.email = "Escriu un correu vàlid.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      await api(`/organizations/${organizationId}/contacts`, {
        method: "POST",
        body: JSON.stringify({ legalName: legalName.trim(), taxId: taxId.trim().toUpperCase(), email: email.trim(), role }),
      });
      notifySuccess(`${legalName.trim()} afegit com a ${role === "CLIENT" ? "client" : "proveïdor"}.`);
      setCreating(false);
      await reload();
    } catch (cause) {
      notifyError(cause, "No s’ha pogut crear el contacte");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Contactes"
        description="Clients i proveïdors amb el seu NIF. Els clients apareixen a Ingressos, Pressupostos i Recurrents."
        actions={
          <Button onClick={openCreate} disabled={initialLoading}>
            <PlusIcon /> Nou contacte
          </Button>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      {initialLoading ? (
        <TableSkeleton columns={4} />
      ) : data ? (
        contacts.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="Encara no hi ha contactes"
            hint="Afegeix el primer client per començar a facturar."
            action={
              <Button onClick={openCreate}>
                <PlusIcon /> Nou contacte
              </Button>
            }
          />
        ) : (
          <section aria-label="Llista de contactes" className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Segmented
                label="Filtra per rol"
                value={filter}
                onChange={setFilter}
                options={[
                  ["ALL", "Tots", contacts.length],
                  ["CLIENT", "Clients", clients],
                  ["SUPPLIER", "Proveïdors", contacts.length - clients],
                ]}
              />
              <div className="relative sm:w-72">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input aria-label="Cerca contactes" placeholder="Nom, NIF o correu" className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            </div>
            {visible.length === 0 ? (
              <EmptyState title="Cap contacte coincideix" hint="Canvia el filtre o la cerca." />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Raó social</TableHead>
                        <TableHead>NIF / CIF</TableHead>
                        <TableHead>Correu</TableHead>
                        <TableHead>Rol</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((contact) => (
                        <TableRow key={contact.id}>
                          <TableCell className="font-medium">{contact.legalName}</TableCell>
                          <TableCell className="font-mono text-xs">{contact.taxId}</TableCell>
                          <TableCell className="max-w-64 truncate">
                            <a href={`mailto:${contact.email}`} className="underline-offset-4 hover:underline">
                              {contact.email}
                            </a>
                          </TableCell>
                          <TableCell>
                            <RoleBadge role={contact.role} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul className="flex flex-col gap-2 md:hidden">
                  {visible.map((contact) => (
                    <li key={contact.id} className="flex flex-col gap-1 rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{contact.legalName}</p>
                        <RoleBadge role={contact.role} />
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">{contact.taxId}</p>
                      <p className="truncate text-sm text-muted-foreground">{contact.email}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )
      ) : null}

      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Nou contacte"
        description="Els clients es poden facturar; els proveïdors t’ajuden a identificar despeses."
        submitLabel="Afegeix el contacte"
        busy={busy}
        onSubmit={createContact}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="contact-name" label="Raó social" error={errors.legalName} className="sm:col-span-2">
            <Input id="contact-name" autoComplete="organization" value={legalName} onChange={(event) => setLegalName(event.target.value)} autoFocus />
          </Field>
          <Field id="contact-tax" label="NIF / CIF" error={errors.taxId}>
            <Input id="contact-tax" value={taxId} onChange={(event) => setTaxId(event.target.value.toUpperCase())} placeholder="B12345678" />
          </Field>
          <Field id="contact-role" label="Rol">
            <NativeSelect id="contact-role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
              <option value="CLIENT">Client</option>
              <option value="SUPPLIER">Proveïdor</option>
            </NativeSelect>
          </Field>
          <Field id="contact-email" label="Correu" error={errors.email} className="sm:col-span-2">
            <Input id="contact-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
        </div>
      </FormDialog>
    </>
  );
}

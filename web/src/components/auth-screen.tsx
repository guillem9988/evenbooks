"use client";

import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOrganization } from "@/components/organization";
import { EMAIL, ErrorBanner, Field, Segmented, messageOf, notifySuccess } from "@/components/ui-kit";
import { api } from "@/lib/api";

type Mode = "login" | "register";
type Errors = Partial<Record<"email" | "password" | "displayName" | "legalName" | "taxId", string>>;

const POINTS = [
  "Factures, pressupostos i sèries recurrents amb PDF",
  "Despeses llegides dels teus PDF i tiquets",
  "Conciliació bancària amb suggeriments per revisar",
  "Previsió dels models 303 i 130 cada trimestre",
];

export function AuthScreen() {
  const { refresh } = useOrganization();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validate(): Errors {
    const next: Errors = {};
    if (!EMAIL.test(email.trim())) next.email = "Escriu un correu vàlid.";
    if (password.length < 8) next.password = "Mínim 8 caràcters.";
    if (mode === "register") {
      if (displayName.trim() === "") next.displayName = "Escriu el teu nom.";
      if (legalName.trim() === "") next.legalName = "Escriu la raó social.";
      if (taxId.trim() === "") next.taxId = "Escriu el NIF o CIF.";
    }
    return next;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    setError(null);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      if (mode === "login") {
        await api("/auth/login", { method: "POST", body: JSON.stringify({ email: email.trim(), password }) });
      } else {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email: email.trim(), password, displayName: displayName.trim(), legalName: legalName.trim(), taxId: taxId.trim() }),
        });
        notifySuccess("Compte creat. Benvingut a MatchInvoice.");
      }
      await refresh();
    } catch (cause) {
      setError(messageOf(cause, mode === "login" ? "No s’ha pogut entrar" : "No s’ha pogut crear el compte"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="contingut" className="grid min-h-dvh flex-1 lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex" aria-label="Què és MatchInvoice">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground text-sm font-semibold text-primary">MI</span>
          <span className="text-lg font-semibold">MatchInvoice</span>
        </div>
        <div className="flex max-w-md flex-col gap-6">
          <h2 className="text-3xl font-semibold tracking-tight">La facturació i el banc, quadrats cada trimestre.</h2>
          <ul className="flex flex-col gap-3 text-sm">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs opacity-80">Imports en euros, desats en cèntims exactes.</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-2 flex items-center gap-2 lg:hidden">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">MI</span>
              <span className="font-semibold">MatchInvoice</span>
            </div>
            <CardTitle className="text-xl">{mode === "login" ? "Entra al teu compte" : "Crea el compte"}</CardTitle>
            <CardDescription>
              {mode === "login" ? "Fes servir el correu i la contrasenya del registre." : "El registre crea el teu usuari i la primera organització."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Segmented
              label="Accés"
              value={mode}
              onChange={(next) => {
                setMode(next);
                setErrors({});
                setError(null);
              }}
              options={[
                ["login", "Entra"],
                ["register", "Registra’t"],
              ]}
            />
            <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
              {mode === "register" ? (
                <Field id="auth-name" label="El teu nom" error={errors.displayName}>
                  <Input id="auth-name" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                </Field>
              ) : null}
              <Field id="auth-email" label="Correu" error={errors.email}>
                <Input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </Field>
              <Field id="auth-password" label="Contrasenya" error={errors.password} hint={mode === "register" ? "Mínim 8 caràcters." : undefined}>
                <Input
                  id="auth-password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              {mode === "register" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="org-name" label="Raó social" error={errors.legalName}>
                    <Input id="org-name" autoComplete="organization" value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="Estudi Vidal SL" />
                  </Field>
                  <Field id="org-tax" label="NIF / CIF" error={errors.taxId}>
                    <Input id="org-tax" value={taxId} onChange={(event) => setTaxId(event.target.value.toUpperCase())} placeholder="B12345678" />
                  </Field>
                </div>
              ) : null}
              <ErrorBanner message={error} />
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? "Un moment…" : mode === "login" ? "Entra" : "Crea el compte"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

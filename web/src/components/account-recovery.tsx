"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2Icon, KeyRoundIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import { useOrganization } from "@/components/organization";
import { ErrorBanner, Field, FormDialog, messageOf, notifyError } from "@/components/ui-kit";
import { useT } from "@/i18n";
import { api } from "@/lib/api";

/** "Forgot your password?" dialog: always reports success so it can't be used to probe for accounts. */
export function ForgotPasswordDialog({ open, onOpenChange, initialEmail }: { open: boolean; onOpenChange: (open: boolean) => void; initialEmail: string }) {
  const t = useT();
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(initialEmail);
      setSent(false);
    }
  }, [open, initialEmail]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("recovery.forgotTitle")}
      description={sent ? undefined : t("recovery.forgotDescription")}
      submitLabel={sent ? t("recovery.close") : t("recovery.sendLink")}
      busy={busy}
      onSubmit={async () => {
        if (sent) {
          onOpenChange(false);
          return;
        }
        setBusy(true);
        try {
          await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
          setSent(true);
        } catch (cause) {
          notifyError(cause, t("recovery.sendFailed"));
        } finally {
          setBusy(false);
        }
      }}
    >
      {sent ? (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          {t("recovery.sentNotice")}
        </p>
      ) : (
        <Field id="forgot-email" label={t("common.email")}>
          <Input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
      )}
    </FormDialog>
  );
}

/** Page for the emailed reset link (/restableix?token=…). Works signed out. */
export function ResetPasswordScreen() {
  const t = useT();
  const token = useRef("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    token.current = new URLSearchParams(window.location.search).get("token") ?? "";
    // Keep the token out of the address bar (and so out of history and screenshots).
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  return (
    <main id="contingut" className="flex min-h-dvh flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border bg-card p-8 shadow-sm">
        <Logo className="size-11 self-center" />
        {done ? (
          <div className="flex flex-col items-center gap-3 text-center" role="status">
            <CheckCircle2Icon className="size-8 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <h1 className="text-lg font-semibold">{t("recovery.resetDone")}</h1>
            <p className="text-sm text-muted-foreground">{t("recovery.resetDoneHint")}</p>
            <ButtonLink href="/">{t("recovery.goToLogin")}</ButtonLink>
          </div>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (password.length < 8) return setError(t("validation.passwordMin"));
              if (password !== repeat) return setError(t("recovery.mismatch"));
              setBusy(true);
              setError(null);
              try {
                await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token: token.current, password }) });
                setDone(true);
              } catch (cause) {
                setError(messageOf(cause, t("recovery.resetFailed")));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="flex flex-col gap-1 text-center">
              <h1 className="flex items-center justify-center gap-2 text-lg font-semibold">
                <KeyRoundIcon className="size-5 text-primary" aria-hidden />
                {t("recovery.resetTitle")}
              </h1>
              <p className="text-sm text-muted-foreground">{t("validation.passwordMin")}</p>
            </div>
            <Field id="reset-password" label={t("recovery.newPassword")}>
              <Input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
            <Field id="reset-repeat" label={t("recovery.repeatPassword")}>
              <Input id="reset-repeat" type="password" autoComplete="new-password" value={repeat} onChange={(event) => setRepeat(event.target.value)} />
            </Field>
            <ErrorBanner message={error} />
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? t("common.wait") : t("recovery.save")}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}

/** Settings card to delete the account and every organization the person owns alone. */
export function DeleteAccountCard() {
  const t = useT();
  const { hasPassword, clear } = useOrganization();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2Icon className="size-4" aria-hidden />
          {t("recovery.deleteTitle")}
        </CardTitle>
        <CardDescription>{t("recovery.deleteDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="destructive" onClick={() => { setSecret(""); setError(null); setOpen(true); }}>
          {t("recovery.deleteButton")}
        </Button>
      </CardContent>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={t("recovery.deleteConfirmTitle")}
        description={t("recovery.deleteConfirmDescription")}
        submitLabel={t("recovery.deleteForever")}
        destructive
        busy={busy}
        onSubmit={async () => {
          setBusy(true);
          setError(null);
          try {
            await api("/auth/account", {
              method: "DELETE",
              body: JSON.stringify(hasPassword ? { password: secret } : { confirmEmail: secret }),
            });
            clear();
            router.push("/");
          } catch (cause) {
            setError(messageOf(cause, t("recovery.deleteFailed")));
            setBusy(false);
          }
        }}
      >
        <Field id="delete-secret" label={hasPassword ? t("common.password") : t("recovery.typeEmail")}>
          <Input
            id="delete-secret"
            type={hasPassword ? "password" : "email"}
            autoComplete={hasPassword ? "current-password" : "off"}
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
          />
        </Field>
        <ErrorBanner message={error} />
      </FormDialog>
    </Card>
  );
}

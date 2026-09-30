"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useOrganization } from "@/components/organization";
import { EMAIL, ErrorBanner, Field, Segmented, messageOf, notifySuccess } from "@/components/ui-kit";
import { useI18n, useT } from "@/i18n";
import { ApiError, api, apiPath } from "@/lib/api";

type Mode = "login" | "register";
type Errors = Partial<Record<"email" | "password" | "displayName" | "legalName" | "taxId" | "inviteCode", string>>;
type RegistrationInfo = {
  open: boolean;
  inviteRequired: boolean;
  googleAuthEnabled?: boolean;
  googleClientId?: string | null;
};

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.66-5.17 3.66-9.12z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.13C3.25 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.57H1.27C.46 8.2 0 10.04 0 12s.46 3.8 1.27 5.43l4.01-3.14z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.57l4.01 3.14c.95-2.83 3.6-4.96 6.72-4.96z"
      />
    </svg>
  );
}

export function AuthScreen() {
  const { refresh } = useOrganization();
  const t = useT();
  const { dict } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const [registration, setRegistration] = useState<RegistrationInfo | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const googleClientId =
    registration?.googleClientId || (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID : null) || null;

  useEffect(() => {
    let cancelled = false;
    void api<RegistrationInfo>("/auth/registration")
      .then((info) => {
        if (!cancelled) setRegistration(info);
      })
      .catch(() => {
        if (!cancelled) setRegistration({ open: false, inviteRequired: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Read URL search params for error message (e.g. from Google OAuth callback)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const authErr = params.get("auth_error");
      if (authErr) {
        setError(authErr);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  // Initialize Google Identity Services (One Tap / Credential)
  useEffect(() => {
    if (!googleClientId) return;
    const scriptId = "google-gsi-client";

    const onScriptLoad = () => {
      const g = (window as unknown as { google?: { accounts?: { id?: any } } }).google;
      if (g?.accounts?.id) {
        g.accounts.id.initialize({
          client_id: googleClientId,
          callback: (res: { credential?: string }) => {
            if (res.credential) {
              void handleGoogleCredential(res.credential);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
      }
    };

    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = onScriptLoad;
      document.body.appendChild(script);
    } else {
      onScriptLoad();
    }
  }, [googleClientId]);

  async function handleGoogleCredential(credential: string) {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/google", {
        method: "POST",
        body: JSON.stringify({
          credential,
          inviteCode: inviteCode.trim() || undefined,
        }),
      });
      notifySuccess(t("auth.googleSuccess"));
      const signedIn = await refresh();
      if (!signedIn) {
        throw new ApiError(t("auth.cookieDropped"), 0);
      }
    } catch (cause) {
      setError(messageOf(cause, t("auth.googleFailed")));
    } finally {
      setBusy(false);
    }
  }

  function handleGoogleClick() {
    setError(null);
    if (!googleClientId) {
      setError(t("auth.googleNotConfigured"));
      return;
    }
    const g = (window as unknown as { google?: { accounts?: { id?: any } } }).google;
    if (g?.accounts?.id) {
      g.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          const qs = inviteCode.trim() ? `?inviteCode=${encodeURIComponent(inviteCode.trim())}` : "";
          window.location.href = apiPath(`/auth/google${qs}`);
        }
      });
    } else {
      const qs = inviteCode.trim() ? `?inviteCode=${encodeURIComponent(inviteCode.trim())}` : "";
      window.location.href = apiPath(`/auth/google${qs}`);
    }
  }

  useEffect(() => {
    if (registration !== null && !registration.open && mode === "register") {
      setMode("login");
    }
  }, [registration, mode]);

  function validate(): Errors {
    const next: Errors = {};
    if (!EMAIL.test(email.trim())) next.email = t("validation.email");
    if (password.length < 8) next.password = t("validation.passwordMin");
    if (mode === "register") {
      if (displayName.trim() === "") next.displayName = t("validation.displayName");
      if (legalName.trim() === "") next.legalName = t("validation.legalName");
      if (taxId.trim() === "") next.taxId = t("validation.taxId");
      if (registration?.inviteRequired && inviteCode.trim() === "") next.inviteCode = t("validation.inviteCode");
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
          body: JSON.stringify({
            email: email.trim(),
            password,
            displayName: displayName.trim(),
            legalName: legalName.trim(),
            taxId: taxId.trim(),
            ...(registration?.inviteRequired ? { inviteCode: inviteCode.trim() } : {}),
          }),
        });
        notifySuccess(t("auth.created"));
      }
      const signedIn = await refresh();
      if (!signedIn) {
        throw new ApiError(t("auth.cookieDropped"), 0);
      }
    } catch (cause) {
      setError(messageOf(cause, mode === "login" ? t("auth.loginFailed") : t("auth.registerFailed")));
    } finally {
      setBusy(false);
    }
  }

  const registerOpen = registration?.open === true;
  const modeOptions: Array<readonly [Mode, string]> = registerOpen
    ? [
        ["login", t("auth.login")],
        ["register", t("auth.register")],
      ]
    : [["login", t("auth.login")]];

  return (
    <main id="contingut" className="grid min-h-dvh flex-1 lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex" aria-label={t("auth.ariaWhat")}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground text-sm font-semibold text-primary">MI</span>
            <span className="text-lg font-semibold">MatchInvoice</span>
          </div>
          <LanguageSwitcher className="h-8 w-auto border-primary-foreground/30 bg-primary text-xs text-primary-foreground" />
        </div>
        <div className="flex max-w-md flex-col gap-6">
          <h2 className="text-3xl font-semibold tracking-tight">{t("auth.hero")}</h2>
          <ul className="flex flex-col gap-3 text-sm">
            {dict.auth.points.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs opacity-80">{t("auth.footer")}</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">MI</span>
                <span className="font-semibold">MatchInvoice</span>
              </div>
              <LanguageSwitcher className="h-8 w-auto text-xs" />
            </div>
            <CardTitle className="text-xl">{mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}</CardTitle>
            <CardDescription>
              {mode === "login"
                ? t("auth.loginHint")
                : registration?.inviteRequired
                  ? t("auth.registerHintInvite")
                  : t("auth.registerHint")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {registerOpen ? (
              <Segmented
                label={t("auth.access")}
                value={mode}
                onChange={(nextMode) => {
                  setMode(nextMode);
                  setErrors({});
                  setError(null);
                }}
                options={modeOptions}
              />
            ) : null}

            {/* Google Sign-in */}
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex w-full items-center justify-center gap-3 border-border font-medium hover:bg-muted/60 transition-colors shadow-xs"
                onClick={handleGoogleClick}
                disabled={busy}
              >
                <GoogleLogo />
                <span>{t("auth.googleButton")}</span>
              </Button>
              <div className="relative flex items-center justify-center text-xs text-muted-foreground">
                <span className="w-full border-t border-border" />
                <span className="absolute bg-card px-2 text-muted-foreground">{t("auth.googleOr")}</span>
              </div>
            </div>

            <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
              {mode === "register" ? (
                <Field id="auth-name" label={t("auth.yourName")} error={errors.displayName}>
                  <Input id="auth-name" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                </Field>
              ) : null}
              <Field id="auth-email" label={t("common.email")} error={errors.email}>
                <Input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </Field>
              <Field id="auth-password" label={t("common.password")} error={errors.password} hint={mode === "register" ? t("validation.passwordMin") : undefined}>
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
                  <Field id="org-name" label={t("common.legalName")} error={errors.legalName}>
                    <Input id="org-name" autoComplete="organization" value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="Estudi Vidal SL" />
                  </Field>
                  <Field id="org-tax" label={t("common.taxId")} error={errors.taxId}>
                    <Input id="org-tax" value={taxId} onChange={(event) => setTaxId(event.target.value.toUpperCase())} placeholder="B12345678" />
                  </Field>
                </div>
              ) : null}
              {mode === "register" && registration?.inviteRequired ? (
                <Field id="auth-invite" label={t("auth.inviteCode")} error={errors.inviteCode}>
                  <Input id="auth-invite" autoComplete="off" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />
                </Field>
              ) : null}
              <ErrorBanner message={error} />
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? t("common.wait") : mode === "login" ? t("auth.submitLogin") : t("auth.submitRegister")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

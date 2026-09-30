"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BotIcon,
  CheckCircle2Icon,
  CpuIcon,
  ExternalLinkIcon,
  InfoIcon,
  KeyRoundIcon,
  ServerIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationId } from "@/components/shell";
import {
  ErrorBanner,
  Field,
  NativeSelect,
  PageHeader,
  notifyError,
  notifySuccess,
  useLoad,
} from "@/components/ui-kit";
import { useT } from "@/i18n";
import { api, apiPath, getCustomApiUrl, setCustomApiUrl } from "@/lib/api";

interface ExtractorSettingsPayload {
  extractorMode: "auto" | "gemini" | "documentai" | "openai" | "anthropic" | "deepseek" | "local" | "system";
  effectiveMode: "auto" | "gemini" | "documentai" | "openai" | "anthropic" | "deepseek" | "local";
  extractorModel: string | null;
  gemini: {
    configured: boolean;
    keyPreview: string | null;
    source: "organization" | "system" | "none";
  };
  openai: {
    configured: boolean;
    keyPreview: string | null;
    source: "organization" | "system" | "none";
  };
  anthropic: {
    configured: boolean;
    keyPreview: string | null;
    source: "organization" | "system" | "none";
  };
  deepseek: {
    configured: boolean;
    keyPreview: string | null;
    source: "organization" | "system" | "none";
  };
  documentAi: {
    configured: boolean;
    projectId: string | null;
    processorId: string | null;
    location: string;
    clientEmail: string | null;
    source: "organization" | "system" | "none";
  };
  systemDefaults: {
    hasGemini: boolean;
    hasOpenAi: boolean;
    hasAnthropic: boolean;
    hasDeepseek: boolean;
    hasDocumentAi: boolean;
    mode: string;
  };
}

export default function SettingsPage() {
  const t = useT();
  const organizationId = useOrganizationId();

  // Form states
  const [mode, setMode] = useState<string>("auto");
  const [geminiKey, setGeminiKey] = useState<string>("");
  const [openaiKey, setOpenaiKey] = useState<string>("");
  const [anthropicKey, setAnthropicKey] = useState<string>("");
  const [deepseekKey, setDeepseekKey] = useState<string>("");
  const [docAiProject, setDocAiProject] = useState<string>("");
  const [docAiProcessor, setDocAiProcessor] = useState<string>("");
  const [docAiLocation, setDocAiLocation] = useState<string>("eu");
  const [docAiJson, setDocAiJson] = useState<string>("");
  const [customApiUrl, setCustomApiUrlState] = useState<string>("");

  const [savingMode, setSavingMode] = useState(false);
  const [savingGemini, setSavingGemini] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [savingOpenAi, setSavingOpenAi] = useState(false);
  const [testingOpenAi, setTestingOpenAi] = useState(false);
  const [savingAnthropic, setSavingAnthropic] = useState(false);
  const [testingAnthropic, setTestingAnthropic] = useState(false);
  const [savingDeepseek, setSavingDeepseek] = useState(false);
  const [testingDeepseek, setTestingDeepseek] = useState(false);
  const [savingDocAi, setSavingDocAi] = useState(false);
  const [testingDocAi, setTestingDocAi] = useState(false);
  const [testingApiServer, setTestingApiServer] = useState(false);

  useEffect(() => {
    setCustomApiUrlState(getCustomApiUrl() ?? "");
  }, []);

  async function testApiServer() {
    setTestingApiServer(true);
    try {
      const url = customApiUrl.trim().replace(/\/+$/, "");
      const testEndpoint = url !== "" ? `${url}/health` : apiPath("/health");
      const res = await fetch(testEndpoint, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.status === "ok") {
        notifySuccess(t("settings.apiServerSuccess"));
      } else {
        notifyError(new Error(JSON.stringify(body)), t("settings.apiServerFailed"));
      }
    } catch (cause) {
      notifyError(cause, t("settings.apiServerFailed"));
    } finally {
      setTestingApiServer(false);
    }
  }

  function saveApiServer() {
    const clean = customApiUrl.trim();
    setCustomApiUrl(clean || null);
    setCustomApiUrlState(clean);
    notifySuccess(clean ? t("settings.apiServerSaved") : t("settings.apiServerReset"));
    void reload();
  }

  function resetApiServer() {
    setCustomApiUrl(null);
    setCustomApiUrlState("");
    notifySuccess(t("settings.apiServerReset"));
    void reload();
  }

  const load = useCallback(async (): Promise<ExtractorSettingsPayload> => {
    const data = await api<ExtractorSettingsPayload>(`/organizations/${organizationId}/settings/extractor`);
    setMode(data.extractorMode);
    setDocAiProject(data.documentAi.projectId || "");
    setDocAiLocation(data.documentAi.location || "eu");
    return data;
  }, [organizationId]);

  const { data, error, initialLoading, reload } = useLoad(load, t("settings.loadFailed"));

  async function saveMode(newMode: string) {
    setSavingMode(true);
    try {
      await api(`/organizations/${organizationId}/settings/extractor`, {
        method: "PUT",
        body: JSON.stringify({ extractorMode: newMode }),
      });
      setMode(newMode);
      notifySuccess(t("settings.saveSuccess"));
      await reload();
    } catch (cause) {
      notifyError(cause, t("settings.saveFailed"));
    } finally {
      setSavingMode(false);
    }
  }

  async function saveGemini() {
    if (!geminiKey.trim() && !data?.gemini.keyPreview) return;
    setSavingGemini(true);
    try {
      await api(`/organizations/${organizationId}/settings/extractor`, {
        method: "PUT",
        body: JSON.stringify({ geminiApiKey: geminiKey.trim() }),
      });
      setGeminiKey("");
      notifySuccess(t("settings.saveSuccess"));
      await reload();
    } catch (cause) {
      notifyError(cause, t("settings.saveFailed"));
    } finally {
      setSavingGemini(false);
    }
  }

  async function clearGemini() {
    if (!confirm(t("settings.clearConfirm"))) return;
    setSavingGemini(true);
    try {
      await api(`/organizations/${organizationId}/settings/extractor`, {
        method: "PUT",
        body: JSON.stringify({ geminiApiKey: null }),
      });
      setGeminiKey("");
      notifySuccess(t("settings.saveSuccess"));
      await reload();
    } catch (cause) {
      notifyError(cause, t("settings.saveFailed"));
    } finally {
      setSavingGemini(false);
    }
  }

  async function testGemini() {
    setTestingGemini(true);
    try {
      const res = await api<{ ok: boolean; message?: string }>(`/organizations/${organizationId}/settings/extractor/test`, {
        method: "POST",
        body: JSON.stringify({
          provider: "gemini",
          apiKey: geminiKey.trim() || undefined,
        }),
      });
      notifySuccess(res.message || t("settings.testSuccess"));
    } catch (cause) {
      notifyError(cause, t("settings.testFailed"));
    } finally {
      setTestingGemini(false);
    }
  }

  async function saveOpenAi() {
    if (!openaiKey.trim() && !data?.openai.keyPreview) return;
    setSavingOpenAi(true);
    try {
      await api(`/organizations/${organizationId}/settings/extractor`, {
        method: "PUT",
        body: JSON.stringify({ openaiApiKey: openaiKey.trim() }),
      });
      setOpenaiKey("");
      notifySuccess(t("settings.saveSuccess"));
      await reload();
    } catch (cause) {
      notifyError(cause, t("settings.saveFailed"));
    } finally {
      setSavingOpenAi(false);
    }
  }

  async function clearOpenAi() {
    if (!confirm(t("settings.clearConfirm"))) return;
    setSavingOpenAi(true);
    try {
      await api(`/organizations/${organizationId}/settings/extractor`, {
        method: "PUT",
        body: JSON.stringify({ openaiApiKey: null }),
      });
      setOpenaiKey("");
      notifySuccess(t("settings.saveSuccess"));
      await reload();
    } catch (cause) {
      notifyError(cause, t("settings.saveFailed"));
    } finally {
      setSavingOpenAi(false);
    }
  }

  async function testOpenAi() {
    setTestingOpenAi(true);
    try {
      const res = await api<{ ok: boolean; message?: string }>(`/organizations/${organizationId}/settings/extractor/test`, {
        method: "POST",
        body: JSON.stringify({
          provider: "openai",
          apiKey: openaiKey.trim() || undefined,
        }),
      });
      notifySuccess(res.message || t("settings.testSuccess"));
    } catch (cause) {
      notifyError(cause, t("settings.testFailed"));
    } finally {
      setTestingOpenAi(false);
    }
  }

  async function saveAnthropic() {
    if (!anthropicKey.trim() && !data?.anthropic.keyPreview) return;
    setSavingAnthropic(true);
    try {
      await api(`/organizations/${organizationId}/settings/extractor`, {
        method: "PUT",
        body: JSON.stringify({ anthropicApiKey: anthropicKey.trim() }),
      });
      setAnthropicKey("");
      notifySuccess(t("settings.saveSuccess"));
      await reload();
    } catch (cause) {
      notifyError(cause, t("settings.saveFailed"));
    } finally {
      setSavingAnthropic(false);
    }
  }

  async function clearAnthropic() {
    if (!confirm(t("settings.clearConfirm"))) return;
    setSavingAnthropic(true);
    try {
      await api(`/organizations/${organizationId}/settings/extractor`, {
        method: "PUT",
        body: JSON.stringify({ anthropicApiKey: null }),
      });
      setAnthropicKey("");
      notifySuccess(t("settings.saveSuccess"));
      await reload();
    } catch (cause) {
      notifyError(cause, t("settings.saveFailed"));
    } finally {
      setSavingAnthropic(false);
    }
  }

  async function testAnthropic() {
    setTestingAnthropic(true);
    try {
      const res = await api<{ ok: boolean; message?: string }>(`/organizations/${organizationId}/settings/extractor/test`, {
        method: "POST",
        body: JSON.stringify({
          provider: "anthropic",
          apiKey: anthropicKey.trim() || undefined,
        }),
      });
      notifySuccess(res.message || t("settings.testSuccess"));
    } catch (cause) {
      notifyError(cause, t("settings.testFailed"));
    } finally {
      setTestingAnthropic(false);
    }
  }

  async function saveDeepseek() {
    if (!deepseekKey.trim() && !data?.deepseek.keyPreview) return;
    setSavingDeepseek(true);
    try {
      await api(`/organizations/${organizationId}/settings/extractor`, {
        method: "PUT",
        body: JSON.stringify({ deepseekApiKey: deepseekKey.trim() }),
      });
      setDeepseekKey("");
      notifySuccess(t("settings.saveSuccess"));
      await reload();
    } catch (cause) {
      notifyError(cause, t("settings.saveFailed"));
    } finally {
      setSavingDeepseek(false);
    }
  }

  async function clearDeepseek() {
    if (!confirm(t("settings.clearConfirm"))) return;
    setSavingDeepseek(true);
    try {
      await api(`/organizations/${organizationId}/settings/extractor`, {
        method: "PUT",
        body: JSON.stringify({ deepseekApiKey: null }),
      });
      setDeepseekKey("");
      notifySuccess(t("settings.saveSuccess"));
      await reload();
    } catch (cause) {
      notifyError(cause, t("settings.saveFailed"));
    } finally {
      setSavingDeepseek(false);
    }
  }

  async function testDeepseek() {
    setTestingDeepseek(true);
    try {
      const res = await api<{ ok: boolean; message?: string }>(`/organizations/${organizationId}/settings/extractor/test`, {
        method: "POST",
        body: JSON.stringify({
          provider: "deepseek",
          apiKey: deepseekKey.trim() || undefined,
        }),
      });
      notifySuccess(res.message || t("settings.testSuccess"));
    } catch (cause) {
      notifyError(cause, t("settings.testFailed"));
    } finally {
      setTestingDeepseek(false);
    }
  }

  async function saveDocAi() {
    setSavingDocAi(true);
    try {
      await api(`/organizations/${organizationId}/settings/extractor`, {
        method: "PUT",
        body: JSON.stringify({
          documentAiProjectId: docAiProject.trim() || null,
          documentAiProcessorId: docAiProcessor.trim() || null,
          documentAiLocation: docAiLocation.trim() || "eu",
          documentAiCredentialsJson: docAiJson.trim() ? docAiJson.trim() : undefined,
        }),
      });
      setDocAiJson("");
      setDocAiProcessor("");
      notifySuccess(t("settings.saveSuccess"));
      await reload();
    } catch (cause) {
      notifyError(cause, t("settings.saveFailed"));
    } finally {
      setSavingDocAi(false);
    }
  }

  async function clearDocAi() {
    if (!confirm(t("settings.clearConfirm"))) return;
    setSavingDocAi(true);
    try {
      await api(`/organizations/${organizationId}/settings/extractor`, {
        method: "PUT",
        body: JSON.stringify({
          documentAiProjectId: null,
          documentAiProcessorId: null,
          documentAiLocation: null,
          documentAiCredentialsJson: null,
        }),
      });
      setDocAiProject("");
      setDocAiProcessor("");
      setDocAiJson("");
      notifySuccess(t("settings.saveSuccess"));
      await reload();
    } catch (cause) {
      notifyError(cause, t("settings.saveFailed"));
    } finally {
      setSavingDocAi(false);
    }
  }

  async function testDocAi() {
    setTestingDocAi(true);
    try {
      const res = await api<{ ok: boolean; message?: string }>(`/organizations/${organizationId}/settings/extractor/test`, {
        method: "POST",
        body: JSON.stringify({
          provider: "documentai",
          documentAi: {
            projectId: docAiProject.trim() || undefined,
            processorId: docAiProcessor.trim() || undefined,
            location: docAiLocation || "eu",
            credentialsJson: docAiJson.trim() || undefined,
          },
        }),
      });
      notifySuccess(res.message || t("settings.testSuccess"));
    } catch (cause) {
      notifyError(cause, t("settings.testFailed"));
    } finally {
      setTestingDocAi(false);
    }
  }

  function handleJsonFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setDocAiJson(content);
      try {
        const parsed = JSON.parse(content);
        if (parsed.project_id && !docAiProject) {
          setDocAiProject(parsed.project_id);
        }
      } catch {
        // ignore
      }
    };
    reader.readAsText(file);
  }

  function renderStatusBadge(source: "organization" | "system" | "none") {
    if (source === "organization") {
      return (
        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2Icon className="mr-1 size-3" />
          {t("settings.statusActiveCustom")}
        </Badge>
      );
    }
    if (source === "system") {
      return (
        <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <SparklesIcon className="mr-1 size-3" />
          {t("settings.statusActiveSystem")}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("settings.statusNotConfigured")}
      </Badge>
    );
  }

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <ErrorBanner message={error} onRetry={reload} />

      {initialLoading ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      ) : data ? (
        <div className="flex flex-col gap-6">
          {/* Card 1: Mode d'extracció */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CpuIcon className="size-5 text-primary" />
                <CardTitle>{t("settings.modeTitle")}</CardTitle>
              </div>
              <CardDescription>{t("settings.modeDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => saveMode("auto")}
                  disabled={savingMode}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                    mode === "auto"
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40 bg-card"
                  }`}
                >
                  <span className="font-semibold text-sm">{t("settings.modeAuto")}</span>
                  <span className="mt-1 text-xs text-muted-foreground">{t("settings.modeAutoHint")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => saveMode("gemini")}
                  disabled={savingMode}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                    mode === "gemini"
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40 bg-card"
                  }`}
                >
                  <span className="font-semibold text-sm">{t("settings.modeGemini")}</span>
                  <span className="mt-1 text-xs text-muted-foreground">{t("settings.modeGeminiHint")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => saveMode("openai")}
                  disabled={savingMode}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                    mode === "openai"
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40 bg-card"
                  }`}
                >
                  <span className="font-semibold text-sm">{t("settings.modeOpenAi")}</span>
                  <span className="mt-1 text-xs text-muted-foreground">{t("settings.modeOpenAiHint")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => saveMode("anthropic")}
                  disabled={savingMode}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                    mode === "anthropic"
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40 bg-card"
                  }`}
                >
                  <span className="font-semibold text-sm">{t("settings.modeAnthropic")}</span>
                  <span className="mt-1 text-xs text-muted-foreground">{t("settings.modeAnthropicHint")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => saveMode("deepseek")}
                  disabled={savingMode}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                    mode === "deepseek"
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40 bg-card"
                  }`}
                >
                  <span className="font-semibold text-sm">{t("settings.modeDeepSeek")}</span>
                  <span className="mt-1 text-xs text-muted-foreground">{t("settings.modeDeepSeekHint")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => saveMode("documentai")}
                  disabled={savingMode}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                    mode === "documentai"
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40 bg-card"
                  }`}
                >
                  <span className="font-semibold text-sm">{t("settings.modeDocAi")}</span>
                  <span className="mt-1 text-xs text-muted-foreground">{t("settings.modeDocAiHint")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => saveMode("local")}
                  disabled={savingMode}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                    mode === "local"
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40 bg-card"
                  }`}
                >
                  <span className="font-semibold text-sm">{t("settings.modeLocal")}</span>
                  <span className="mt-1 text-xs text-muted-foreground">{t("settings.modeLocalHint")}</span>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Card 2a: Google Gemini API */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="size-5 text-blue-500 dark:text-blue-400" />
                  <CardTitle>{t("settings.geminiTitle")}</CardTitle>
                </div>
                <CardDescription>{t("settings.geminiDescription")}</CardDescription>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-mono text-[11px]">
                    gemini-2.5-flash (predeterminat)
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[11px] text-muted-foreground">
                    gemini-2.5-pro
                  </Badge>
                </div>
              </div>
              {renderStatusBadge(data.gemini.source)}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {data.gemini.keyPreview ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <KeyRoundIcon className="size-4 text-muted-foreground" />
                    <span className="font-mono">{data.gemini.keyPreview}</span>
                  </div>
                  {data.gemini.source === "organization" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={savingGemini}
                      onClick={clearGemini}
                    >
                      <Trash2Icon className="mr-1 size-3.5" />
                      {t("settings.clearKey")}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <Field
                id="gemini-key"
                label={t("settings.geminiKeyLabel")}
                hint={t("settings.geminiKeyHint")}
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="gemini-key"
                    type="password"
                    autoComplete="off"
                    value={geminiKey}
                    placeholder={data.gemini.keyPreview ? "•••••••• (deixa en blanc per no canviar)" : t("settings.geminiKeyPlaceholder")}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    className="flex-1 font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={testingGemini || (!geminiKey.trim() && !data.gemini.configured)}
                      onClick={testGemini}
                    >
                      {testingGemini ? t("settings.testing") : t("settings.testButton")}
                    </Button>
                    <Button
                      type="button"
                      disabled={savingGemini || !geminiKey.trim()}
                      onClick={saveGemini}
                    >
                      {savingGemini ? t("settings.saving") : t("settings.saveButton")}
                    </Button>
                  </div>
                </div>
              </Field>
            </CardContent>
          </Card>

          {/* Card 2: OpenAI API Key */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <BotIcon className="size-5 text-emerald-600 dark:text-emerald-400" />
                  <CardTitle>{t("settings.openAiTitle")}</CardTitle>
                </div>
                <CardDescription>{t("settings.openAiDescription")}</CardDescription>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-mono text-[11px]">
                    gpt-4o (recomanat)
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[11px] text-muted-foreground">
                    gpt-4o-mini
                  </Badge>
                </div>
              </div>
              {renderStatusBadge(data.openai.source)}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {data.openai.keyPreview ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <KeyRoundIcon className="size-4 text-muted-foreground" />
                    <span className="font-mono">{data.openai.keyPreview}</span>
                  </div>
                  {data.openai.source === "organization" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={savingOpenAi}
                      onClick={clearOpenAi}
                    >
                      <Trash2Icon className="mr-1 size-3.5" />
                      {t("settings.clearKey")}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <Field
                id="openai-key"
                label={t("settings.openAiKeyLabel")}
                hint={t("settings.openAiKeyHint")}
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="openai-key"
                    type="password"
                    autoComplete="off"
                    value={openaiKey}
                    placeholder={data.openai.keyPreview ? "•••••••• (deixa en blanc per no canviar)" : t("settings.openAiKeyPlaceholder")}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="flex-1 font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={testingOpenAi || (!openaiKey.trim() && !data.openai.configured)}
                      onClick={testOpenAi}
                    >
                      {testingOpenAi ? t("settings.testing") : t("settings.testButton")}
                    </Button>
                    <Button
                      type="button"
                      disabled={savingOpenAi || !openaiKey.trim()}
                      onClick={saveOpenAi}
                    >
                      {savingOpenAi ? t("settings.saving") : t("settings.saveButton")}
                    </Button>
                  </div>
                </div>
              </Field>
            </CardContent>
          </Card>

          {/* Card 2b: Anthropic Claude */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="size-5 text-amber-600 dark:text-amber-400" />
                  <CardTitle>{t("settings.anthropicTitle")}</CardTitle>
                </div>
                <CardDescription>{t("settings.anthropicDescription")}</CardDescription>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 font-mono text-[11px]">
                    claude-3-7-sonnet-latest (recomanat)
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[11px] text-muted-foreground">
                    claude-3-5-haiku-latest
                  </Badge>
                </div>
              </div>
              {renderStatusBadge(data.anthropic.source)}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {data.anthropic.keyPreview ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <KeyRoundIcon className="size-4 text-muted-foreground" />
                    <span className="font-mono">{data.anthropic.keyPreview}</span>
                  </div>
                  {data.anthropic.source === "organization" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={savingAnthropic}
                      onClick={clearAnthropic}
                    >
                      <Trash2Icon className="mr-1 size-3.5" />
                      {t("settings.clearKey")}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <Field
                id="anthropic-key"
                label={t("settings.anthropicKeyLabel")}
                hint={t("settings.anthropicKeyHint")}
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="anthropic-key"
                    type="password"
                    autoComplete="off"
                    value={anthropicKey}
                    placeholder={data.anthropic.keyPreview ? "•••••••• (deixa en blanc per no canviar)" : t("settings.anthropicKeyPlaceholder")}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    className="flex-1 font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={testingAnthropic || (!anthropicKey.trim() && !data.anthropic.configured)}
                      onClick={testAnthropic}
                    >
                      {testingAnthropic ? t("settings.testing") : t("settings.testButton")}
                    </Button>
                    <Button
                      type="button"
                      disabled={savingAnthropic || !anthropicKey.trim()}
                      onClick={saveAnthropic}
                    >
                      {savingAnthropic ? t("settings.saving") : t("settings.saveButton")}
                    </Button>
                  </div>
                </div>
              </Field>
            </CardContent>
          </Card>

          {/* Card 2c: DeepSeek */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <BotIcon className="size-5 text-indigo-600 dark:text-indigo-400" />
                  <CardTitle>{t("settings.deepseekTitle")}</CardTitle>
                </div>
                <CardDescription>{t("settings.deepseekDescription")}</CardDescription>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 font-mono text-[11px]">
                    deepseek-chat (V3) (recomanat)
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[11px] text-muted-foreground">
                    deepseek-reasoner (R1)
                  </Badge>
                </div>
              </div>
              {renderStatusBadge(data.deepseek.source)}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {data.deepseek.keyPreview ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <KeyRoundIcon className="size-4 text-muted-foreground" />
                    <span className="font-mono">{data.deepseek.keyPreview}</span>
                  </div>
                  {data.deepseek.source === "organization" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={savingDeepseek}
                      onClick={clearDeepseek}
                    >
                      <Trash2Icon className="mr-1 size-3.5" />
                      {t("settings.clearKey")}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <Field
                id="deepseek-key"
                label={t("settings.deepseekKeyLabel")}
                hint={t("settings.deepseekKeyHint")}
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="deepseek-key"
                    type="password"
                    autoComplete="off"
                    value={deepseekKey}
                    placeholder={data.deepseek.keyPreview ? "•••••••• (deixa en blanc per no canviar)" : t("settings.deepseekKeyPlaceholder")}
                    onChange={(e) => setDeepseekKey(e.target.value)}
                    className="flex-1 font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={testingDeepseek || (!deepseekKey.trim() && !data.deepseek.configured)}
                      onClick={testDeepseek}
                    >
                      {testingDeepseek ? t("settings.testing") : t("settings.testButton")}
                    </Button>
                    <Button
                      type="button"
                      disabled={savingDeepseek || !deepseekKey.trim()}
                      onClick={saveDeepseek}
                    >
                      {savingDeepseek ? t("settings.saving") : t("settings.saveButton")}
                    </Button>
                  </div>
                </div>
              </Field>
            </CardContent>
          </Card>

          {/* Card 3: Google Document AI */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="size-5 text-blue-600 dark:text-blue-400" />
                  <CardTitle>{t("settings.docAiTitle")}</CardTitle>
                </div>
                <CardDescription>{t("settings.docAiDescription")}</CardDescription>
              </div>
              {renderStatusBadge(data.documentAi.source)}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {data.documentAi.clientEmail ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{t("settings.docAiEmailLabel")}</span>
                    <span className="font-mono text-sm">{data.documentAi.clientEmail}</span>
                  </div>
                  {data.documentAi.source === "organization" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={savingDocAi}
                      onClick={clearDocAi}
                    >
                      <Trash2Icon className="mr-1 size-3.5" />
                      {t("settings.clearKey")}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <Field id="docai-project" label={t("settings.docAiProjectLabel")}>
                  <Input
                    id="docai-project"
                    value={docAiProject}
                    placeholder={t("settings.docAiProjectPlaceholder")}
                    onChange={(e) => setDocAiProject(e.target.value)}
                  />
                </Field>

                <Field id="docai-processor" label={t("settings.docAiProcessorLabel")}>
                  <Input
                    id="docai-processor"
                    value={docAiProcessor}
                    placeholder={data.documentAi.processorId || t("settings.docAiProcessorPlaceholder")}
                    onChange={(e) => setDocAiProcessor(e.target.value)}
                  />
                </Field>

                <Field id="docai-location" label={t("settings.docAiLocationLabel")}>
                  <NativeSelect
                    id="docai-location"
                    value={docAiLocation}
                    onChange={(e) => setDocAiLocation(e.target.value)}
                  >
                    <option value="eu">{t("settings.docAiLocationEu")}</option>
                    <option value="us">{t("settings.docAiLocationUs")}</option>
                  </NativeSelect>
                </Field>
              </div>

              <Field
                id="docai-json"
                label={t("settings.docAiJsonLabel")}
                hint={t("settings.docAiJsonHint")}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleJsonFileUpload}
                      className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-secondary-foreground hover:file:bg-secondary/80"
                    />
                  </div>
                  <textarea
                    id="docai-json"
                    rows={3}
                    value={docAiJson}
                    placeholder={data.documentAi.configured ? "•••••••• (deixa en blanc per mantenir l'arxiu actual)" : t("settings.docAiJsonPlaceholder")}
                    onChange={(e) => setDocAiJson(e.target.value)}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </Field>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={testingDocAi || (!docAiJson.trim() && !data.documentAi.configured)}
                  onClick={testDocAi}
                >
                  {testingDocAi ? t("settings.testing") : t("settings.testButton")}
                </Button>
                <Button
                  type="button"
                  disabled={savingDocAi || (!docAiProject && !docAiProcessor && !docAiJson)}
                  onClick={saveDocAi}
                >
                  {savingDocAi ? t("settings.saving") : t("settings.saveButton")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Connexió amb el servidor API */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ServerIcon className="size-5 text-primary" />
                <CardTitle>{t("settings.apiServerTitle")}</CardTitle>
              </div>
              <CardDescription>{t("settings.apiServerDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field
                id="custom-api-url"
                label={t("settings.apiServerUrl")}
                hint={t("settings.apiServerHint")}
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="custom-api-url"
                    value={customApiUrl}
                    placeholder={t("settings.apiServerPlaceholder")}
                    onChange={(e) => setCustomApiUrlState(e.target.value)}
                    className="font-mono text-xs sm:text-sm"
                  />
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={testingApiServer}
                      onClick={testApiServer}
                    >
                      {testingApiServer ? t("settings.testing") : t("settings.apiServerTest")}
                    </Button>
                    <Button
                      type="button"
                      onClick={saveApiServer}
                    >
                      {t("settings.saveButton")}
                    </Button>
                    {customApiUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={resetApiServer}
                      >
                        {t("settings.apiServerReset")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Field>
            </CardContent>
          </Card>

          {/* Info Card */}
          <div className="flex items-start gap-3 rounded-xl border border-muted-foreground/20 bg-muted/30 p-4 text-xs text-muted-foreground">
            <InfoIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-foreground">{t("settings.guideTitle")}</span>
              <p>{t("settings.guideP1")}</p>
              <p>{t("settings.guideP2")}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

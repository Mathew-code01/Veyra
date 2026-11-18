import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageContainer } from "@/components/layout/PageContainer";
import { useNavigate } from "react-router-dom";
import { Cpu } from "lucide-react";
import { ExternalLink, KeyRound, ShieldCheck } from "lucide-react";

import type {
  ProviderStatus,
  ProvidersGetStatusResult,
} from "../../../../desktop/ipc/providers.ipc";

const PROVIDER_LINKS: Record<string, { keyUrl: string; note: string }> = {
  gemini: { keyUrl: "https://aistudio.google.com/app/apikey", note: "Google AI Studio API key" },
  groq: { keyUrl: "https://console.groq.com/keys", note: "Groq API key" },
  mistral: { keyUrl: "https://console.mistral.ai/api-keys/", note: "Mistral API key" },
  cerebras: { keyUrl: "https://cloud.cerebras.ai/", note: "Cerebras Cloud API key" },
  huggingface: { keyUrl: "https://huggingface.co/settings/tokens", note: "Hugging Face access token" },
  openrouter: { keyUrl: "https://openrouter.ai/settings/keys", note: "OpenRouter API key" },
};

export function Settings() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ProvidersGetStatusResult>();
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busyProvider, setBusyProvider] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setError(undefined);
    if (!window.veyra?.providers?.getStatus) {
      setError("VEYRA Desktop is required for provider settings.");
      return;
    }
    try {
      const result = await window.veyra.providers.getStatus();
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? "Could not load provider settings.");
      }
      setStatus(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load provider settings.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveKey = async (provider: ProviderStatus) => {
    const secret = secrets[provider.providerId]?.trim();
    if (!secret) {
      setError("Enter a key before saving.");
      return;
    }
    setBusyProvider(provider.providerId);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await window.veyra.providers.saveCredential({
        providerId: provider.providerId,
        secret,
      });
      if (!result.success) {
        throw new Error(result.error?.message ?? "Could not save the key.");
      }
      setSecrets((current) => ({ ...current, [provider.providerId]: "" }));
      setMessage(`Credential saved securely for ${provider.name}.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Credential save failed.");
    } finally {
      setBusyProvider(undefined);
    }
  };

  const verifyKey = async (provider: ProviderStatus) => {
    setBusyProvider(provider.providerId);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await window.veyra.providers.verifyCredential({
        providerId: provider.providerId,
      });
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? "Credential health check failed.");
      }
      const health = result.data;
      setMessage(
        `${provider.name}: ${health.status}${health.latencyMs === undefined ? "" : ` (${health.latencyMs} ms)`}${health.error ? ` — ${health.error}` : ""}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Credential health check failed.");
    } finally {
      setBusyProvider(undefined);
    }
  };

  const removeKey = async (provider: ProviderStatus) => {
    setBusyProvider(provider.providerId);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await window.veyra.providers.deleteCredential({
        providerId: provider.providerId,
      });
      if (!result.success) {
        throw new Error(result.error?.message ?? "Could not delete the credential.");
      }
      setMessage(`Stored credential removed for ${provider.name}.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Credential deletion failed.");
    } finally {
      setBusyProvider(undefined);
    }
  };

  const setLocalOnly = async () => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await window.veyra.providers.setExecutionMode({
        mode: "local-only",
      });
      if (!result.success) {
        throw new Error(result.error?.message ?? "Could not set local-only mode.");
      }
      setMessage("Execution mode is set to local-only.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update execution mode.");
    } finally {
      setBusy(false);
    }
  };

  const savePreferredModel = async (provider: ProviderStatus) => {
    const modelId = selectedModels[provider.providerId] ?? provider.preferredModel ?? "";
    if (!modelId || !provider.models.some((model) => model.modelId === modelId)) {
      setError("Choose a model from this provider's supported catalogue.");
      return;
    }
    setBusyProvider(provider.providerId);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await window.veyra.providers.setPreferredModel({ providerId: provider.providerId, modelId });
      if (!result.success) throw new Error(result.error?.message ?? "Could not save the preferred model.");
      setMessage(`${provider.name} model preference saved.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the preferred model.");
    } finally {
      setBusyProvider(undefined);
    }
  };

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold">AI & Provider Settings</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Keys are stored locally using OS-backed encryption and never returned to the interface. Connection checks call each provider's authenticated health/model endpoint; they do not run an inference request.
      </p>

      <Card className="mt-5 border-indigo-300/20 bg-indigo-500/5">
        <CardContent className="flex items-start gap-3 pt-5 text-sm">
          <ShieldCheck className="mt-0.5 shrink-0 text-indigo-300" size={18} />
          <p className="text-zinc-300">These credentials are device-local and are not synchronized to VEYRA Platform. Requests to external providers remain blocked until the app's explicit external-processing policy is configured. A successful connection check verifies authentication only; it does not enable model execution.</p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
          <div><h2 className="font-medium">Local model setup</h2><p className="mt-1 text-sm text-zinc-500">Review this device’s detected capabilities, verified model packages and installed models.</p></div>
          <Button variant="outline" onClick={() => navigate("/ai-setup")}><Cpu size={16}/>Hardware & models</Button>
        </CardContent>
      </Card>

      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-emerald-400">{message}</p>}

      <Card className="mt-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
          <div>
            <h2 className="font-medium">Execution mode</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Current preference: {status?.executionMode ?? "loading"}.
              Cloud inference remains disabled until user consent, model pricing and durable quota policy are configured.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy || status?.executionMode === "local-only"}
            onClick={() => void setLocalOnly()}
          >
            Use local-only
          </Button>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4">
        {status?.providers.map((provider) => (
          <Card key={provider.providerId}>
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><KeyRound size={16} className="text-indigo-300" /><h2 className="font-medium">{provider.name}</h2></div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {provider.configured ? `Credential stored (${provider.maskedKey ?? "****"})` : "No credential stored"}
                  </p>
                </div>
                {PROVIDER_LINKS[provider.providerId] && (
                  <a href={PROVIDER_LINKS[provider.providerId].keyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200">
                    Get a key from {PROVIDER_LINKS[provider.providerId].note} <ExternalLink size={12} />
                  </a>
                )}
                <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
                  Cloud inference disabled
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="min-w-64 flex-1 text-xs text-zinc-400">
                  Provider API key
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={secrets[provider.providerId] ?? ""}
                    onChange={(event) =>
                      setSecrets((current) => ({
                        ...current,
                        [provider.providerId]: event.target.value,
                      }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-black/20 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Key is sent only to the main process"
                  />
                </label>
                <Button
                  size="sm"
                  loading={busyProvider === provider.providerId}
                  disabled={Boolean(busyProvider)}
                  onClick={() => void saveKey(provider)}
                >
                  Save key
                </Button>
                {provider.configured && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busyProvider === provider.providerId}
                      disabled={Boolean(busyProvider)}
                      onClick={() => void verifyKey(provider)}
                    >
                      Check connection
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={Boolean(busyProvider)}
                      onClick={() => void removeKey(provider)}
                    >
                      Remove key
                    </Button>
                  </>
                )}
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-medium">Model catalog</h3>
                {provider.models.length ? (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="min-w-64 flex-1 text-xs text-zinc-400">Preferred model
                      <select value={selectedModels[provider.providerId] ?? provider.preferredModel ?? ""} onChange={(event) => setSelectedModels((current) => ({ ...current, [provider.providerId]: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-border bg-black/20 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-primary/50">
                        <option value="" disabled>Select a supported model</option>
                        {provider.models.map((model) => <option key={model.modelId} value={model.modelId}>{model.displayName} — {model.modelId}</option>)}
                      </select>
                    </label>
                    <Button size="sm" variant="outline" disabled={Boolean(busyProvider) || !provider.models.length} loading={busyProvider === provider.providerId} onClick={() => void savePreferredModel(provider)}>Save model</Button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-zinc-500">No catalog entries are registered.</p>
                )}
                <p className="mt-2 text-xs text-zinc-500">
                  Capabilities: {Object.entries(provider.capabilities).filter(([, supported]) => supported).map(([name]) => name).join(", ") || "none reported"}. The list is the app's supported catalogue; access can vary by provider account.
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
        {!status?.providers.length && !error && (
          <Card><CardContent className="pt-5 text-sm text-zinc-400">Loading registered providers…</CardContent></Card>
        )}
      </div>
    </PageContainer>
  );
}

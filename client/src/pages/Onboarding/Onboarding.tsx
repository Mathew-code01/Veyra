import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Cpu, HardDrive, MemoryStick, RefreshCw, ShieldCheck, Sparkles, UserRound, WandSparkles, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { HardwareAssessmentResponse, ModelInstallProgress } from "../../../../shared/types/hardware";
import {
  loadHardwareAssessment,
  installHardwareModel,
  uninstallHardwareModel,
  cancelHardwareInstall,
  subscribeHardwareInstallProgress,
} from "@/services/ipc/hardwareClient";

const steps = ["Welcome", "Profile", "AI setup", "Privacy"];
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${Math.round(value / 1024 ** 2)} MB`;
const formatGB = (value: number | undefined) => Number.isFinite(value) ? `${value!.toFixed(1)} GB` : "Unavailable";
const labels = { highly_recommended: "Strong fit", supported_with_limitations: "Supported with limits", not_recommended: "Not recommended for typical use", unsupported: "Not supported" } as const;

export function Onboarding({ initialStep = 0 }: { initialStep?: number }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(initialStep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [assessment, setAssessment] = useState<HardwareAssessmentResponse>();
  const [hardwareState, setHardwareState] = useState<"idle" | "loading" | "ready" | "partial" | "unsupported" | "error">("idle");
  const [progress, setProgress] = useState<ModelInstallProgress>();
  const [installing, setInstalling] = useState("");
  const continueSetup = () => setStep((current) => Math.min(current + 1, steps.length - 1));
  const loadAssessment = useCallback(async (forceRefresh = false) => {
    setBusy(true); setError(""); setHardwareState("loading");
    try {
      const result = await loadHardwareAssessment({ forceRefresh });
      if (result.state === "unsupported") {
        setHardwareState("unsupported");
        setAssessment(undefined);
        return;
      }
      if (result.state === "error") {
        setHardwareState("error");
        setAssessment(undefined);
        setError(result.error);
        return;
      }
      setAssessment(result.assessment);
      setHardwareState(result.state);
    } catch (cause) {
      setHardwareState("error");
      setAssessment(undefined);
      setError(cause instanceof Error ? cause.message : "Hardware assessment could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => { if (step === 2 && !assessment) void loadAssessment(); }, [step, assessment, loadAssessment]);
  useEffect(() => subscribeHardwareInstallProgress(setProgress), []);
  const signIn = async () => {
    setBusy(true); setError("");
    try {
      if (!window.veyra?.platform?.browserSignIn) throw new Error("Desktop platform service unavailable in this environment.");
      await window.veyra.platform.browserSignIn();
      setStep(1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in did not complete. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const install = async (modelId: string) => {
    setInstalling(modelId); setProgress(undefined); setError("");
    try {
      const result = await installHardwareModel(modelId);
      if (!result?.installed) throw new Error("The download finished but the model is not registered as installed.");
      await loadAssessment(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Model installation failed. You can retry from AI settings.");
    } finally {
      setInstalling(""); setProgress(undefined);
    }
  };
  const uninstall = async (modelId: string) => {
    setError("");
    try {
      await uninstallHardwareModel(modelId);
      await loadAssessment(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this model.");
    }
  };
  const finish = () => { localStorage.setItem("veyra.firstLaunch.setupComplete", "true"); window.dispatchEvent(new Event("veyra:setup-complete")); navigate("/", { replace: true }); };
  const titles = ["Meet VEYRA", "Make it yours", "Let's prepare VEYRA for your computer", "Your privacy stays in view"];
  const descriptions = ["A desktop copilot for interview practice and contextual assistance. Interviews and documents stay in the desktop app.", "Add a candidate profile and CV whenever you are ready. You can skip this and complete it later.", "We check this computer against VEYRA’s verified local model catalogue. The assessment stays on your device; speed is not promised unless measured.", "Microphone and screen context are off until you explicitly start a feature. You can review permissions and privacy settings at any time."];
  const Icon = [Sparkles, UserRound, WandSparkles, ShieldCheck][step];
  return <main className="min-h-screen bg-[radial-gradient(ellipse_at_top_left,_#eeebff,_#fafaff_48%,_#f5f7fb)] px-4 py-6 text-slate-900 sm:px-6 sm:py-10">
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-2xl shadow-indigo-950/10 backdrop-blur sm:min-h-[calc(100vh-5rem)]">
      <header className="flex items-center justify-between border-b border-slate-100 px-6 py-5 sm:px-8"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-lg font-bold text-white">V</span><span className="font-semibold tracking-[.14em]">VEYRA</span></div><span className="text-xs text-slate-500">First-time setup</span></header>
      <div className="grid flex-1 lg:grid-cols-[.8fr_1.2fr]">
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#21165e] via-[#4433a7] to-[#7770e9] p-10 text-white lg:flex lg:flex-col lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-indigo-200">Practice. Prepare. Perform.</p><h2 className="mt-5 max-w-sm text-4xl font-semibold leading-tight">Clearer preparation for what comes next.</h2><p className="mt-4 max-w-sm text-sm leading-6 text-indigo-100">Your workspace for focused interview practice, personal context and optional AI assistance.</p></div><div className="rounded-2xl border border-white/15 bg-white/10 p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-white/15"><ShieldCheck size={20}/></span><div><p className="text-sm font-medium">You stay in control</p><p className="mt-1 text-xs text-indigo-100">Capture starts only when you choose.</p></div></div></div></aside>
        <section className="flex flex-col justify-center px-6 py-8 sm:px-10 lg:px-12"><div className="mb-8 flex gap-2" aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map((name, index) => <div key={name} title={name} className="h-1.5 flex-1 rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all motion-reduce:transition-none ${index <= step ? "w-full bg-indigo-600" : "w-0"}`} /></div>)}</div>
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700"><Icon size={22}/></div><p className="mt-6 text-xs font-semibold uppercase tracking-[.18em] text-indigo-600">{steps[step]}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{titles[step]}</h1><p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">{descriptions[step]}</p>
          {step === 0 && <div className="mt-8 space-y-3"><Button className="w-full" disabled={busy} onClick={() => void signIn()}>{busy ? "Opening secure sign-in…" : "Sign in or create an account"}<ArrowRight size={16}/></Button><p className="text-center text-xs text-slate-500">Authentication opens in your system browser and uses your VEYRA Website account.</p></div>}
          {step === 1 && <div className="mt-8 flex flex-wrap gap-3"><Button onClick={() => navigate("/profile")}>Set up profile <ArrowRight size={15}/></Button><Button variant="outline" onClick={continueSetup}>Do this later</Button></div>}
          {step === 2 && <div className="mt-6 space-y-4">
            {busy && !assessment && <p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">Inspecting this computer…</p>}
            {hardwareState === "unsupported" && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-medium">Hardware assessment requires VEYRA Desktop</p><p className="mt-1">This page is running in a browser without the secure Desktop hardware bridge. Open VEYRA Desktop to inspect this computer and manage local models.</p></div>}
            {hardwareState === "error" && !assessment && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-medium">Hardware assessment failed</p><p className="mt-1">{error || "Hardware information is temporarily unavailable. Check that VEYRA is online and try again."}</p><Button className="mt-3" variant="outline" disabled={busy} onClick={() => void loadAssessment(true)}>Retry assessment</Button></div>}
            {assessment && <>
              {hardwareState === "partial" && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Some hardware details are unavailable. Model recommendations use only the information detected.</p>}
              <div className="grid gap-2 sm:grid-cols-2"><Metric icon={<Cpu size={16}/>} label="Processor" value={`${assessment.profile.cpu?.brand || "Unavailable"} · ${Number.isFinite(assessment.profile.cpu?.logicalCores) ? `${assessment.profile.cpu.logicalCores} threads` : "thread count unavailable"}`}/><Metric icon={<MemoryStick size={16}/>} label="Memory" value={`${formatGB(assessment.profile.memory?.totalGB)} total · ${formatGB(assessment.profile.memory?.availableGB)} available`}/><Metric icon={<Sparkles size={16}/>} label="Graphics" value={assessment.profile.gpus?.length ? assessment.profile.gpus.map((gpu) => `${gpu.model || "Graphics device"}${gpu.vramBytes ? ` · ${bytes(gpu.vramBytes)} VRAM` : ""}`).join(", ") : "No dedicated GPU detected"}/><Metric icon={<HardDrive size={16}/>} label="Model storage volume" value={`${formatGB(assessment.profile.storage?.freeGB)} free`}/></div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3"><div><p className="text-sm font-medium">Local runtime</p><p className="mt-1 text-xs text-slate-500">{assessment.localRuntimeReady ? `Registered runtimes: ${assessment.runtimeNames.join(", ")}` : "No compatible local runtime is currently registered."}</p></div><button aria-label="Refresh hardware assessment" onClick={() => void loadAssessment(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><RefreshCw size={16}/></button></div>
              <p className="text-xs leading-5 text-slate-500">Runtime registration does not prove that a model is loaded or fast on this device. No inference benchmark is run during setup.</p>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">{assessment.models.filter((model) => model.modality === "llm").sort((a,b) => ["highly_recommended","supported_with_limitations","not_recommended","unsupported"].indexOf(a.classification) - ["highly_recommended","supported_with_limitations","not_recommended","unsupported"].indexOf(b.classification)).map((model) => <article key={model.modelId} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{model.name}</h3><span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700">{labels[model.classification]}</span></div><p className="mt-1 text-xs text-slate-500">{model.quantization} · {model.runtime} · {model.license.name}</p><p className="mt-2 text-xs text-slate-600">RAM: {bytes(model.minimumRamBytes)} minimum, {bytes(model.recommendedRamBytes)} recommended · Download: {model.artifact ? bytes(model.artifact.sizeBytes) : "not available"}</p>{model.limitations.slice(0,2).map((reason) => <p key={reason} className="mt-1 text-xs text-amber-700">{reason}</p>)}</div><div className="shrink-0">{model.installed ? <button onClick={() => void uninstall(model.modelId)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100"><Trash2 size={14}/> Remove</button> : model.artifact && model.canLoad && <Button disabled={Boolean(installing)} onClick={() => void install(model.modelId)}><Download size={14}/>{installing === model.modelId ? "Installing…" : "Install"}</Button>}</div></div>{installing === model.modelId && progress && <div className="mt-3"><div className="h-1.5 overflow-hidden rounded bg-slate-100"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress.percentage ?? 0}%` }}/></div><p className="mt-1 text-xs text-slate-500">{progress.phase === "verifying" ? "Verifying checksum…" : `${progress.percentage ?? 0}% · ${bytes(progress.bytesDownloaded)} downloaded`}</p></div>}</article>)}</div>
            </>}
            <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Cloud execution depends on configured providers and account policy. You can review supported providers and securely configure your own key in settings. No cloud request is made by this assessment.</div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate("/settings")}>Provider & key settings</Button></div>
            <Button onClick={continueSetup}>Continue <ArrowRight size={16}/></Button>
          </div>}
          {step === 3 && <div className="mt-8 space-y-4"><div className="rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-600"><Check className="mr-2 inline text-emerald-600" size={16}/>Microphone and screen access are requested only when you start a feature that needs them.</div><Button onClick={finish}>Finish setup <ArrowRight size={16}/></Button></div>}
          {busy && step === 0 && <button className="mt-3 w-full text-sm text-slate-500 hover:text-slate-900" onClick={() => void window.veyra?.platform?.cancelBrowserSignIn?.()}>Cancel sign-in</button>}
          {installing && <button className="mt-2 text-xs text-slate-500 underline" onClick={async () => { await cancelHardwareInstall(installing); }}>Cancel model installation</button>}
          {installing && progress?.phase === "verifying" && <p className="sr-only" aria-live="polite">Verifying downloaded model integrity.</p>}
          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          {step > 0 && <div className="mt-6 flex justify-between"><button className="text-sm text-slate-500 hover:text-slate-900" onClick={() => setStep((current) => Math.max(0, current - 1))}>Back</button>{step < steps.length - 1 && <button className="text-sm text-slate-500 hover:text-slate-900" onClick={continueSetup}>Skip setup step</button>}</div>}
        </section>
      </div>
    </div>
  </main>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2 text-xs font-medium text-slate-500">{icon}{label}</div><p className="mt-2 truncate text-xs font-medium text-slate-800" title={value}>{value}</p></div>;
}

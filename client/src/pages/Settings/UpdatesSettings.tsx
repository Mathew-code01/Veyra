import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpCircle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

const panel =
  "rounded-xl border border-[#E2E5EF] bg-white p-5 shadow-[0_12px_36px_-28px_rgba(24,32,68,0.34)]";

export function UpdatesSettings() {
  const [currentVersion, setCurrentVersion] = useState("0.5.6");
  const [channel, setChannel] = useState<"stable" | "beta">("stable");
  const [autoCheck, setAutoCheck] = useState(true);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [status, setStatus] = useState<"up-to-date" | "available" | "downloading" | "downloaded" | "installing" | "error">("up-to-date");
  const [lastChecked, setLastChecked] = useState("Never");
  const [platformName, setPlatformName] = useState("Windows (x64)");
  const [latestVersion, setLatestVersion] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribeProgress: (() => void) | null = null;
    let unsubscribeState: (() => void) | null = null;

    const fetchAppInfo = async () => {
      try {
        if (window.veyra?.app?.getVersion) {
          const ver = await window.veyra.app.getVersion();
          if (active && ver) setCurrentVersion(ver);
        }
      } catch {
        // Fallback version
      }

      try {
        if (window.veyra?.app?.getPlatform) {
          const plat = await window.veyra.app.getPlatform();
          if (active) {
            if (plat === "win32") setPlatformName("Windows (x64)");
            else if (plat === "darwin") setPlatformName("macOS (Apple Silicon & Intel)");
            else if (plat === "linux") setPlatformName("Linux (x64 AppImage)");
          }
        }
      } catch {
        // Fallback platform
      }
    };

    const fetchUpdaterStatus = async () => {
      try {
        if (window.veyra?.updater?.getStatus) {
          const result = await window.veyra.updater.getStatus();
          if (active && result) {
            if (result.latestVersion && result.latestVersion !== result.currentVersion) {
              setLatestVersion(result.latestVersion);
              if (result.state === "downloaded") {
                setStatus("available");
              } else if (result.state === "downloading") {
                setStatus("downloading");
                setDownloading(true);
                setDownloadProgress(result.progress?.percent ?? 0);
              } else if (result.state === "installing") {
                setStatus("installing");
              } else if (result.state === "error") {
                setStatus("error");
                setError(result.error ?? "Unknown error");
              }
            }
            setChannel(result.channel);
            setAutoCheck(result.autoCheck);
            if (result.lastChecked) {
              const date = new Date(result.lastChecked);
              setLastChecked(date.toLocaleString());
            }
          }
        }
      } catch {
        // Ignore status fetch errors
      }
    };

    const setupListeners = () => {
      if (window.veyra?.updater?.onProgress) {
        unsubscribeProgress = window.veyra.updater.onProgress((progress) => {
          if (active) {
            setDownloading(true);
            setDownloadProgress(progress.percent);
            setStatus("downloading");
          }
        });
      }
      if (window.veyra?.updater?.onStateChange) {
        unsubscribeState = window.veyra.updater.onStateChange((status) => {
          if (active) {
            if (status.latestVersion && status.latestVersion !== status.currentVersion) {
              setLatestVersion(status.latestVersion);
              setReleaseNotes("");
            }
            setChannel(status.channel);
            setAutoCheck(status.autoCheck);
            if (status.lastChecked) {
              const date = new Date(status.lastChecked);
              setLastChecked(date.toLocaleString());
            }
            if (status.state === "downloaded") {
              setDownloading(false);
              setStatus("available");
            } else if (status.state === "downloading") {
              setDownloading(true);
              setStatus("downloading");
            } else if (status.state === "installing") {
              setDownloading(false);
              setStatus("installing");
            } else if (status.state === "error") {
              setDownloading(false);
              setStatus("error");
              setError(status.error ?? "Unknown error");
            } else if (status.state === "idle") {
              setDownloading(false);
              if (!status.latestVersion || status.latestVersion === status.currentVersion) {
                setStatus("up-to-date");
              }
            }
          }
        });
      }
    };

    const initialize = async () => {
      await fetchAppInfo();
      await fetchUpdaterStatus();
      setupListeners();
    };

    void initialize();

    return () => {
      active = false;
      unsubscribeProgress?.();
      unsubscribeState?.();
    };
  }, []);

  const checkForUpdates = async () => {
    setChecking(true);
    setError("");
    setStatus("up-to-date");
    try {
      if (window.veyra?.updater?.checkForUpdates) {
        const result = await window.veyra.updater.checkForUpdates(true);
        if (result.success && result.data) {
          if (result.data.hasUpdate) {
            setLatestVersion(result.data.latestVersion);
            setReleaseNotes(result.data.releaseNotes ?? "");
            setStatus("available");
          } else {
            setStatus("up-to-date");
            setLatestVersion("");
          }
          const date = new Date();
          setLastChecked(date.toLocaleString());
        } else {
          setStatus("error");
          setError(result.error ?? "Failed to check for updates");
        }
      } else {
        setStatus("error");
        setError("Updater not available");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to check for updates");
    } finally {
      setChecking(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError("");
    try {
      if (window.veyra?.updater?.downloadUpdate) {
        const result = await window.veyra.updater.downloadUpdate(latestVersion);
        if (!result.success) {
          setError(result.error ?? "Download failed");
          setDownloading(false);
          setStatus("error");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
      setDownloading(false);
      setStatus("error");
    }
  };

  const handleInstall = async () => {
    setStatus("installing");
    setDownloading(false);
    setError("");
    try {
      if (window.veyra?.updater?.installUpdate) {
        const result = await window.veyra.updater.installUpdate(true);
        if (!result.success) {
          setError(result.error ?? "Install failed");
          setStatus("error");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Install failed");
      setStatus("error");
    }
  };

  const handleChannelChange = async (newChannel: "stable" | "beta") => {
    setChannel(newChannel);
    try {
      if (window.veyra?.updater?.setChannel) {
        await window.veyra.updater.setChannel(newChannel);
      }
    } catch {
      // Ignore channel change errors
    }
  };

  const handleAutoCheckChange = async (enabled: boolean) => {
    setAutoCheck(enabled);
    try {
      if (window.veyra?.updater?.setAutoCheck) {
        await window.veyra.updater.setAutoCheck(enabled);
      }
    } catch {
      // Ignore auto-check change errors
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#182044]">Updates & Releases</h2>
        <p className="mt-1 text-xs text-[#4E5A7E]">
          Manage desktop application updates, release channels, and installation integrity.
        </p>
      </div>

      {/* Current Version & Update Status */}
      <div className={panel}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ECE9FB] text-[#6b4fe0] border border-indigo-100">
              <ArrowUpCircle size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-[#182044]">
                  VEYRA Desktop
                </h3>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                  v{currentVersion}
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                  Stable Channel
                </span>
              </div>
              <p className="mt-1 text-xs text-[#4E5A7E]">
                Target platform: <strong className="font-medium text-[#182044]">{platformName}</strong>
              </p>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-[#8891A9]">
                <Clock size={12} />
                <span>Last checked: {lastChecked}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              disabled={checking || downloading}
              onClick={() => void checkForUpdates()}
            >
              <RefreshCw size={13} className={checking ? "animate-spin" : ""} />
              <span>{checking ? "Checking…" : "Check for updates"}</span>
            </Button>
          </div>
        </div>

        {/* Update Available */}
        {status === "available" && latestVersion && (
          <div className="mt-4 rounded-lg border border-indigo-100 bg-[#F8F7FF] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="shrink-0 text-indigo-600" />
                  <h4 className="font-semibold text-sm text-[#182044]">
                    Update available: v{latestVersion}
                  </h4>
                </div>
                {releaseNotes && (
                  <p className="mt-2 text-xs text-[#4E5A7E] leading-relaxed">
                    {releaseNotes}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" onClick={() => void handleDownload()} disabled={downloading}>
                  <Download size={13} />
                  <span>{downloading ? "Downloading…" : "Download"}</span>
                </Button>
              </div>
            </div>
            {downloading && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-[#4E5A7E] mb-1">
                  <span>Downloading…</span>
                  <span>{downloadProgress}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Downloading */}
        {status === "downloading" && (
          <div className="mt-4 rounded-lg border border-indigo-100 bg-[#F8F7FF] p-4">
            <div className="flex items-center gap-2 text-sm text-indigo-700">
              <Download size={16} className="animate-spin" />
              <span>Downloading update… {downloadProgress}%</span>
            </div>
            <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Installing */}
        {status === "installing" && (
          <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <ArrowUpCircle size={16} className="animate-spin" />
              <span>Installing update and restarting…</span>
            </div>
            <p className="mt-1 text-xs text-amber-600">
              The application will restart automatically to complete the installation.
            </p>
          </div>
        )}

        {/* Up to date confirmation banner */}
        {status === "up-to-date" && !checking && !downloading && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-xs text-emerald-900">
            <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
            <span>You are on the latest version of VEYRA Desktop.</span>
          </div>
        )}

        {/* Error state */}
        {status === "error" && error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50/60 p-3 text-xs text-red-900">
            <AlertCircle size={15} className="shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Channel Selection */}
        <div className="mt-6 border-t border-[#E2E5EF] pt-4">
          <p className="text-xs font-semibold text-[#182044]">Release channel</p>
          <p className="mt-0.5 text-[11px] text-[#8891A9]">
            Stable receives fully validated releases. Beta receives early access builds.
          </p>
          <div className="mt-3 grid max-w-sm grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleChannelChange("stable")}
              className={`flex h-9 items-center justify-center rounded-lg border text-xs font-semibold transition ${
                channel === "stable"
                  ? "border-[#6b4fe0] bg-[#ECE9FB] text-[#5638C4]"
                  : "border-[#E2E5EF] bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              Stable (Recommended)
            </button>
            <button
              type="button"
              onClick={() => void handleChannelChange("beta")}
              className={`flex h-9 items-center justify-center rounded-lg border text-xs font-semibold transition ${
                channel === "beta"
                  ? "border-[#6b4fe0] bg-[#ECE9FB] text-[#5638C4]"
                  : "border-[#E2E5EF] bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              Beta (Early preview)
            </button>
          </div>
        </div>

        {/* Auto check toggle */}
        <div className="mt-4 flex items-center justify-between border-t border-[#E2E5EF] pt-4">
          <div>
            <p className="text-xs font-semibold text-[#182044]">
              Check for updates automatically
            </p>
            <p className="text-[11px] text-[#8891A9]">
              Receive in-app alerts when a new signed release is verified.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoCheck}
            onClick={() => void handleAutoCheckChange(!autoCheck)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              autoCheck ? "bg-[#6b4fe0]" : "bg-slate-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                autoCheck ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Security and Integrity Architecture Note */}
      <div className="rounded-xl border border-indigo-100 bg-[#F8F7FF] p-4 text-xs text-[#182044]">
        <div className="flex items-center gap-2 font-semibold text-sm text-[#5638C4]">
          <ShieldCheck size={16} />
          <span>Signed release distribution & integrity</span>
        </div>
        <p className="mt-1 leading-relaxed text-[#4E5A7E]">
          All VEYRA desktop release artifacts are signed and distributed via
          Cloudflare R2 storage with SHA256 checksum verification. Release
          metadata and channel authorization are managed by the VEYRA Platform
          API. Updates are never executed without cryptographic validation.
        </p>
      </div>
    </div>
  );
}
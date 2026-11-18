import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Laptop, CreditCard, CircleAlert, LogIn, LogOut, ExternalLink, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type AccountSnapshot = Awaited<ReturnType<typeof window.veyra.platform.refreshAccount>>;

export function Account() {
  const [state, setState] = useState<{ authenticated: boolean; user?: { email: string }; secureStorageAvailable: boolean }>();
  const [snapshot, setSnapshot] = useState<AccountSnapshot>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [locale, setLocale] = useState("en");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    if (!window.veyra?.platform?.getState) {
      setError("VEYRA Desktop is required for account management.");
      setBusy(false);
      return;
    }
    try {
      const current = await window.veyra.platform.getState();
      setState(current);
      if (current.authenticated) {
        const account = await window.veyra.platform.refreshAccount();
        setSnapshot(account);
        setDisplayName(String(account.profile.displayName ?? ""));
        setLocale(String(account.profile.locale ?? "en"));
      } else setSnapshot(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach VEYRA Platform. Try again when online.");
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await window.veyra.platform.signIn({ email, password }); setPassword(""); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sign in failed. Check your connection and credentials."); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    setBusy(true); setError("");
    try { await window.veyra.platform.signOut(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign out."); }
    finally { setBusy(false); }
  };
  const registerDevice = async () => {
    setBusy(true); setError("");
    try { await window.veyra.platform.registerDevice(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Device registration failed."); }
    finally { setBusy(false); }
  };
  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const account = await window.veyra.platform.updateProfile({ displayName, locale }) as AccountSnapshot;
      setSnapshot(account);
      setDisplayName(String(account.profile.displayName ?? ""));
      setLocale(String(account.profile.locale ?? "en"));
      setMessage("Your profile is updated across VEYRA.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Profile update failed. Check your connection and try again."); }
    finally { setBusy(false); }
  };
  const openWebsite = async (destination: "account" | "billing") => {
    setError("");
    try { await window.veyra.platform.openWebsite(destination); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open the VEYRA Website."); }
  };

  return <div className="mx-auto w-full max-w-5xl space-y-7 pb-12">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">Account</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Your VEYRA account</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">This is the same Platform account used on the VEYRA Website. Profile, subscription, entitlements and device status come from Platform.</p></div><Button variant="outline" onClick={() => void refresh()} disabled={busy}><RefreshCw size={15} className="mr-2"/>Refresh</Button></header>
    {error && <div role="alert" className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><CircleAlert size={18} className="shrink-0"/><span>{error}</span></div>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{message}</p>}
    {!state?.authenticated ? <Card className="max-w-xl p-6"><div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><LogIn size={19}/></span><div><h2 className="font-semibold">Sign in to VEYRA</h2><p className="mt-1 text-xs text-slate-500">Use your existing VEYRA account credentials.</p></div></div>{!state?.secureStorageAvailable && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Secure OS credential storage is unavailable. Sign in is disabled to protect your session.</p>}<form onSubmit={(event) => void signIn(event)} className="space-y-4"><label className="block text-sm font-medium">Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"/></label><label className="block text-sm font-medium">Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"/></label><Button type="submit" disabled={busy || !state?.secureStorageAvailable} className="w-full">{busy ? "Signing in…" : "Sign in"}</Button></form><p className="mt-4 text-xs leading-5 text-slate-500">New accounts and password recovery are managed on the VEYRA Website. Sessions are stored using OS-backed secure storage.</p></Card> : <>
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-indigo-100 text-indigo-800">{snapshot?.user.email.slice(0, 1).toUpperCase() || "V"}</span><div><p className="text-xs text-slate-500">Signed in as</p><p className="font-semibold">{snapshot?.user.email}</p><p className="mt-1 text-xs text-slate-500">{snapshot?.user.emailConfirmed ? "Email verified" : "Email verification status unavailable"}</p></div></div><Button variant="outline" onClick={() => void signOut()} disabled={busy}><LogOut size={15} className="mr-2"/>Sign out</Button></Card>
      <Card className="p-5"><div className="mb-5 flex items-center gap-2 font-semibold"><UserRound size={17} className="text-indigo-700"/>Shared profile</div><p className="mb-4 text-sm text-slate-600">Changes save to VEYRA Platform and appear on the Website and Desktop.</p><form onSubmit={(event) => void saveProfile(event)} className="grid gap-4 sm:grid-cols-[1fr_220px_auto] sm:items-end"><label className="block text-sm font-medium">Display name<input maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"/></label><label className="block text-sm font-medium">Language<select value={locale} onChange={(event) => setLocale(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="en">English</option><option value="es">Español</option><option value="fr">Français</option><option value="de">Deutsch</option></select></label><Button type="submit" disabled={busy}>Save profile</Button></form></Card>
      <section className="grid gap-4 md:grid-cols-2"><Card className="p-5"><div className="flex items-center gap-2 font-semibold"><Laptop size={17} className="text-indigo-700"/>This device</div><p className="mt-3 text-sm text-slate-600">{snapshot?.authorization === "authorized" ? "Authorized with VEYRA Platform" : snapshot?.authorization === "revoked" ? "This device has been revoked" : snapshot?.authorization === "pending" ? "Device registration is pending" : "This installation is not registered"}</p><Button className="mt-4" variant="outline" onClick={() => void registerDevice()} disabled={busy || snapshot?.authorization === "revoked"}>{snapshot?.currentDevice ? "Refresh device registration" : "Register this device"}</Button></Card><Card className="p-5"><div className="flex items-center gap-2 font-semibold"><CreditCard size={17} className="text-indigo-700"/>Subscription & credits</div><p className="mt-3 text-sm text-slate-600">{snapshot?.subscription ? String(snapshot.subscription.status ?? "Subscription found") : "No subscription record is available."}</p><p className="mt-1 text-sm text-slate-600">{snapshot?.credits ? `${(snapshot.credits.balanceCents / 100).toFixed(2)} ${snapshot.credits.currency} credit balance` : "Credit balance unavailable."}</p><Button className="mt-4" variant="outline" onClick={() => void openWebsite("billing")}><ExternalLink size={15} className="mr-2"/>Manage billing on Website</Button></Card></section>
      <Card className="p-5"><div className="flex items-center gap-2 font-semibold"><ShieldCheck size={17} className="text-indigo-700"/>Platform entitlements</div>{snapshot?.entitlements.length ? <ul className="mt-4 divide-y divide-slate-100">{snapshot.entitlements.map((item) => <li key={item.capability} className="flex justify-between gap-4 py-3 text-sm"><span>{item.capability}</span><span className={item.entitled ? "text-emerald-700" : "text-slate-500"}>{item.entitled ? "Available" : "Not included"}</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No entitlement records were returned.</p>}</Card>
      <Card className="p-5"><h2 className="font-semibold">Recent cloud usage</h2>{snapshot?.usage.length ? <ul className="mt-3 divide-y divide-slate-100">{snapshot.usage.slice(0, 8).map((row, index) => <li key={String(row.id ?? index)} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{String(row.capability ?? row.modelId ?? "AI usage")}</span><span className="text-slate-500">{row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : "Recorded"}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No cloud usage records are available. Local inference usage is not billed through Platform.</p>}</Card>
    </>}</div>;
}

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleUserRound,
  FileText,
  GraduationCap,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { CandidateProfile } from "@core/candidate/contracts/CandidateTypes";
import "./Profile.css";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { PageContainer } from "@/components/layout/PageContainer";

interface WorkspaceProfile {
  readonly id: string;
  readonly displayName: string;
}
type CandidateCounts = {
  experience: number;
  project: number;
  skill: number;
  story: number;
};
const emptyCounts: CandidateCounts = {
  experience: 0,
  project: 0,
  skill: 0,
  story: 0,
};

export function Profile() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [workspaceProfiles, setWorkspaceProfiles] = useState<
    readonly WorkspaceProfile[]
  >([]);
  const [activeWorkspaceProfileId, setActiveWorkspaceProfileId] =
    useState<string>();
  const [counts, setCounts] = useState<CandidateCounts>(emptyCounts);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("Local profile");
  const [draft, setDraft] = useState({
    fullName: "",
    headline: "",
    location: "",
    email: "",
    summary: "",
  });
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const api = window.veyra;
    if (!api?.workspaceProfiles?.list || !api.candidate) {
      setError("Open VEYRA Desktop to manage your local candidate profile.");
      setLoading(false);
      return;
    }
    try {
      const workspaceResult = await api.workspaceProfiles.list();
      if (!workspaceResult.success || !workspaceResult.data)
        throw new Error(
          workspaceResult.error?.message ?? "Could not load workspaces.",
        );
      const { profiles: workspaces, activeProfileId } = workspaceResult.data;
      setWorkspaceProfiles(workspaces);
      setActiveWorkspaceProfileId(activeProfileId);
      if (!activeProfileId) {
        setProfile(null);
        setCounts(emptyCounts);
        return;
      }
      const result = await api.candidate.listProfiles();
      if (!result.success)
        throw new Error(
          result.error?.message ?? "Could not load candidate profiles.",
        );
      const candidate = result.data?.[0];
      if (!candidate) {
        setProfile(null);
        setCounts(emptyCounts);
        return;
      }
      const detail = await api.candidate.getProfile({
        candidateId: candidate.id,
      });
      if (!detail.success || !detail.data)
        throw new Error(
          detail.error?.message ?? "Could not load candidate details.",
        );
      setProfile(detail.data);
      const types = ["experience", "project", "skill", "story"] as const;
      const records = await Promise.all(
        types.map((type) =>
          api.candidate.listRecords({ candidateId: candidate.id, type }),
        ),
      );
      const next = { ...emptyCounts };
      records.forEach((response, index) => {
        if (!response.success)
          throw new Error(
            response.error?.message ??
              `Could not load ${types[index]} records.`,
          );
        next[types[index]] = response.data?.length ?? 0;
      });
      setCounts(next);
      setDraft({
        fullName: detail.data.fullName,
        headline: detail.data.headline ?? "",
        location: detail.data.location ?? "",
        email: detail.data.email ?? "",
        summary: detail.data.summary ?? "",
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load candidate profile.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const completeness = useMemo(() => {
    if (!profile) return 0;
    const checks = [
      profile.fullName,
      profile.headline,
      profile.location,
      profile.email,
      profile.summary,
      profile.education.length > 0,
      profile.certifications.length > 0,
      counts.experience > 0,
      counts.skill > 0,
      counts.project > 0,
      counts.story > 0,
      profile.resumeDocumentId,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [profile, counts]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile || !draft.fullName.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await window.veyra.candidate.saveProfile({
        profile: {
          ...profile,
          ...draft,
          fullName: draft.fullName.trim(),
          headline: draft.headline.trim() || undefined,
          location: draft.location.trim() || undefined,
          email: draft.email.trim() || undefined,
          summary: draft.summary.trim() || undefined,
          updatedAt: new Date().toISOString(),
        },
      });
      if (!result.success)
        throw new Error(result.error?.message ?? "Could not save profile.");
      setEditing(false);
      setNotice("Profile changes saved on this device.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save profile.",
      );
    } finally {
      setBusy(false);
    }
  };

  const activateWorkspace = async (profileId: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await window.veyra.workspaceProfiles.activate({
        profileId,
      });
      if (!result.success)
        throw new Error(result.error?.message ?? "Could not switch workspace.");
      setShowWorkspacePicker(false);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not switch workspace.",
      );
    } finally {
      setBusy(false);
    }
  };
  const createWorkspace = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await window.veyra.workspaceProfiles.create({
        displayName: workspaceName.trim(),
      });
      if (!result.success)
        throw new Error(result.error?.message ?? "Could not create workspace.");
      setShowWorkspacePicker(false);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create workspace.",
      );
    } finally {
      setBusy(false);
    }
  };
  const createCandidate = async () => {
    if (!draft.fullName.trim()) {
      setError("Enter your name to create a candidate profile.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const now = new Date().toISOString();
      const result = await window.veyra.candidate.saveProfile({
        profile: {
          id: crypto.randomUUID(),
          fullName: draft.fullName.trim(),
          headline: draft.headline.trim() || undefined,
          summary: draft.summary.trim() || undefined,
          location: draft.location.trim() || undefined,
          email: draft.email.trim() || undefined,
          education: [],
          certifications: [],
          createdAt: now,
          updatedAt: now,
        },
      });
      if (!result.success)
        throw new Error(result.error?.message ?? "Could not create profile.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create profile.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <PageContainer>
        <div className="grid min-h-[320px] place-items-center text-sm text-slate-500">
          Loading candidate profile…
        </div>
      </PageContainer>
    );
  const activeWorkspace = workspaceProfiles.find(
    (workspace) => workspace.id === activeWorkspaceProfileId,
  );
  const panel =
    "rounded-xl border border-border bg-card/80 shadow-[0_12px_36px_-28px_rgba(24,32,68,0.34)]";
  const linkClass =
    "flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm text-[#252b43] transition hover:border-primary/40 hover:bg-indigo-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

  if (
    error &&
    !profile &&
    !activeWorkspaceProfileId &&
    workspaceProfiles.length === 0
  )
    return (
      <PageContainer>
        <div className={`${panel} mx-auto max-w-xl p-8 text-center`}>
          <h1 className="text-lg font-semibold text-[#171c35]">
            Profile is unavailable
          </h1>
          <p role="alert" className="mt-2 text-sm text-[#68708b]">
            {error}
          </p>
          <Button
            className="mt-5"
            variant="outline"
            onClick={() => void load()}
          >
            Try again
          </Button>
        </div>
      </PageContainer>
    );

  if (!activeWorkspaceProfileId || showWorkspacePicker)
    return (
      <PageContainer>
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#7255e7]">
            Candidate workspace
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#171c35]">
            Choose a workspace profile
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68708b]">
            Candidate details, documents and session history stay within the
            selected local workspace.
          </p>
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="mt-6 grid gap-3">
            {activeWorkspaceProfileId && (
              <Button
                variant="outline"
                className="justify-self-start"
                onClick={() => setShowWorkspacePicker(false)}
              >
                Cancel
              </Button>
            )}
            {workspaceProfiles.map((workspace) => (
              <div
                className={`${panel} flex flex-wrap items-center justify-between gap-4 p-5`}
                key={workspace.id}
              >
                <span className="font-medium text-[#252b43]">
                  {workspace.displayName}
                </span>
                <Button
                  disabled={busy}
                  onClick={() => void activateWorkspace(workspace.id)}
                >
                  Select workspace
                </Button>
              </div>
            ))}
            {workspaceProfiles.length === 0 && (
              <div className={`${panel} p-6`}>
                <Input
                  label="Workspace name"
                  value={workspaceName}
                  maxLength={80}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                />
                <Button
                  className="mt-4"
                  loading={busy}
                  disabled={!workspaceName.trim()}
                  onClick={() => void createWorkspace()}
                >
                  Create workspace
                </Button>
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    );

  if (!profile)
    return (
      <PageContainer>
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#7255e7]">
            Candidate profile
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[#171c35]">
            Start with your real experience
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#68708b]">
            Add details you want VEYRA to use. You can edit or remove them
            later.
          </p>
          <div className={`${panel} mt-6 p-6 sm:p-8`}>
            <div className="mb-6 flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#eeeaff] text-[#7255e7]">
                <CircleUserRound size={24} />
              </span>
              <div>
                <h2 className="font-semibold text-[#202641]">
                  Create candidate profile
                </h2>
                <p className="mt-1 text-sm text-[#707994]">
                  This profile is stored in the selected local workspace.
                </p>
              </div>
            </div>
            {error && (
              <p role="alert" className="mb-4 text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                autoComplete="name"
                required
                value={draft.fullName}
                onChange={(event) =>
                  setDraft({ ...draft, fullName: event.target.value })
                }
              />
              <Input
                label="Professional headline"
                placeholder="e.g. Product designer"
                value={draft.headline}
                onChange={(event) =>
                  setDraft({ ...draft, headline: event.target.value })
                }
              />
              <Input
                label="Location"
                autoComplete="address-level2"
                value={draft.location}
                onChange={(event) =>
                  setDraft({ ...draft, location: event.target.value })
                }
              />
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                value={draft.email}
                onChange={(event) =>
                  setDraft({ ...draft, email: event.target.value })
                }
              />
            </div>
            <div className="mt-4">
              <Textarea
                label="Professional summary"
                value={draft.summary}
                onChange={(event) =>
                  setDraft({ ...draft, summary: event.target.value })
                }
              />
            </div>
            <Button
              className="mt-5"
              loading={busy}
              onClick={() => void createCandidate()}
            >
              Create candidate profile <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </PageContainer>
    );

  const missing = [
    !profile.headline && "Add a professional headline",
    !profile.summary && "Write a short profile summary",
    !profile.education.length && "Add education details",
    !counts.experience && "Add work experience",
    !counts.project && "Add a project",
    !counts.skill && "Add skills",
    !profile.resumeDocumentId && "Link a CV to your profile",
  ].filter(Boolean) as string[];
  return (
    <PageContainer className="!py-7 sm:!py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#7255e7]">
            Candidate profile
          </p>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-[#171c35] sm:text-[32px]">
            Your professional context
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68708b]">
            A private knowledge base for interview preparation, grounded in
            details you confirm.
          </p>
          <p className="mt-2 text-xs text-[#8189a1]">
            Workspace · {activeWorkspace?.displayName ?? "Selected workspace"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {workspaceProfiles.length > 1 && (
            <Button
              variant="outline"
              onClick={() => setShowWorkspacePicker(true)}
            >
              Switch workspace
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setEditing((value) => !value);
              setError(undefined);
            }}
          >
            <Pencil size={15} />
            {editing ? "Close editor" : "Edit profile"}
          </Button>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      <section
        className={`${panel} mt-6 p-5 sm:p-7`}
        aria-label="Profile overview"
      >
        <div className="profile-overview">
          <div className="profile-overview__person">
            <div className="profile-avatar">
              {profile.fullName
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join("")}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold text-[#202641]">
                {profile.fullName}
              </h2>
              <p className="mt-1 text-sm text-[#626b86]">
                {profile.headline || "Add a professional headline"}
              </p>
              <p className="mt-1 text-xs text-[#8189a1]">
                {[profile.location, profile.email]
                  .filter(Boolean)
                  .join(" · ") ||
                  "Add location and contact details when you are ready"}
              </p>
              <span className="profile-status">
                <ShieldCheck size={13} /> Personal information
              </span>
            </div>
          </div>
          <div className="profile-overview__completion">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-[#303751]">
                Profile completeness
              </span>
              <span className="font-semibold text-[#5d45cb]">
                {completeness}%
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-100">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${completeness}%` }}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-[#78809a]">
              Calculated from profile sections with saved information.
            </p>
          </div>
        </div>
      </section>
      {editing && (
        <form
          className={`${panel} mt-4 p-5 sm:p-6`}
          onSubmit={(event) => void saveProfile(event)}
        >
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-[#202641]">
                Edit profile details
              </h2>
              <p className="mt-1 text-sm text-[#78809a]">
                Only information you enter is saved.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close profile editor"
              className="grid h-9 w-9 place-items-center rounded-lg text-[#6c748c] hover:bg-[#f4f3fa]"
              onClick={() => setEditing(false)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full name"
              autoComplete="name"
              required
              value={draft.fullName}
              onChange={(event) =>
                setDraft({ ...draft, fullName: event.target.value })
              }
            />
            <Input
              label="Professional headline"
              value={draft.headline}
              onChange={(event) =>
                setDraft({ ...draft, headline: event.target.value })
              }
            />
            <Input
              label="Location"
              autoComplete="address-level2"
              value={draft.location}
              onChange={(event) =>
                setDraft({ ...draft, location: event.target.value })
              }
            />
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={draft.email}
              onChange={(event) =>
                setDraft({ ...draft, email: event.target.value })
              }
            />
          </div>
          <div className="mt-4">
            <Textarea
              label="Professional summary"
              value={draft.summary}
              onChange={(event) =>
                setDraft({ ...draft, summary: event.target.value })
              }
            />
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              type="submit"
              loading={busy}
              disabled={!draft.fullName.trim()}
            >
              Save changes
            </Button>
          </div>
        </form>
      )}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className={`${panel} p-5 sm:p-6`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-[#202641]">
                  Profile sections
                </h2>
                <p className="mt-1 text-sm text-[#78809a]">
                  Information VEYRA can use as interview context.
                </p>
              </div>
              <Sparkles size={18} className="text-[#8067ec]" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Link to="/profile/experience" className={linkClass}>
                <span className="flex items-center gap-3">
                  <BriefcaseBusiness size={18} className="text-[#7255e7]" />
                  <span>
                    <span className="block font-medium">Experience</span>
                    <span className="mt-0.5 block text-xs text-[#8189a1]">
                      {counts.experience} saved record
                      {counts.experience === 1 ? "" : "s"}
                    </span>
                  </span>
                </span>
                <ChevronRight size={16} className="text-[#9097ab]" />
              </Link>
              <Link to="/profile/skills" className={linkClass}>
                <span className="flex items-center gap-3">
                  <Target size={18} className="text-[#7255e7]" />
                  <span>
                    <span className="block font-medium">Skills</span>
                    <span className="mt-0.5 block text-xs text-[#8189a1]">
                      {counts.skill} saved skill{counts.skill === 1 ? "" : "s"}
                    </span>
                  </span>
                </span>
                <ChevronRight size={16} className="text-[#9097ab]" />
              </Link>
              <Link to="/stories" className={linkClass}>
                <span className="flex items-center gap-3">
                  <Sparkles size={18} className="text-[#7255e7]" />
                  <span>
                    <span className="block font-medium">Interview stories</span>
                    <span className="mt-0.5 block text-xs text-[#8189a1]">
                      {counts.story} saved stor
                      {counts.story === 1 ? "y" : "ies"}
                    </span>
                  </span>
                </span>
                <ChevronRight size={16} className="text-[#9097ab]" />
              </Link>
              <Link to="/documents" className={linkClass}>
                <span className="flex items-center gap-3">
                  <FileText size={18} className="text-[#7255e7]" />
                  <span>
                    <span className="block font-medium">Documents and CV</span>
                    <span className="mt-0.5 block text-xs text-[#8189a1]">
                      Manage your supporting files
                    </span>
                  </span>
                </span>
                <ChevronRight size={16} className="text-[#9097ab]" />
              </Link>
              <div className={`${linkClass} cursor-default`}>
                <span className="flex items-center gap-3">
                  <GraduationCap size={18} className="text-[#7255e7]" />
                  <span>
                    <span className="block font-medium">
                      Education and credentials
                    </span>
                    <span className="mt-0.5 block text-xs text-[#8189a1]">
                      {profile.education.length} education ·{" "}
                      {profile.certifications.length} certification records
                    </span>
                  </span>
                </span>
              </div>
              <Link to="/projects" className={linkClass}>
                <span className="flex items-center gap-3">
                  <Target size={18} className="text-[#7255e7]" />
                  <span>
                    <span className="block font-medium">Projects</span>
                    <span className="mt-0.5 block text-xs text-[#8189a1]">
                      {counts.project} saved project
                      {counts.project === 1 ? "" : "s"}
                    </span>
                  </span>
                </span>
                <ChevronRight size={16} className="text-[#9097ab]" />
              </Link>
            </div>
          </section>
          <section className={`${panel} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-[#202641]">Education</h2>
                <p className="mt-1 text-sm text-[#78809a]">
                  Your saved education history.
                </p>
              </div>
              <GraduationCap size={18} className="text-[#7255e7]" />
            </div>
            {profile.education.length ? (
              <ul className="mt-4 divide-y divide-[#eceef4]">
                {profile.education.map((item, index) => (
                  <li
                    key={`${item.institution}-${index}`}
                    className="py-4 first:pt-0 last:pb-0"
                  >
                    <p className="font-medium text-[#303751]">
                      {item.institution}
                    </p>
                    <p className="mt-1 text-sm text-[#68708b]">
                      {[item.degree, item.fieldOfStudy]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-xs text-[#8189a1]">
                      {[item.startDate, item.endDate]
                        .filter(Boolean)
                        .join(" – ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-[#dfe2ed] bg-[#fafaff] p-5">
                <p className="text-sm font-medium text-[#303751]">
                  No education details yet
                </p>
                <p className="mt-1 text-sm text-[#78809a]">
                  Add education when you want it included in your preparation
                  context.
                </p>
              </div>
            )}
          </section>
          <section className={`${panel} p-5 sm:p-6`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-[#202641]">Certifications</h2>
                <p className="mt-1 text-sm text-[#78809a]">
                  Credentials you have saved.
                </p>
              </div>
              <ShieldCheck size={18} className="text-[#7255e7]" />
            </div>
            {profile.certifications.length ? (
              <ul className="mt-4 divide-y divide-[#eceef4]">
                {profile.certifications.map((item, index) => (
                  <li
                    key={`${item.name}-${index}`}
                    className="py-4 first:pt-0 last:pb-0"
                  >
                    <p className="font-medium text-[#303751]">{item.name}</p>
                    <p className="mt-1 text-sm text-[#68708b]">
                      {item.issuer || "Issuer not specified"}
                    </p>
                    {item.issueDate && (
                      <p className="mt-1 text-xs text-[#8189a1]">
                        Issued {item.issueDate}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-[#dfe2ed] bg-[#fafaff] p-5 text-sm text-[#78809a]">
                No certifications have been added.
              </p>
            )}
          </section>
        </div>
        <aside className="space-y-5">
          <section className={`${panel} p-5`}>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#fff5df] text-[#b47b14]">
                <Plus size={17} />
              </span>
              <div>
                <h2 className="font-semibold text-[#202641]">
                  Profile checklist
                </h2>
                <p className="text-xs text-[#8189a1]">
                  Add only details that are true for you.
                </p>
              </div>
            </div>
            {missing.length ? (
              <ul className="mt-4 space-y-3">
                {missing.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-sm leading-5 text-[#626b86]"
                  >
                    <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-[#d8dbea]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#a4abc0]" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 flex items-center gap-2 text-sm text-[#218458]">
                <Check size={16} /> Core profile details are in place.
              </p>
            )}
            <Button
              variant="outline"
              className="mt-5 w-full"
              onClick={() => setEditing(true)}
            >
              Update profile <ArrowRight size={15} />
            </Button>
          </section>
          <section className={`${panel} p-5`}>
            <h2 className="font-semibold text-[#202641]">Your saved context</h2>
            <p className="mt-1 text-xs text-[#8189a1]">
              Items in this workspace
            </p>
            <dl className="mt-4 space-y-3">
              {[
                ["Confirmed profile", 1],
                ["Experience", counts.experience],
                ["Skills", counts.skill],
                ["Stories", counts.story],
                ["Projects", counts.project],
                ["Education", profile.education.length],
                ["Certifications", profile.certifications.length],
              ].map(([label, count]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between text-sm"
                >
                  <dt className="text-[#68708b]">{label}</dt>
                  <dd className="font-medium text-[#303751]">{count}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 border-t border-[#eceef4] pt-3 text-xs leading-5 text-[#8189a1]">
              VEYRA uses information saved here as context. Review suggested
              content before relying on it.
            </p>
          </section>
          <Link
            to="/documents"
            className="flex items-center justify-between rounded-2xl bg-[#eeeaff] p-5 text-[#5140aa] hover:bg-[#e7e1ff]"
          >
            <span>
              <span className="block text-sm font-semibold">
                Add supporting documents
              </span>
              <span className="mt-1 block text-xs text-[#6d61a9]">
                Manage your CV and reference files
              </span>
            </span>
            <ArrowRight size={17} />
          </Link>
        </aside>
      </div>
    </PageContainer>
  );
}

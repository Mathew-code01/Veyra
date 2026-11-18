import { useCallback, useEffect, useState } from "react";
import { User } from "lucide-react";
import type { CandidateProfile } from "@core/candidate/contracts/CandidateTypes";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { PageContainer } from "@/components/layout/PageContainer";

interface WorkspaceProfile {
  readonly id: string;
  readonly displayName: string;
}

export function Profile() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [workspaceProfiles, setWorkspaceProfiles] = useState<readonly WorkspaceProfile[]>([]);
  const [activeWorkspaceProfileId, setActiveWorkspaceProfileId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("Local profile");
  const [fullName, setFullName] = useState("");
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setProfile(null);
    setProfileLoadFailed(false);
    setError(undefined);
    if (!window.veyra?.workspaceProfiles?.list) {
      setProfileLoadFailed(true);
      setError("VEYRA Desktop is required for profile management.");
      setLoading(false);
      return;
    }
    try {
      const workspaceResult = await window.veyra.workspaceProfiles.list();
      if (!workspaceResult.success || !workspaceResult.data) {
        throw new Error(workspaceResult.error?.message ?? "Failed to load workspace profiles.");
      }

      const { profiles, activeProfileId } = workspaceResult.data;
      setWorkspaceProfiles(profiles);
      setActiveWorkspaceProfileId(activeProfileId);
      if (!activeProfileId) {
        setProfile(null);
        return;
      }

      const result = await window.veyra.candidate.listProfiles();
      if (!result.success) {
        throw new Error(result.error?.message ?? "Failed to load candidate profiles.");
      }
      const candidates = result.data ?? [];
      if (candidates.length === 0) {
        setProfile(null);
        return;
      }

      const detail = await window.veyra.candidate.getProfile({
        candidateId: candidates[0].id,
      });
      if (!detail.success || !detail.data) {
        throw new Error(detail.error?.message ?? "Failed to load candidate profile.");
      }
      setProfile(detail.data);
    } catch (e) {
      setProfileLoadFailed(true);
      setError(e instanceof Error ? e.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectWorkspaceProfile = async (profileId: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await window.veyra.workspaceProfiles.activate({ profileId });
      if (!result.success) {
        throw new Error(result.error?.message ?? "Failed to select workspace profile.");
      }
      setShowWorkspacePicker(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to select workspace profile.");
    } finally {
      setBusy(false);
    }
  };

  const createWorkspaceProfile = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await window.veyra.workspaceProfiles.create({
        displayName: workspaceName,
      });
      if (!result.success) {
        throw new Error(result.error?.message ?? "Failed to create workspace profile.");
      }
      setShowWorkspacePicker(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create workspace profile.");
    } finally {
      setBusy(false);
    }
  };

  const createCandidateProfile = async () => {
    if (!fullName.trim()) {
      setError("Enter your name to create a candidate profile.");
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      const now = new Date().toISOString();
      const candidate = {
        id: crypto.randomUUID(),
        fullName: fullName.trim(),
        headline: headline.trim() || undefined,
        summary: summary.trim() || undefined,
        education: [],
        certifications: [],
        createdAt: now,
        updatedAt: now,
      };
      const result = await window.veyra.candidate.saveProfile({ profile: candidate });
      if (!result.success) {
        throw new Error(result.error?.message ?? "Failed to create candidate profile.");
      }
      setFullName("");
      setHeadline("");
      setSummary("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create candidate profile.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex min-h-[300px] items-center justify-center">
          <span className="text-sm text-zinc-500">Loading profile…</span>
        </div>
      </PageContainer>
    );
  }

  if (error && !profile && !activeWorkspaceProfileId && workspaceProfiles.length === 0) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <h2 className="text-zinc-200">Unable to load profiles</h2>
          <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>
          <Button onClick={() => void load()} variant="outline">Try again</Button>
        </div>
      </PageContainer>
    );
  }

  if (!activeWorkspaceProfileId || showWorkspacePicker) {
    return (
      <PageContainer>
        <h1 className="text-2xl font-semibold text-white">Choose a workspace profile</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Select which local workspace owns your candidate details, documents, and interview history.
        </p>
        {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
        <div className="mt-6 grid max-w-2xl gap-3">
          {activeWorkspaceProfileId && showWorkspacePicker && (
            <Button
              className="justify-self-start"
              variant="outline"
              onClick={() => setShowWorkspacePicker(false)}
            >
              Cancel
            </Button>
          )}
          {workspaceProfiles.map((workspace) => (
            <Card key={workspace.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <span className="text-zinc-200">{workspace.displayName}</span>
                <Button
                  disabled={busy}
                  onClick={() => void selectWorkspaceProfile(workspace.id)}
                >
                  Select
                </Button>
              </CardContent>
            </Card>
          ))}
          {workspaceProfiles.length === 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-medium text-white">Create your local workspace</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  id="workspace-name"
                  label="Workspace name"
                  value={workspaceName}
                  maxLength={80}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                />
                <Button disabled={busy} loading={busy} onClick={() => void createWorkspaceProfile()}>
                  Create workspace
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </PageContainer>
    );
  }

  if (profileLoadFailed && error && !profile) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <h2 className="text-zinc-200">Unable to load candidate profile</h2>
          <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>
          <Button onClick={() => void load()} variant="outline">Try again</Button>
        </div>
      </PageContainer>
    );
  }

  if (!profile) {
    return (
      <PageContainer>
        <div className="mx-auto max-w-2xl py-10">
          <Card>
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/20 text-zinc-400">
                <User size={24} />
              </div>
              <h1 className="mt-3 text-xl font-semibold text-white">Create your candidate profile</h1>
              <p className="text-sm text-zinc-400">
                Add only details you want Veyra to use. You can add experience and supporting documents later.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
              <Input
                id="candidate-name"
                label="Name"
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
              />
              <Input
                id="candidate-headline"
                label="Professional headline (optional)"
                placeholder="e.g. Software engineer"
                value={headline}
                onChange={(event) => setHeadline(event.target.value)}
              />
              <Textarea
                id="candidate-summary"
                label="Summary (optional)"
                placeholder="A short summary of your background and goals"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} loading={busy} onClick={() => void createCandidateProfile()}>
                  Create candidate profile
                </Button>
                <Button
                  disabled={busy || workspaceProfiles.length < 2}
                  variant="outline"
                  onClick={() => setShowWorkspacePicker(true)}
                >
                  Switch workspace
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    );
  }

  const activeWorkspace = workspaceProfiles.find(
    (workspace) => workspace.id === activeWorkspaceProfileId,
  );

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Candidate Profile</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Your professional knowledge base. Ground interview guidance in your real experience.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Workspace: {activeWorkspace?.displayName ?? "Selected workspace"}
          </p>
        </div>
        {workspaceProfiles.length > 1 && (
          <Button variant="outline" onClick={() => setShowWorkspacePicker(true)}>
            Switch workspace
          </Button>
        )}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Badge variant="default">{profile.fullName}</Badge>
        {profile.headline && (
          <span className="text-xs text-zinc-500">· {profile.headline}</span>
        )}
      </div>
      {profile.summary && (
        <div className="mt-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Summary</h2>
          <p className="mt-1 text-zinc-300">{profile.summary}</p>
        </div>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><h2 className="font-medium text-white">Education</h2></CardHeader>
          <CardContent className="pt-0">
            {(profile.education ?? []).length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500">No education records yet.</p>
            ) : (
              <ul className="space-y-3">
                {profile.education.map((education, index) => (
                  <li key={`${education.institution}-${index}`} className="rounded-lg border border-border bg-black/20 p-3">
                    <p className="text-sm font-medium text-zinc-200">{education.institution}</p>
                    {education.degree && <p className="text-xs text-zinc-400">{education.degree}</p>}
                    {education.fieldOfStudy && <p className="text-xs text-zinc-500">{education.fieldOfStudy}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><h2 className="font-medium text-white">Certifications</h2></CardHeader>
          <CardContent className="pt-0">
            {(profile.certifications ?? []).length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500">No certifications yet.</p>
            ) : (
              <ul className="space-y-3">
                {profile.certifications.map((certification, index) => (
                  <li key={`${certification.name}-${index}`} className="rounded-lg border border-border bg-black/20 p-3">
                    <p className="text-sm font-medium text-zinc-200">{certification.name}</p>
                    {certification.issuer && <p className="text-xs text-zinc-400">{certification.issuer}</p>}
                    {certification.issueDate && <p className="text-xs text-zinc-500">Issued: {certification.issueDate}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

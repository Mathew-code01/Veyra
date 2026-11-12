import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Edit3,
  FolderKanban,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { PageContainer } from "@/components/layout/PageContainer";

export function Projects() {
  const [projects, setProjects] = useState<readonly any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await (window as any).veyra.candidate.listProfiles();
      if (!res?.success || !(res.data ?? []).length) {
        setProjects([]);
        return;
      }
      const candidateId = res.data[0].id;
      const list = await (window as any).veyra.candidate.listRecords({
        candidateId,
        type: "project",
      });
      if (!list?.success) throw new Error(list?.error?.message ?? "Failed to load projects.");
      setProjects(list.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveBusy(true);
    setSaveError(null);
    try {
      const res = await (window as any).veyra.candidate.saveRecord({
        type: "project",
        record: {
          ...form,
          id: form.id || crypto.randomUUID(),
        },
      });
      if (!res?.success) throw new Error(res?.error?.message ?? "Failed to save project.");
      setForm(null);
      setEditingId(null);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save project.");
    } finally {
      setSaveBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this project?")) return;
    setDeleteBusy(id);
    try {
      const profiles = await (window as any).veyra.candidate.listProfiles();
      const candidateId = profiles.data?.[0].id;
      if (!candidateId) throw new Error("No candidate profile found.");
      const res = await (window as any).veyra.candidate.deleteRecord({
        candidateId,
        type: "project",
        recordId: id,
      });
      if (!res?.success) throw new Error(res?.error?.message ?? "Failed to delete project.");
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to delete project.");
    } finally {
      setDeleteBusy(null);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[300px]">
          <span className="text-zinc-500 text-sm">Loading projects…</span>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <h2 className="text-zinc-200">Unable to load projects</h2>
          <p className="mt-2 text-sm text-zinc-500">{error}</p>
          <Button onClick={() => void load()} variant="outline">
            Try again
          </Button>
        </div>
      </PageContainer>
    );
  }

  const isEditing = (id: string) => editingId === id;

  return (
    <PageContainer>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>
      )}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold text-white">Projects</h1>
            <Button
              onClick={() => {
                setForm({
                  id: "",
                  name: "",
                  description: "",
                  role: "",
                  technologies: [],
                  responsibilities: [],
                  achievements: [],
                  challenges: [],
                  solutions: [],
                  outcomes: [],
                  startDate: "",
                  endDate: "",
                  repositoryUrl: "",
                  liveUrl: "",
                });
                setEditingId("new");
              }}
            >
              <Edit3 size={16} /> Add project
            </Button>
          </div>
          {projects.length === 0 ? (
            <div className="mt-8 text-center py-12 rounded-lg border border-border bg-black/20">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/20 text-zinc-400 mx-auto mb-3">
                <FolderKanban size={24} />
              </div>
              <h3 className="text-zinc-200 font-medium">No projects yet</h3>
              <p className="mt-2 text-sm text-zinc-500">
                Add your projects to demonstrate your technical impact in
                interviews.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {projects.map((proj) => (
                <Card key={proj.id} className={isEditing(proj.id) ? "border-primary/50" : undefined}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-200">
                          {proj.name}
                        </p>
                        {proj.role && <p className="text-xs text-zinc-400">{proj.role}</p>}
                        <div className="mt-1 flex gap-2 text-[10px] text-zinc-500">
                          {proj.startDate && <span>{proj.startDate}</span>}
                          {proj.endDate && <span>- {proj.endDate}</span>}
                        </div>
                        {proj.technologies?.length && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {proj.technologies.slice(0, 6).map((t: string) => (
                              <Badge key={t} variant="default">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {proj.description && (
                          <p className="mt-2 text-sm text-zinc-300 line-clamp-2">
                            {proj.description}
                          </p>
                        )}
                        {proj.achievements?.length && (
                          <div className="mt-2">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                              Achievements
                            </p>
                            <ul className="text-sm text-zinc-300 list-disc list-inside space-y-1">
                              {proj.achievements.map((a: string, idx: number) => (
                                <li key={idx}>{a}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      <div className="flex items-end gap-2">
                        <Link
                          to={`/projects/${proj.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View details
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setForm({ ...proj });
                            setEditingId(proj.id);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDelete(proj.id)}
                          disabled={deleteBusy === proj.id}
                        >
                          {deleteBusy === proj.id ? "Deleting…" : "Delete"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {form && (
          <div className="flex-1 lg:w-[420px]">
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-white">
                  {isEditing(form.id) ? "Edit project" : "Add project"}
                </h2>
              </CardHeader>
              <CardContent className="pt-0">
                <form onSubmit={handleSave} className="space-y-4">
                  <Input
                    label="Project name"
                    id="name"
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    error={saveError ? "Save failed. Try again." : undefined}
                  />
                  <Input
                    label="Your role"
                    id="role"
                    value={form.role}
                    onChange={(e) =>
                      setForm({ ...form, role: e.target.value })
                    }
                  />
                  <Input
                    label="Start date"
                    type="date"
                    value={form.startDate}
                    onChange={(e) =>
                      setForm({ ...form, startDate: e.target.value })
                    }
                  />
                  <Input
                    label="End date"
                    type="date"
                    value={form.endDate}
                    onChange={(e) =>
                      setForm({ ...form, endDate: e.target.value })
                    }
                  />
                  <Textarea
                    label="Description"
                    id="description"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                  <Input
                    label="Technologies (comma-separated)"
                    id="technologies"
                    value={form.technologies.join(", ")}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        technologies: e.target.value
                          .split(",")
                          .map((t: string) => t.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                  <Textarea
                    label="Responsibilities (one per line)"
                    id="responsibilities"
                    value={form.responsibilities.join("\n")}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        responsibilities: e.target.value
                          .split("\n")
                          .map((r: string) => r.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                  <Textarea
                    label="Achievements (one per line)"
                    id="achievements"
                    value={form.achievements.join("\n")}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        achievements: e.target.value
                          .split("\n")
                          .map((a: string) => a.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                  <Textarea
                    label="Challenges (one per line)"
                    id="challenges"
                    value={form.challenges.join("\n")}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        challenges: e.target.value
                          .split("\n")
                          .map((c: string) => c.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                  <Textarea
                    label="Solutions (one per line)"
                    id="solutions"
                    value={form.solutions.join("\n")}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        solutions: e.target.value
                          .split("\n")
                          .map((s: string) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                  <Textarea
                    label="Outcomes (one per line)"
                    id="outcomes"
                    value={form.outcomes.join("\n")}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        outcomes: e.target.value
                          .split("\n")
                          .map((o: string) => o.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                  <div className="flex gap-2">
                    <Input
                      label="Repository URL"
                      type="url"
                      id="repositoryUrl"
                      value={form.repositoryUrl}
                      onChange={(e) =>
                        setForm({ ...form, repositoryUrl: e.target.value })
                      }
                    />
                    <Input
                      label="Live URL"
                      type="url"
                      id="liveUrl"
                      value={form.liveUrl}
                      onChange={(e) =>
                        setForm({ ...form, liveUrl: e.target.value })
                      }
                    />
                  </div>
                  <div className="mt-6 flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setForm(null);
                        setEditingId(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" loading={saveBusy} disabled={saveBusy}>
                      Save project
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

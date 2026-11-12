import { useCallback, useEffect, useState } from "react";
import { Briefcase, Edit3, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/Switch";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { PageContainer } from "@/components/layout/PageContainer";

export function Experience() {
  const [experiences, setExperiences] = useState<readonly any[]>([]);
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
        setExperiences([]);
        return;
      }
      const candidateId = res.data[0].id;
      const list = await (window as any).veyra.candidate.listRecords({
        candidateId,
        type: "experience",
      });
      if (!list?.success) throw new Error(list?.error?.message ?? "Failed to load experiences.");
      setExperiences(list.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load experience.");
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
        type: "experience",
        record: {
          ...form,
          id: form.id || crypto.randomUUID(),
        },
      });
      if (!res?.success) throw new Error(res?.error?.message ?? "Failed to save experience.");
      setForm(null);
      setEditingId(null);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save experience.");
    } finally {
      setSaveBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this experience?")) return;
    setDeleteBusy(id);
    try {
      // Get profile to know candidateId
      const profiles = await (window as any).veyra.candidate.listProfiles();
      const candidateId = profiles.data?.[0]?.id;
      if (!candidateId) throw new Error("No candidate profile found.");
      const res = await (window as any).veyra.candidate.deleteRecord({
        candidateId,
        type: "experience",
        recordId: id,
      });
      if (!res?.success) throw new Error(res?.error?.message ?? "Failed to delete experience.");
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to delete experience.");
    } finally {
      setDeleteBusy(null);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[300px]">
          <span className="text-zinc-500 text-sm">Loading experience…</span>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <h2 className="text-zinc-200">Unable to load experience</h2>
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
            <h1 className="text-2xl font-semibold text-white">Work Experience</h1>
            <Button
              onClick={() => {
                setForm({
                  id: "",
                  company: "",
                  title: "",
                  location: "",
                  startDate: "",
                  endDate: "",
                  current: false,
                  description: "",
                  achievements: [],
                  technologies: [],
                });
                setEditingId("new");
              }}
            >
              <Edit3 size={16} /> Add experience
            </Button>
          </div>
          {experiences.length === 0 ? (
            <div className="mt-8 text-center py-12 rounded-lg border border-border bg-black/20">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/20 text-zinc-400 mx-auto mb-3">
                <Briefcase size={24} />
              </div>
              <h3 className="text-zinc-200 font-medium">No experience yet</h3>
              <p className="mt-2 text-sm text-zinc-500">
                Add your work experience to ground interview answers in real
                examples.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {experiences.map((exp) => (
                <Card
                  key={exp.id}
                  className={isEditing(exp.id) ? "border-primary/50" : undefined}
                >
                  <CardContent className="pt-4 pb-3">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-200">
                          {exp.title}
                        </p>
                        <p className="text-xs text-zinc-400">{exp.company}</p>
                        {exp.location && (
                          <p className="text-xs text-zinc-500">{exp.location}</p>
                        )}
                        <div className="mt-1.5 flex gap-1.5 text-[10px] text-zinc-500">
                          <span>{exp.startDate}</span>
                          {exp.current ? (
                            <span className="bg-emerald/10 text-emerald-400 rounded px-1.5 py-0.5">
                              Present
                            </span>
                          ) : (
                            exp.endDate && <span>- {exp.endDate}</span>
                          )}
                        </div>
                        {exp.technologies?.length && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {exp.technologies.slice(0, 6).map((t: string) => (
                              <Badge key={t} variant="default">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {exp.description && (
                          <p className="mt-2 text-sm text-zinc-300 line-clamp-2">
                            {exp.description}
                          </p>
                        )}
                        {exp.achievements?.length && (
                          <div className="mt-2">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                              Achievements
                            </p>
                            <ul className="text-sm text-zinc-300 list-disc list-inside space-y-1">
                              {exp.achievements.map((a: string, idx: number) => (
                                <li key={idx}>{a}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      <div className="flex items-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setForm({ ...exp });
                            setEditingId(exp.id);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDelete(exp.id)}
                          disabled={deleteBusy === exp.id}
                        >
                          {deleteBusy === exp.id ? "Deleting…" : "Delete"}
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
                  {isEditing(form.id) ? "Edit experience" : "Add experience"}
                </h2>
              </CardHeader>
              <CardContent className="pt-0">
                <form onSubmit={handleSave} className="space-y-4">
                  <Input
                    label="Company"
                    id="company"
                    value={form.company}
                    onChange={(e) =>
                      setForm({ ...form, company: e.target.value })
                    }
                    error={saveError ? "Save failed. Try again." : undefined}
                  />
                  <Input
                    label="Job title"
                    id="title"
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                  />
                  <Input
                    label="Location"
                    id="location"
                    value={form.location}
                    onChange={(e) =>
                      setForm({ ...form, location: e.target.value })
                    }
                  />
                  <div className="flex gap-2">
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
                      value={form.current ? "" : form.endDate}
                      onChange={(e) =>
                        setForm({ ...form, endDate: e.target.value })
                      }
                      disabled={form.current}
                    />
                    <Switch
                      label="Current role"
                      checked={form.current}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, current: checked })
                      }
                    />
                  </div>
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
                    <Button
                      type="submit"
                      loading={saveBusy}
                      disabled={saveBusy}
                    >
                      Save experience
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

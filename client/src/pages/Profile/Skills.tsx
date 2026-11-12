import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectItem } from "@/components/ui/Select";
import { PageContainer } from "@/components/layout/PageContainer";
import { Edit3, Plus, Trash2, Zap } from "lucide-react";

const SKILL_LEVELS: readonly { value: string; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];

export function Skills() {
  const [skills, setSkills] = useState<readonly any[]>([]);
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
        setSkills([]);
        return;
      }
      const candidateId = res.data[0].id;
      const list = await (window as any).veyra.candidate.listRecords({
        candidateId,
        type: "skill",
      });
      if (!list?.success) throw new Error(list?.error?.message ?? "Failed to load skills.");
      setSkills(list.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load skills.");
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
        type: "skill",
        record: {
          ...form,
          id: form.id || crypto.randomUUID(),
        },
      });
      if (!res?.success) throw new Error(res?.error?.message ?? "Failed to save skill.");
      setForm(null);
      setEditingId(null);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save skill.");
    } finally {
      setSaveBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this skill?")) return;
    setDeleteBusy(id);
    try {
      const profiles = await (window as any).veyra.candidate.listProfiles();
      const candidateId = profiles.data?.[0].id;
      if (!candidateId) throw new Error("No candidate profile found.");
      const res = await (window as any).veyra.candidate.deleteRecord({
        candidateId,
        type: "skill",
        recordId: id,
      });
      if (!res?.success) throw new Error(res?.error?.message ?? "Failed to delete skill.");
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to delete skill.");
    } finally {
      setDeleteBusy(null);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[300px]">
          <span className="text-zinc-500 text-sm">Loading skills…</span>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <h2 className="text-zinc-200">Unable to load skills</h2>
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
            <h1 className="text-2xl font-semibold text-white">Skills</h1>
            <Button
              onClick={() => {
                setForm({
                  id: "",
                  name: "",
                  category: "",
                  level: "intermediate",
                  yearsOfExperience: undefined,
                  evidenceIds: [],
                });
                setEditingId("new");
              }}
            >
              <Edit3 size={16} /> Add skill
            </Button>
          </div>
          {skills.length === 0 ? (
            <div className="mt-8 text-center py-12 rounded-lg border border-border bg-black/20">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/20 text-zinc-400 mx-auto mb-3">
                <Zap size={24} />
              </div>
              <h3 className="text-zinc-200 font-medium">No skills yet</h3>
              <p className="mt-2 text-sm text-zinc-500">
                Add your skills to help match you with relevant interview
                questions.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {skills.map((skill) => (
                <Card key={skill.id} className={isEditing(skill.id) ? "border-primary/50" : undefined}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-200">
                          {skill.name}
                        </p>
                        {skill.category && (
                          <p className="text-xs text-zinc-500">{skill.category}</p>
                        )}
                        <Badge
                          variant={
                            skill.level === "expert"
                              ? "success"
                              : skill.level === "advanced"
                                ? "warning"
                                : skill.level === "intermediate"
                                  ? "default"
                                  : "info"
                          }
                        >
                          {skill.level.charAt(0).toUpperCase() + skill.level.slice(1)}
                        </Badge>
                        {skill.yearsOfExperience != null && (
                          <p className="text-xs text-zinc-500">
                            {skill.yearsOfExperience} years experience
                          </p>
                        )}
                        {skill.evidenceIds?.length && (
                          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-zinc-500">
                            {skill.evidenceIds.slice(0, 3).map((eid: string, idx: number) => (
                              <Badge key={idx} variant="default">
                                Evidence #{idx + 1}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setForm({ ...skill });
                            setEditingId(skill.id);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDelete(skill.id)}
                          disabled={deleteBusy === skill.id}
                        >
                          {deleteBusy === skill.id ? "Deleting…" : "Delete"}
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
                  {isEditing(form.id) ? "Edit skill" : "Add skill"}
                </h2>
              </CardHeader>
              <CardContent className="pt-0">
                <form onSubmit={handleSave} className="space-y-4">
                  <Input
                    label="Skill name"
                    id="name"
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    error={saveError ? "Save failed. Try again." : undefined}
                  />
                  <Input
                    label="Category (e.g. Programming, Design, Management)"
                    id="category"
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                  />
                  <Select
                    label="Proficiency level"
                    value={form.level}
                    onValueChange={(value) =>
                      setForm({ ...form, level: value })
                    }
                  >
                    {SKILL_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </Select>
                  <Input
                    label="Years of experience (optional)"
                    type="number"
                    min="0"
                    id="yearsOfExperience"
                    value={form.yearsOfExperience ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        yearsOfExperience:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                  <Input
                    label="Supporting evidence IDs (comma-separated)"
                    id="evidenceIds"
                    value={form.evidenceIds.join(", ")}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        evidenceIds: e.target.value
                          .split(",")
                          .map((t: string) => t.trim())
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
                    <Button type="submit" loading={saveBusy} disabled={saveBusy}>
                      Save skill
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



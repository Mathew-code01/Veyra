import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/layout/PageContainer";

export function Stories() {
  const [stories, setStories] = useState<readonly any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await (window as any).veyra.candidate.listProfiles();
      if (!res?.success || !(res.data ?? []).length) {
        setStories([]);
        return;
      }
      const candidateId = res.data[0].id;
      const list = await (window as any).veyra.candidate.listRecords({
        candidateId,
        type: "story",
      });
      if (!list?.success) throw new Error(list?.error?.message ?? "Failed to load stories.");
      setStories(list.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stories.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[300px]">
          <span className="text-zinc-500 text-sm">Loading stories…</span>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <h2 className="text-zinc-200">Unable to load stories</h2>
          <p className="mt-2 text-sm text-zinc-500">{error}</p>
          <Button onClick={() => void load()} variant="outline">
            Try again
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-white">Behavioral Stories</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Your STAR story library for behavioral interview answers.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Button variant="outline">Add story</Button>
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stories.length === 0 ? (
          <div className="col-span-3 rounded-lg border border-border bg-black/20 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/20 text-zinc-400 mx-auto mb-3">
              <Star size={24} />
            </div>
            <h3 className="text-zinc-200 font-medium">No stories yet</h3>
            <p className="mt-2 text-sm text-zinc-500">
              Build your STAR story library to answer behavioral questions with
              confidence.
            </p>
          </div>
        ) : (
          stories.map((story) => (
            <Card key={story.id}>
              <CardContent className="pt-4 pb-3">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-200">
                      {story.title}
                    </p>
                    {story.skills?.length && (
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-zinc-500">
                        {story.skills.slice(0, 6).map((s: string) => (
                          <Badge key={s} variant="default">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-sm text-zinc-300 line-clamp-2">
                      {story.situation}
                    </p>
                    {story.result && (
                      <div className="mt-3 pt-2 border-t border-border text-sm text-zinc-300">
                        <span className="font-semibold text-zinc-400">Result:</span>{" "}
                        {story.result}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </PageContainer>
  );
}

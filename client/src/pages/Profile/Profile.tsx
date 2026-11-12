import { useCallback, useEffect, useState } from "react";
import { Edit3, User } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { PageContainer } from "@/components/layout/PageContainer";

export function Profile() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await (window as any).veyra.candidate.listProfiles();
      if (!res?.success) {
        throw new Error(res?.error?.message ?? "Failed to load profiles.");
      }
      const profiles = res.data ?? [];
      if (profiles.length === 0) {
        setProfile(null);
        return;
      }
      const p = profiles[0];
      const detail = await (window as any).veyra.candidate.getProfile({
        candidateId: p.id,
      });
      if (!detail?.success) {
        throw new Error(detail?.error?.message ?? "Failed to load profile.");
      }
      setProfile(detail.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile.");
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
          <span className="text-zinc-500 text-sm">Loading profile…</span>
        </div>
      </PageContainer>
    );
  }

  if (error && !profile) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <h2 className="text-zinc-200">Unable to load profile</h2>
          <p className="mt-2 text-sm text-zinc-500">{error}</p>
          <Button onClick={() => void load()} variant="outline">
            Try again
          </Button>
        </div>
      </PageContainer>
    );
  }

  if (!profile) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/20 text-zinc-400">
            <User size={24} />
          </div>
          <h2 className="mt-4 text-zinc-200 font-medium">No profile yet</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Create your candidate profile to ground interview guidance in your
            real experience.
          </p>
          <Button onClick={() => void load()} variant="outline">
            Try again
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>
      )}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-white">Candidate Profile</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Your professional knowledge base. Ground interview guidance in your
            real experience.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge variant="default">{profile.fullName}</Badge>
            {profile.headline && (
              <span className="text-xs text-zinc-500">· {profile.headline}</span>
            )}
          </div>
          {profile.summary && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Summary
              </h3>
              <p className="mt-1 text-zinc-300">{profile.summary}</p>
            </div>
          )}
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Contact
            </h3>
            <div className="mt-1 space-y-2 text-sm text-zinc-300">
              {profile.location && (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">Location:</span>
                  <span>{profile.location}</span>
                </div>
              )}
              {profile.email && (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">Email:</span>
                  <span>{profile.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1">
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-white">Education</h2>
            </CardHeader>
            <CardContent className="pt-0">
              {(profile.education ?? []).length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-4">
                  No education records yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {(profile.education ?? []).map((edu: any, i: number) => (
                    <li key={i} className="rounded-lg border border-border bg-black/20 p-3">
                      <p className="text-sm text-zinc-200 font-medium">
                        {edu.institution}
                      </p>
                      {edu.degree && (
                        <p className="text-xs text-zinc-400">{edu.degree}</p>
                      )}
                      {edu.fieldOfStudy && (
                        <p className="text-xs text-zinc-500">{edu.fieldOfStudy}</p>
                      )}
                      <div className="mt-1 flex gap-2 text-[10px] text-zinc-500">
                        {edu.startDate && <span>{edu.startDate}</span>}
                        {edu.endDate && <span>- {edu.endDate}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader>
              <h2 className="text-base font-semibold text-white">Certifications</h2>
            </CardHeader>
            <CardContent className="pt-0">
              {(profile.certifications ?? []).length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-4">
                  No certifications yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {(profile.certifications ?? []).map((cert: any, i: number) => (
                    <li key={i} className="rounded-lg border border-border bg-black/20 p-3">
                      <p className="text-sm text-zinc-200 font-medium">
                        {cert.name}
                      </p>
                      {cert.issuer && (
                        <p className="text-xs text-zinc-400">{cert.issuer}</p>
                      )}
                      {cert.issueDate && (
                        <p className="text-xs text-zinc-500">
                          Issued: {cert.issueDate}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

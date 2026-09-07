// client/src/pages/Profile/Profile.tsx

import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent } from "@/components/ui/Card";

export function Profile() {
  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold">Candidate Profile</h1>

      <p className="mt-2 text-sm text-zinc-500">
        Your professional knowledge base.
      </p>

      <Card className="mt-6">
        <CardContent className="pt-5">
          Candidate profile will be implemented next.
        </CardContent>
      </Card>
    </PageContainer>
  );
}
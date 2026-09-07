// client/src/pages/Preparation/Preparation.tsx

import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent } from "@/components/ui/Card";

export function Preparation() {
  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold">Interview Preparation</h1>

      <p className="mt-2 text-sm text-zinc-500">
        Configure your candidate context and interview.
      </p>

      <Card className="mt-6">
        <CardContent className="pt-5">
          Preparation workspace coming next.
        </CardContent>
      </Card>
    </PageContainer>
  );
}
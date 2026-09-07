// client/src/pages/Documents/Documents.tsx

import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent } from "@/components/ui/Card";

export function Documents() {
  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold">Documents</h1>

      <p className="mt-2 text-sm text-zinc-500">
        Your resume, job descriptions and supporting documents.
      </p>

      <Card className="mt-6">
        <CardContent className="pt-5">
          Document management will be implemented next.
        </CardContent>
      </Card>
    </PageContainer>
  );
}

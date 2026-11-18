import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageContainer } from "@/components/layout/PageContainer";
import { DocumentSourceType } from "@core/documents/DocumentTypes";

interface DocumentRow {
  readonly documentId: string;
  readonly type: string;
  readonly status: string;
  readonly processedAt?: string;
  readonly filename?: string;
}

export function Documents() {
  const [documents, setDocuments] = useState<readonly DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    if (!window.veyra?.document?.list) {
      setError("VEYRA Desktop is required for document management.");
      setLoading(false);
      return;
    }
    try {
      const result = await window.veyra.document.list();
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? "Could not load documents.");
      }
      setDocuments(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importDocuments = async () => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const picked = await window.veyra.document.pick({
        filters: [
          { name: "Supported documents", extensions: ["txt", "md", "markdown", "html", "htm"] },
        ],
      });
      if (!picked.success || !picked.data) {
        throw new Error(picked.error?.message ?? "The document picker failed.");
      }

      let importedCount = 0;
      for (const file of picked.data.files) {
        const result = await window.veyra.document.import({
          fileHandle: file.handle,
          source: { type: DocumentSourceType.FILE, filename: file.filename },
        });
        if (!result.success) {
          throw new Error(result.error?.message ?? `Could not import ${file.filename}.`);
        }
        importedCount += 1;
      }

      setMessage(
        importedCount
          ? `Imported ${importedCount} document${importedCount === 1 ? "" : "s"}.`
          : "No documents selected.",
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Document import failed.");
    } finally {
      setBusy(false);
    }
  };

  const deleteDocument = async (document: DocumentRow) => {
    if (!window.confirm(`Delete "${document.filename ?? document.documentId}" and its indexed data?`)) {
      return;
    }
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await window.veyra.document.delete({
        documentId: document.documentId,
      });
      if (!result.success) {
        throw new Error(result.error?.message ?? "Could not delete the document.");
      }
      setMessage("Document and derived indexed data deleted.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Document deletion failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Profile-scoped files are parsed and indexed locally. Candidate-specific association is not available yet.
          </p>
        </div>
        <Button onClick={() => void importDocuments()} loading={busy}>
          Import documents
        </Button>
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-emerald-400">{message}</p>}

      <Card className="mt-6">
        <CardContent className="pt-5">
          {loading ? (
            <p className="text-sm text-zinc-400">Loading documents…</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-zinc-400">No documents have been imported.</p>
          ) : (
            <ul className="divide-y divide-white/8">
              {documents.map((document) => (
                <li key={document.documentId} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-100">
                      {document.filename ?? document.documentId}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {document.type} · {document.status}
                      {document.processedAt
                        ? ` · ${new Date(document.processedAt).toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onClick={() => void deleteDocument(document)}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

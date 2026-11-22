import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FileUp,
  LoaderCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { ProcessedDocument } from "@core/documents/DocumentTypes";
import { DocumentSourceType } from "@core/documents/DocumentTypes";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/layout/PageContainer";
import "./Documents.css";

interface DocumentRow {
  readonly documentId: string;
  readonly type: string;
  readonly status: string;
  readonly processedAt?: string;
  readonly filename?: string;
}

type DocumentFilter = "all" | "ready" | "attention";
const isReady = (status: string) => status.toLowerCase() === "completed";
const dateLabel = (value?: string) => {
  if (!value) return "Not processed yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
};

export function Documents() {
  const [documents, setDocuments] = useState<readonly DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [selected, setSelected] = useState<ProcessedDocument>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const api = window.veyra?.document;
    if (!api?.list) {
      setError(
        "Open VEYRA Desktop to manage documents in this local workspace.",
      );
      setLoading(false);
      return;
    }
    try {
      const result = await api.list();
      if (!result.success || !result.data)
        throw new Error(result.error?.message ?? "Could not load documents.");
      setDocuments(result.data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load documents.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(
    () =>
      documents.filter((document) => {
        const matchesFilter =
          filter === "all" ||
          (filter === "ready"
            ? isReady(document.status)
            : !isReady(document.status));
        const needle = query.trim().toLocaleLowerCase();
        const matchesQuery =
          !needle ||
          `${document.filename ?? ""} ${document.type} ${document.status}`
            .toLocaleLowerCase()
            .includes(needle);
        return matchesFilter && matchesQuery;
      }),
    [documents, filter, query],
  );

  const importDocuments = async () => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const picked = await window.veyra.document.pick({
        filters: [
          {
            name: "Supported documents",
            extensions: ["txt", "md", "markdown", "html", "htm", "pdf", "docx"],
          },
        ],
      });
      if (!picked.success || !picked.data)
        throw new Error(picked.error?.message ?? "The document picker failed.");
      if (picked.data.files.length === 0) {
        setMessage("No documents selected.");
        return;
      }
      let imported = 0;
      const failures: string[] = [];
      for (const file of picked.data.files) {
        const result = await window.veyra.document.import({
          fileHandle: file.handle,
          source: { type: DocumentSourceType.FILE, filename: file.filename },
        });
        if (result.success) imported += 1;
        else
          failures.push(
            `${file.filename}: ${result.error?.message ?? "Import failed"}`,
          );
      }
      if (imported)
        setMessage(
          `Imported ${imported} document${imported === 1 ? "" : "s"}.${failures.length ? ` ${failures.length} could not be processed; review the error details.` : ""}`,
        );
      if (failures.length) setError(failures.join("\n"));
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Document import failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const openDocument = async (document: DocumentRow) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await window.veyra.document.read({
        documentId: document.documentId,
      });
      if (!result.success || !result.data)
        throw new Error(
          result.error?.message ?? "Could not open this document.",
        );
      setSelected(result.data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not open this document.",
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteDocument = async (document: DocumentRow) => {
    if (
      !window.confirm(
        `Delete “${document.filename ?? document.documentId}” and its indexed data?`,
      )
    )
      return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await window.veyra.document.delete({
        documentId: document.documentId,
      });
      if (!result.success)
        throw new Error(
          result.error?.message ?? "Could not delete the document.",
        );
      if (selected?.identity.id === document.documentId) setSelected(undefined);
      setMessage("Document and its derived local index were deleted.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Document deletion failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const readyCount = documents.filter((document) =>
    isReady(document.status),
  ).length;
  return (
    <PageContainer className="!py-7 sm:!py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">
            Candidate workspace
          </p>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-slate-900 sm:text-[32px]">
            Documents
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Keep your CV and supporting files in this local workspace. VEYRA
            parses and indexes files on this device.
          </p>
        </div>
        <Button onClick={() => void importDocuments()} loading={busy}>
          <FileUp size={16} /> Import documents
        </Button>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-3 text-sm text-slate-600">
          <FileText size={17} className="text-primary" />
          <span>
            {documents.length} document{documents.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-3 text-sm text-slate-600">
          <CheckCircle2 size={17} className="text-emerald-600" />
          <span>{readyCount} processed</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-3 text-xs text-slate-500">
          Private to the active local profile
        </div>
      </div>
      <section className="mt-5 rounded-2xl border border-dashed border-primary/40 bg-indigo-50/40 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-100 text-primary">
            <FileUp size={21} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-slate-900">Add a document</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Choose TXT, Markdown, HTML, PDF or DOCX. Text extraction can fail
              for scanned PDFs or compressed DOCX files; VEYRA will show the
              actual processing result.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void importDocuments()}
          >
            Browse files
          </Button>
        </div>
      </section>
      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <pre className="whitespace-pre-wrap font-sans">{error}</pre>
        </div>
      )}
      {message && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {message}
        </p>
      )}
      <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_12px_36px_-28px_rgba(24,32,68,0.34)]">
        <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="font-semibold text-slate-900">Your library</h2>
            <p className="mt-1 text-xs text-slate-500">
              Files are scoped to the active desktop profile.
            </p>
          </div>
          <label className="document-search relative block w-full">
            <span className="sr-only">Search documents</span>
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search documents"
              className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>
        <div
          className="flex flex-wrap gap-2 border-b border-border px-5 py-3 sm:px-6"
          role="group"
          aria-label="Filter documents"
        >
          {(
            [
              { id: "all", label: `All (${documents.length})` },
              { id: "ready", label: `Processed (${readyCount})` },
              {
                id: "attention",
                label: `Needs attention (${documents.length - readyCount})`,
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${filter === item.id ? "bg-indigo-100 text-indigo-800" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <LoaderCircle size={16} className="animate-spin" /> Loading
            documents…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center sm:px-6">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-primary">
              <FileText size={21} />
            </span>
            <h3 className="mt-4 font-semibold text-slate-900">
              {documents.length === 0
                ? "No documents yet"
                : "No matching documents"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-5 text-slate-500">
              {documents.length === 0
                ? "Import a CV or supporting file to keep it with this local workspace."
                : "Try another search or change the processing filter."}
            </p>
            {documents.length === 0 && (
              <Button
                className="mt-4"
                onClick={() => void importDocuments()}
                disabled={busy}
              >
                Import a document
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((document) => (
              <li
                key={document.documentId}
                className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-primary">
                  <FileText size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {document.filename ?? document.documentId}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {document.type.toUpperCase()}{" "}
                    <span aria-hidden="true">·</span>{" "}
                    {dateLabel(document.processedAt)}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${isReady(document.status) ? "bg-emerald-50 text-emerald-700" : document.status.toLowerCase() === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}
                >
                  {isReady(document.status) ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <AlertCircle size={13} />
                  )}
                  <span>{document.status}</span>
                </span>
                <div className="flex w-full justify-end gap-2 sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void openDocument(document)}
                  >
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${document.filename ?? "document"}`}
                    disabled={busy}
                    onClick={() => void deleteDocument(document)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-4 text-xs leading-5 text-slate-500">
        Documents are parsed and indexed locally. They are not yet automatically
        associated with a specific candidate record, and analysis depends on
        available services.
      </p>
      {selected && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(17, 24, 39, 0.42)",
          }}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(undefined);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-dialog-title"
            style={{
              width: "100%",
              maxWidth: 768,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              borderRadius: 16,
              background: "white",
              boxShadow: "0 24px 64px rgba(15, 23, 42, 0.24)",
            }}
          >
            <header className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {selected.type}
                </p>
                <h2
                  id="document-dialog-title"
                  className="mt-1 truncate text-lg font-semibold text-slate-900"
                >
                  {selected.metadata.filename ??
                    selected.identity.filename ??
                    "Document text"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Processed {dateLabel(selected.processedAt)} ·{" "}
                  {selected.status}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close document"
                onClick={() => setSelected(undefined)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X size={17} />
              </button>
            </header>
            <div className="overflow-y-auto p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-slate-800">
                Extracted text
              </h3>
              {selected.text ? (
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  className="mt-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700"
                >
                  {selected.text}
                </pre>
              ) : (
                <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                  No text was extracted from this file.
                </p>
              )}
              {selected.warnings.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-semibold text-amber-900">
                    Processing notes
                  </h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                    {selected.warnings.map((warning, index) => (
                      <li key={`${index}-${warning}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <footer className="flex justify-end border-t border-border p-4">
              <Button variant="outline" onClick={() => setSelected(undefined)}>
                Close
              </Button>
            </footer>
          </section>
        </div>
      )}
    </PageContainer>
  );
}

export type DocumentType = "resume" | "job-description" | "project" | "company-research" | "other";
export type DocumentStatus = "pending" | "processing" | "indexed" | "failed";
export interface DocumentMetadata {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    type: DocumentType;
    status: DocumentStatus;
    createdAt: string;
    updatedAt: string;
}

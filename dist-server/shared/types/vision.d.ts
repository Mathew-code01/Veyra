export type VisionContentType = "code" | "document" | "diagram" | "chart" | "screenshot" | "job-description" | "unknown";
export interface VisionAnalysisRequest {
    id: string;
    imageData: string;
    contentType?: VisionContentType;
    prompt?: string;
}
export interface OCRResult {
    text: string;
    confidence: number;
}
export interface VisionAnalysisResult {
    id: string;
    contentType: VisionContentType;
    ocr?: OCRResult;
    analysis: string;
    confidence: number;
    latencyMs: number;
}

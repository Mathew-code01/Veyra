export type Speaker = "interviewer" | "candidate" | "unknown";
export type TranscriptSegmentStatus = "partial" | "final";
export type QuestionType = "question" | "follow-up" | "clarification" | "repetition" | "topic-change" | "statement" | "acknowledgement" | "task";
export interface TranscriptSegment {
    id: string;
    speaker: Speaker;
    text: string;
    startMs: number;
    endMs: number;
    confidence: number;
    status: TranscriptSegmentStatus;
}
export interface DetectedQuestion {
    id: string;
    transcriptSegmentId: string;
    text: string;
    type: QuestionType;
    confidence: number;
    topic?: string;
    detectedAt: string;
}

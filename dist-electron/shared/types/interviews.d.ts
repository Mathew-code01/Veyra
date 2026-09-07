export declare const INTERVIEW_TYPES: readonly ["behavioral", "technical", "coding", "system-design", "product", "case"];
export type InterviewType = (typeof INTERVIEW_TYPES)[number];
export type InterviewDifficulty = "entry" | "mid" | "senior" | "staff" | "principal";
export type InterviewMode = "preparation" | "practice" | "live";
export interface InterviewConfiguration {
    type: InterviewType;
    difficulty: InterviewDifficulty;
    mode: InterviewMode;
    companyId?: string;
    jobDescriptionId?: string;
    candidateProfileId: string;
    enabledFeatures: {
        transcription: boolean;
        vision: boolean;
        retrieval: boolean;
        liveGuidance: boolean;
    };
}

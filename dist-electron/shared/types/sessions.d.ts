import type { ISODateString, Timestamped, UUID } from "./common";
import type { InterviewConfiguration, InterviewType } from "./interviews";
export type SessionStatus = "created" | "preparing" | "active" | "paused" | "completed" | "cancelled" | "failed";
export interface InterviewSession extends Timestamped {
    id: UUID;
    status: SessionStatus;
    interviewType: InterviewType;
    configuration: InterviewConfiguration;
    startedAt: ISODateString | null;
    endedAt: ISODateString | null;
    durationMs: number;
    questionCount: number;
    answerCount: number;
    averageResponseLatencyMs: number | null;
}

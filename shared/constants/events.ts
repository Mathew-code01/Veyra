// ============================================================================
// FILE: shared/constants/events.ts
//
// PURPOSE:
// Canonical Veyra IPC channels and application events.
//
// ARCHITECTURAL RULE:
//
// IPC_CHANNELS:
//   Request/response or explicit IPC communication boundaries.
//
// IPC_EVENTS:
//   Domain/application events emitted when something meaningful happens.
//
// Interview-specific channels/events belong here so the UI, Electron main
// process, preload layer, and core/interview do not invent string literals.
// ============================================================================

export const IPC_CHANNELS = Object.freeze({
  // --------------------------------------------------------------------------
  // APP
  // --------------------------------------------------------------------------

  APP_GET_VERSION: "app:get-version",
  APP_GET_PLATFORM: "app:get-platform",
  APP_GET_ENVIRONMENT: "app:get-environment",

  // --------------------------------------------------------------------------
  // WINDOW
  // --------------------------------------------------------------------------

  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_MAXIMIZE: "window:maximize",
  WINDOW_CLOSE: "window:close",
  WINDOW_IS_MAXIMIZED: "window:is-maximized",
  WINDOW_IS_AVAILABLE: "window:is-available",

  APP_QUIT: "app:quit",
  APP_RELAUNCH: "app:relaunch",

  // --------------------------------------------------------------------------
  // SESSION
  // --------------------------------------------------------------------------

  SESSION_START: "session:start",
  SESSION_PAUSE: "session:pause",
  SESSION_RESUME: "session:resume",
  SESSION_STOP: "session:stop",
  SESSION_GET: "session:get",
  SESSION_EVENT: "session:event",
  SESSION_STATE_CHANGED: "session:state-changed",

  // --------------------------------------------------------------------------
  // AI
  // --------------------------------------------------------------------------

  AI_GENERATE: "ai:generate",
  AI_STREAM_START: "ai:stream:start",
  AI_STREAM_CANCEL: "ai:stream:cancel",
  AI_PROVIDER_STATUS: "ai:provider-status",
  AI_STREAM_CHUNK: "ai:stream:chunk",
  AI_STREAM_COMPLETE: "ai:stream:complete",
  AI_STREAM_ERROR: "ai:stream:error",

  // --------------------------------------------------------------------------
  // AUDIO
  // --------------------------------------------------------------------------

  AUDIO_DEVICES_LIST: "audio:devices:list",
  AUDIO_PERMISSION_STATUS: "audio:permission:status",
  AUDIO_PERMISSION_REQUEST: "audio:permission:request",
  AUDIO_SESSION_START: "audio:session:start",
  AUDIO_SESSION_STOP: "audio:session:stop",
  AUDIO_SESSION_STATE: "audio:session:state",
  AUDIO_TRANSCRIPT_PARTIAL: "audio:transcript:partial",
  AUDIO_TRANSCRIPT_FINAL: "audio:transcript:final",
  AUDIO_TRANSCRIPT_STATE: "audio:transcript:state",
  AUDIO_METRICS: "audio:metrics",

  // --------------------------------------------------------------------------
  // AUDIO-TO-RUNTIME (live interview assistance)
  // --------------------------------------------------------------------------

  AUDIO_RUNTIME_SESSION_START: "audio:runtime:session:start",
  AUDIO_RUNTIME_SESSION_STOP: "audio:runtime:session:stop",
  AUDIO_RUNTIME_SESSION_STATE: "audio:runtime:session:state",
  AUDIO_TRANSCRIPT_SUBMIT: "audio:transcript:submit",

  // --------------------------------------------------------------------------
  // CAPTURE
  // --------------------------------------------------------------------------

  CAPTURE_SOURCES_LIST: "capture:sources:list",
  CAPTURE_PERMISSION_STATUS: "capture:permission:status",
  CAPTURE_PERMISSION_REQUEST: "capture:permission:request",
  CAPTURE_START: "capture:start",
  CAPTURE_STOP: "capture:stop",
  CAPTURE_FRAME: "capture:frame",
  CAPTURE_STATUS: "capture:status",

  // --------------------------------------------------------------------------
  // DOCUMENT
  // --------------------------------------------------------------------------

  DOCUMENT_PICK: "document:pick",
  DOCUMENT_IMPORT: "document:import",
  DOCUMENT_READ: "document:read",
  DOCUMENT_DELETE: "document:delete",
  DOCUMENT_LIST: "document:list",

  // --------------------------------------------------------------------------
  // CANDIDATE
  // --------------------------------------------------------------------------

  CANDIDATE_PROFILE_GET: "candidate:profile:get",
  CANDIDATE_PROFILE_LIST: "candidate:profile:list",
  CANDIDATE_PROFILE_SAVE: "candidate:profile:save",
  CANDIDATE_PROFILE_DELETE: "candidate:profile:delete",
  CANDIDATE_RECORD_LIST: "candidate:record:list",
  CANDIDATE_RECORD_GET: "candidate:record:get",
  CANDIDATE_RECORD_SAVE: "candidate:record:save",
  CANDIDATE_RECORD_DELETE: "candidate:record:delete",

  // --------------------------------------------------------------------------
  // MEMORY
  // --------------------------------------------------------------------------

  MEMORY_SEARCH: "memory:search",
  MEMORY_LIST: "memory:list",
  MEMORY_CREATE: "memory:create",
  MEMORY_UPDATE: "memory:update",
  MEMORY_DELETE: "memory:delete",

  // --------------------------------------------------------------------------
  // INTERVIEW
  //
  // These are deliberately separate from conversation channels.
  //
  // Conversation:
  //   "What is happening in the conversation?"
  //
  // Interview:
  //   "What interview task is happening and what guidance is appropriate?"
  // --------------------------------------------------------------------------

  INTERVIEW_ANALYZE: "interview:analyze",
  INTERVIEW_CLASSIFY: "interview:classify",
  INTERVIEW_TASK: "interview:task",
  INTERVIEW_GUIDANCE: "interview:guidance",
  INTERVIEW_DOMAIN_CLASSIFY: "interview:domain-classify",
  INTERVIEW_QUESTION_UNDERSTAND: "interview:question-understand",
  INTERVIEW_PLAN_ANSWER: "interview:plan-answer",
  INTERVIEW_EVALUATE_ANSWER: "interview:evaluate-answer",
  INTERVIEW_COMMUNICATION_FEEDBACK: "interview:communication-feedback",
  INTERVIEW_FOLLOW_UP: "interview:follow-up",

  // --------------------------------------------------------------------------
  // PRACTICE & MOCK INTERVIEWS
  // --------------------------------------------------------------------------

  PRACTICE_CREATE_SESSION: "practice:create-session",
  PRACTICE_GET_SESSION: "practice:get-session",
  PRACTICE_LIST_SESSIONS: "practice:list-sessions",
  PRACTICE_SUBMIT_ANSWER: "practice:submit-answer",
  PRACTICE_NEXT_QUESTION: "practice:next-question",
  PRACTICE_PAUSE_SESSION: "practice:pause-session",
  PRACTICE_RESUME_SESSION: "practice:resume-session",
  PRACTICE_COMPLETE_SESSION: "practice:complete-session",
  PRACTICE_GET_REPORT: "practice:get-report",

  // --------------------------------------------------------------------------
  // UNIFIED INTERVIEW RUNTIME (practice + live, canonical orchestration)
  // --------------------------------------------------------------------------

  RUNTIME_CREATE_SESSION: "runtime:create-session",
  RUNTIME_START_SESSION: "runtime:start-session",
  RUNTIME_PAUSE_SESSION: "runtime:pause-session",
  RUNTIME_RESUME_SESSION: "runtime:resume-session",
  RUNTIME_CANCEL_SESSION: "runtime:cancel-session",
  RUNTIME_COMPLETE_SESSION: "runtime:complete-session",
  RUNTIME_PROCESS_QUESTION: "runtime:process-question",
  RUNTIME_SUBMIT_ANSWER: "runtime:submit-answer",
  RUNTIME_GET_STATE: "runtime:get-state",

  // --------------------------------------------------------------------------
  // SETTINGS
  // --------------------------------------------------------------------------

  SETTINGS_GET: "settings:get",
  SETTINGS_UPDATE: "settings:update",

  // --------------------------------------------------------------------------
  // OVERLAY
  // --------------------------------------------------------------------------

  OVERLAY_SHOW: "overlay:show",
  OVERLAY_HIDE: "overlay:hide",
  OVERLAY_TOGGLE: "overlay:toggle",
  OVERLAY_UPDATE: "overlay:update",

  // --------------------------------------------------------------------------
  // VISION
  // --------------------------------------------------------------------------

  VISION_ANALYZE: "vision:analyze",

  // --------------------------------------------------------------------------
  // HEALTH
  // --------------------------------------------------------------------------

  HEALTH_CHECK: "health:check",

  // --------------------------------------------------------------------------
  // PROVIDER SETTINGS (BYOK)
  // --------------------------------------------------------------------------

  PROVIDERS_GET_STATUS: "providers:get-status",
  PROVIDERS_SAVE_CREDENTIAL: "providers:save-credential",
  PROVIDERS_DELETE_CREDENTIAL: "providers:delete-credential",
  PROVIDERS_VERIFY_CREDENTIAL: "providers:verify-credential",
  PROVIDERS_LIST_MODELS: "providers:list-models",
  PROVIDERS_SET_PREFERRED_MODEL: "providers:set-preferred-model",
  PROVIDERS_SET_EXECUTION_MODE: "providers:set-execution-mode",
} as const);

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const IPC_EVENTS = Object.freeze({
  // --------------------------------------------------------------------------
  // SESSION
  // --------------------------------------------------------------------------

  SESSION_STARTED: "session.started",
  SESSION_PAUSED: "session.paused",
  SESSION_RESUMED: "session.resumed",
  SESSION_STOPPED: "session.stopped",

  // --------------------------------------------------------------------------
  // CONVERSATION
  // --------------------------------------------------------------------------

  QUESTION_DETECTED: "question.detected",
  TRANSCRIPT_UPDATED: "transcript.updated",

  // --------------------------------------------------------------------------
  // INTERVIEW
  //
  // These events represent semantic interview processing, not raw transcript
  // changes.
  // --------------------------------------------------------------------------

  INTERVIEW_CLASSIFIED: "interview.classified",
  INTERVIEW_TASK_DETECTED: "interview.task.detected",
  INTERVIEW_GUIDANCE_UPDATED: "interview.guidance.updated",
  INTERVIEW_ANALYSIS_COMPLETED: "interview.analysis.completed",

  // --------------------------------------------------------------------------
  // ANSWER
  // --------------------------------------------------------------------------

  ANSWER_GENERATED: "answer.generated",

  // --------------------------------------------------------------------------
  // AI
  // --------------------------------------------------------------------------

  AI_PROVIDER_CHANGED: "ai.provider.changed",

  // --------------------------------------------------------------------------
  // AUDIO
  // --------------------------------------------------------------------------

  AUDIO_STARTED: "audio.started",
  AUDIO_STOPPED: "audio.stopped",

  // --------------------------------------------------------------------------
  // CAPTURE
  // --------------------------------------------------------------------------

  CAPTURE_STARTED: "capture.started",
  CAPTURE_STOPPED: "capture.stopped",

  // --------------------------------------------------------------------------
  // VISION
  // --------------------------------------------------------------------------

  VISION_ANALYSIS_COMPLETED: "vision.analysis.completed",
} as const);

export type IPCEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];

// shared/constants/events.ts

export const IPC_CHANNELS = Object.freeze({
  APP_GET_VERSION: "app:get-version",
  APP_GET_PLATFORM: "app:get-platform",
  APP_GET_ENVIRONMENT: "app:get-environment",

  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_MAXIMIZE: "window:maximize",
  WINDOW_CLOSE: "window:close",
  WINDOW_IS_MAXIMIZED: "window:is-maximized",
  WINDOW_IS_AVAILABLE: "window:is-available",

  APP_QUIT: "app:quit",
  APP_RELAUNCH: "app:relaunch",

  SESSION_START: "session:start",
  SESSION_PAUSE: "session:pause",
  SESSION_RESUME: "session:resume",
  SESSION_STOP: "session:stop",
  SESSION_GET: "session:get",

  SESSION_EVENT: "session:event",
  SESSION_STATE_CHANGED: "session:state-changed",

  AI_GENERATE: "ai:generate",
  AI_STREAM_START: "ai:stream:start",
  AI_STREAM_CANCEL: "ai:stream:cancel",
  AI_PROVIDER_STATUS: "ai:provider-status",

  AI_STREAM_CHUNK: "ai:stream:chunk",
  AI_STREAM_COMPLETE: "ai:stream:complete",
  AI_STREAM_ERROR: "ai:stream:error",

  AUDIO_DEVICES_LIST: "audio:devices:list",
  AUDIO_PERMISSION_STATUS: "audio:permission:status",
  AUDIO_PERMISSION_REQUEST: "audio:permission:request",

  AUDIO_SESSION_START: "audio:session:start",
  AUDIO_SESSION_STOP: "audio:session:stop",

  AUDIO_TRANSCRIPT_PARTIAL: "audio:transcript:partial",
  AUDIO_TRANSCRIPT_FINAL: "audio:transcript:final",

  CAPTURE_SOURCES_LIST: "capture:sources:list",
  CAPTURE_PERMISSION_STATUS: "capture:permission:status",
  CAPTURE_PERMISSION_REQUEST: "capture:permission:request",

  CAPTURE_START: "capture:start",
  CAPTURE_STOP: "capture:stop",

  CAPTURE_FRAME: "capture:frame",
  CAPTURE_STATUS: "capture:status",

  DOCUMENT_PICK: "document:pick",
  DOCUMENT_READ: "document:read",
  DOCUMENT_DELETE: "document:delete",
  DOCUMENT_LIST: "document:list",

  SETTINGS_GET: "settings:get",
  SETTINGS_UPDATE: "settings:update",

  OVERLAY_SHOW: "overlay:show",
  OVERLAY_HIDE: "overlay:hide",
  OVERLAY_TOGGLE: "overlay:toggle",
  OVERLAY_UPDATE: "overlay:update",

  VISION_ANALYZE: "vision:analyze",

  HEALTH_CHECK: "health:check",
} as const);

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const IPC_EVENTS = Object.freeze({
  SESSION_STARTED: "session.started",
  SESSION_PAUSED: "session.paused",
  SESSION_RESUMED: "session.resumed",
  SESSION_STOPPED: "session.stopped",

  QUESTION_DETECTED: "question.detected",
  TRANSCRIPT_UPDATED: "transcript.updated",

  ANSWER_GENERATED: "answer.generated",

  AI_PROVIDER_CHANGED: "ai.provider.changed",

  AUDIO_STARTED: "audio.started",
  AUDIO_STOPPED: "audio.stopped",

  CAPTURE_STARTED: "capture.started",
  CAPTURE_STOPPED: "capture.stopped",

  VISION_ANALYSIS_COMPLETED: "vision.analysis.completed",
} as const);

export type IPCEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];
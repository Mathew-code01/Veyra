// ============================================================================
// FILE: core/reliability/SessionRecoveryManager.ts
// PURPOSE:
// Session recovery manager for Phase 19.
//
// Manages session state persistence and recovery across application restarts,
// process crashes, and unexpected interruptions.
// ============================================================================

import type { SessionRepository } from "../../../database/repositories/sessionRepository";
import type { UnifiedInterviewRuntime } from "../../interview/runtime/UnifiedInterviewRuntime";

export interface SessionRecoveryManagerOptions {
  readonly sessionRepository: SessionRepository;
  readonly runtime: UnifiedInterviewRuntime;
}

export class SessionRecoveryManager {
  private readonly sessionRepository: SessionRepository;
  private readonly runtime: UnifiedInterviewRuntime;

  public constructor(options: SessionRecoveryManagerOptions) {
    this.sessionRepository = options.sessionRepository;
    this.runtime = options.runtime;
  }

  /**
   * Recover all active sessions from persistence on application startup.
   * Returns the list of recovered session IDs.
   */
  public async recoverSessions(): Promise<string[]> {
    const sessions = await this.sessionRepository.listActiveSessions();
    const recovered: string[] = [];

    for (const session of sessions) {
      try {
        await this.runtime.getState(session.id);
        recovered.push(session.id);
      } catch {
        // Session may have been corrupted or deleted - skip it
      }
    }

    return recovered;
  }

  /**
   * Persist current runtime state to persistence layer.
   */
  public async persistState(sessionId: string): Promise<void> {
    const state = await this.runtime.getState(sessionId);
    if (!state) {
      return;
    }

    await this.sessionRepository.updateSettings(sessionId, {
      ...(this.sessionRepository.getById(sessionId)?.settings ?? {}),
      runtimeState: Object.freeze({
        status: state.status,
        mode: state.mode,
        lastQuestionId: state.lastQuestionId,
        lastUpdated: new Date().toISOString(),
      }),
    });
  }

  /**
   * Check if a session is recoverable from persistence.
   */
  public async isRecoverable(sessionId: string): Promise<boolean> {
    const session = await this.sessionRepository.getById(sessionId);
    if (!session) {
      return false;
    }

    const state = await this.runtime.getState(sessionId);
    return session != null && state != null;
  }

  /**
   * Get all sessions that need recovery (active but not completed).
   */
  public async getSessionsNeedingRecovery(): Promise<string[]> {
    const sessions = await this.sessionRepository.listActiveSessions();
    return sessions.map((s) => s.id);
  }
}

// core/conversation/services/ConversationService.ts

import type {
  ConversationAnalysisResponse,
  ConversationServiceContract,
  ConversationStateRequest,
  ConversationStateResponse,
  ConversationAnalysisRequest,
} from "../../../shared/contracts/conversation.contract";

import { ConversationManager } from "./ConversationManager";

export interface ConversationServiceOptions {
  readonly manager?: ConversationManager;
}

/**
 * Application-facing conversation service.
 *
 * ConversationManager remains synchronous internally.
 * This class exposes the asynchronous shared contract expected
 * by desktop/client/server orchestration.
 */
export class ConversationService implements ConversationServiceContract {
  private readonly manager: ConversationManager;

  constructor(options: ConversationServiceOptions = {}) {
    this.manager = options.manager ?? new ConversationManager();
  }

  async analyze(
    request: ConversationAnalysisRequest,
  ): Promise<ConversationAnalysisResponse> {
    const analysis = this.manager.process(request.segment, request.signal);

    return {
      analysis,
    };
  }

  async getState(
    request: ConversationStateRequest,
  ): Promise<ConversationStateResponse> {
    return {
      state: this.manager.snapshot(request.sessionId),
    };
  }

  async clear(request: ConversationStateRequest): Promise<void> {
    this.manager.clear(request.sessionId);
  }

  getManager(): ConversationManager {
    return this.manager;
  }
}
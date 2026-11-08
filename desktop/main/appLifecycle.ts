// desktop/main/appLifecycle.ts

import { app, ipcMain, dialog } from "electron";
import { join } from "node:path";

import { AIManager } from "../../core/ai/AIManager";

import { AnalyticsManager } from "../../core/analytics";

import { createDefaultCloudProviderRegistry } from "../../core/cloud/registry/defaultCloudProviders";

import { InterviewIntelligence } from "../../core/interview/services/InterviewIntelligence";

import { PromptService } from "../../core/prompts/services/PromptService";

import { ReliabilityManager } from "../../core/reliability";

import { ModelSystem } from "./ModelSystem";

import { HardwareService } from "../services/ai/HardwareService";

import { registerHardwareIpc } from "../ipc/hardware.ipc";
import { registerAiIpc } from "../ipc/ai.ipc";
import { registerInterviewIpc } from "../ipc/interview.ipc";
import { closeDatabase, createDatabase } from "../../database/client";

import {
  InMemoryCandidateProfileStore,
} from "../../core/candidate/stores/CandidateProfileStore";

import {
  InMemoryExperienceStore,
} from "../../core/candidate/stores/ExperienceStore";

import {
  InMemoryProjectStore,
} from "../../core/candidate/stores/ProjectStore";

import {
  InMemorySkillStore,
} from "../../core/candidate/stores/SkillStore";

import {
  InMemoryStoryStore,
} from "../../core/candidate/stores/StoryStore";

import { CandidateContextBuilder } from "../../core/candidate/services/CandidateContextBuilder";

import { CandidateService } from "../../core/candidate/services/CandidateService";

import { createContextEngine } from "../../core/context/createContextEngine";

import type { ContextManager } from "../../core/context/ContextManager";

import { DocumentService } from "../../core/documents/DocumentService";

import { AIManagerDocumentAnalyzer } from "../../core/documents/analysis/AIManagerDocumentAnalyzer";

import { ContextDocumentIndexer } from "../../core/documents/ContextDocumentIndexer";

import { InMemoryDocumentStore } from "../../core/documents/storage/InMemoryDocumentStore";

import { DocumentValidator } from "../../core/documents/validation/DocumentValidator";

import { DocumentClassifier } from "../../core/documents/classification/DocumentClassifier";

import { DocumentNormalizer } from "../../core/documents/normalization/DocumentNormalizer";

import { DocumentChunker } from "../../core/documents/chunking/DocumentChunker";

import { DocumentIndexer } from "../../core/documents/indexing/DocumentIndexer";

import { DefaultDocumentParserRegistry } from "../../core/documents/DocumentService";

import { TextParser } from "../../core/documents/parsers/TextParser";

import { HTMLParser } from "../../core/documents/parsers/HTMLParser";

import { MarkdownParser } from "../../core/documents/parsers/MarkdownParser";

import { InMemoryCandidateEvidenceStore } from "../../core/candidate/contracts/CandidateEvidenceStore";

import { CandidateDocumentEvidenceAdapter } from "../../core/candidate/services/CandidateDocumentEvidenceAdapter";

import type { DocumentAIAnalyzerOptions } from "../../core/documents/analysis/DocumentAIAnalyzer";

import type { DocumentStore } from "../../core/documents/storage/DocumentStore";

import { registerDocumentIpc } from "../ipc/document.ipc";

let initialized = false;

let databaseHandle: ReturnType<typeof createDatabase> | null = null;

let analyticsManager: AnalyticsManager | null = null;

let modelSystem: ModelSystem | null = null;

let hardwareService: HardwareService | null = null;

let aiManager: AIManager | null = null;

let interviewIntelligence: InterviewIntelligence | null = null;

let candidateService: CandidateService | null = null;

let contextManager: ContextManager | null = null;

let documentService: DocumentService | null = null;

let cleanupHardwareIpc: (() => void) | null = null;

let cleanupAiIpc: (() => void) | null = null;

let cleanupInterviewIpc: (() => void) | null = null;

let cleanupDocumentIpc: (() => void) | null = null;

export async function initializeApplication(): Promise<void> {
  if (initialized) {
    return;
  }

  configureApplication();

  await initializeApplicationServices();

  initialized = true;
}

export async function shutdownApplication(): Promise<void> {
  if (!initialized) {
    return;
  }

  try {
    await shutdownApplicationServices();
  } catch (error) {
    console.error("[Veyra] Application shutdown encountered an error.", error);
  } finally {
    initialized = false;
  }
}

export function getModelSystem(): ModelSystem {
  if (!modelSystem) {
    throw new Error("Veyra ModelSystem has not been initialized.");
  }

  return modelSystem;
}

export function getHardwareService(): HardwareService {
  if (!hardwareService) {
    throw new Error("Veyra HardwareService has not been initialized.");
  }

  return hardwareService;
}

export function getAIManager(): AIManager {
  if (!aiManager) {
    throw new Error("Veyra AIManager has not been initialized.");
  }

  return aiManager;
}

export function getInterviewIntelligence(): InterviewIntelligence {
  if (!interviewIntelligence) {
    throw new Error("Veyra InterviewIntelligence has not been initialized.");
  }

  return interviewIntelligence;
}

export function getCandidateService(): CandidateService {
  if (!candidateService) {
    throw new Error("Veyra CandidateService has not been initialized.");
  }

  return candidateService;
}

export function getContextManager(): ContextManager {
  if (!contextManager) {
    throw new Error("Veyra ContextManager has not been initialized.");
  }

  return contextManager;
}

export function getDocumentService(): DocumentService {
  if (!documentService) {
    throw new Error("Veyra DocumentService has not been initialized.");
  }

  return documentService;
}

export function getAnalyticsManager(): AnalyticsManager {
  if (!analyticsManager) {
    throw new Error("Veyra AnalyticsManager has not been initialized.");
  }

  return analyticsManager;
}

function configureApplication(): void {
  app.setName("Veyra");

  if (process.platform === "win32") {
    app.setAppUserModelId("com.veyra.desktop");
  }
}

async function initializeApplicationServices(): Promise<void> {
  const databasePath = join(app.getPath("userData"), "veyra.db");

  databaseHandle = createDatabase({
    filename: databasePath,
  });

  analyticsManager = new AnalyticsManager({ maxEvents: 500 });
  analyticsManager.record({
    type: "app_start",
    category: "application",
    severity: "info",
    success: true,
    metadata: {
      databasePath,
      environment: process.env.NODE_ENV ?? "production",
    },
  });

  /*
   * --------------------------------------------------------------------------
   * 1. Create the single application ModelSystem.
   * --------------------------------------------------------------------------
   */
  const system = new ModelSystem({
    applicationDataDirectory: app.getPath("userData"),
  });

  /*
   * --------------------------------------------------------------------------
   * 2. Initialize model infrastructure.
   * --------------------------------------------------------------------------
   *
   * This does NOT download a model.
   *
   * It only initializes storage, queue state,
   * recovery and already-installed verified models.
   */
  await system.initialize();

  modelSystem = system;

  /*
   * --------------------------------------------------------------------------
   * 3. Create a shared reliability manager for AI and interview operations.
   * --------------------------------------------------------------------------
   */
  const reliabilityManager = new ReliabilityManager();

  /*
   * --------------------------------------------------------------------------
   * 4. Create the AI runtime composition root.
   * --------------------------------------------------------------------------
   */
  const runtimeAIManager = new AIManager({
    manager: reliabilityManager,
    timeoutMs: 30_000,
    recover: true,
  });

  runtimeAIManager.registerLocalModelProvider(system.getModelManager(), {
    name: "local",
    autoInstall: false,
  });

  const cloudRegistry = createDefaultCloudProviderRegistry({
    allowUnconfigured: false,
  });

  for (const provider of cloudRegistry.list()) {
    runtimeAIManager.registerCloudAIProviderFromRegistry(cloudRegistry, {
      providerId: provider.id,
      name: provider.name,
      replaceExisting: true,
    });
  }

  aiManager = runtimeAIManager;

  cleanupAiIpc = registerAiIpc({
    aiManager: runtimeAIManager,
    ipcMain,
  });

  const promptService = new PromptService();

  /*
   * --------------------------------------------------------------------------
   * 4b. Candidate service (in-memory stores until SQLite repositories are
   * wired in P1).
   *
   * Candidate data is isolated within this process and never leaks between
   * candidate profiles because every store operation is keyed by candidateId.
   * --------------------------------------------------------------------------
   */
  const profileStore = new InMemoryCandidateProfileStore();

  const experienceStore = new InMemoryExperienceStore();

  const projectStore = new InMemoryProjectStore();

  const skillStore = new InMemorySkillStore();

  const storyStore = new InMemoryStoryStore();

  const contextBuilder = new CandidateContextBuilder({
    profileStore,
    experienceStore,
    projectStore,
    skillStore,
    storyStore,
  });

  candidateService = new CandidateService({
    profileStore,
    contextBuilder,
  });

  /*
   * --------------------------------------------------------------------------
   * 4c. Generic context engine.
   *
   * Uses MockEmbeddingService + InMemoryVectorStore by default (P2 replaces
   * this with a persistent production embedding/vector store without changing
   * the ContextManager contract).
   * --------------------------------------------------------------------------
   */
  const contextEngine = createContextEngine();

  contextManager = contextEngine.manager;

  /*
   * --------------------------------------------------------------------------
   * 5. Create InterviewIntelligence with candidate + context enrichment.
   * --------------------------------------------------------------------------
   */
  interviewIntelligence = new InterviewIntelligence({
    promptService,
    reliabilityManager,
    candidateService,
    contextManager,
  });

  cleanupInterviewIpc = registerInterviewIpc({
    interviewIntelligence,
    aiManager: runtimeAIManager,
    ipcMain,
  });

  /*
   * --------------------------------------------------------------------------
   * 5b. Document service.
   *
   * The deterministic document pipeline is wired with:
   *
   *   - In-memory document store (P1 stage; SQLite replaces this later)
   *   - All registered parsers (PDF, DOCX, TXT, HTML, Markdown)
   *   - ContextDocumentIndexer as the context sink
   *   - AIManagerDocumentAnalyzer as the AI analysis boundary
   *   - CandidateDocumentEvidenceAdapter as the candidate evidence port
   *
   * AI analysis is best-effort (required: false) so document ingestion
   * succeeds even when no suitable AI model is available.
   * --------------------------------------------------------------------------
   */
  const parserRegistry = new DefaultDocumentParserRegistry([
    new TextParser(),
    new HTMLParser(),
    new MarkdownParser(),
  ]);

  const documentStore: DocumentStore = new InMemoryDocumentStore();

  const evidenceStore = new InMemoryCandidateEvidenceStore();

  const evidenceAdapter = new CandidateDocumentEvidenceAdapter({
    evidenceStore,
  });

  const documentAiAnalyzer = new AIManagerDocumentAnalyzer(runtimeAIManager);

  const documentAiOptions: DocumentAIAnalyzerOptions = {
    providerName: "local",

    model: undefined,

    batchMaxCharacters: 40_000,

    maxTokens: 4_000,
  };

  const contextIndexer = new ContextDocumentIndexer(contextManager);

  documentService = new DocumentService({
    parserRegistry,

    documentStore,

    contextSink: contextIndexer,

    aiAnalysis: {
      analyzer: documentAiAnalyzer,

      options: documentAiOptions,

      required: false,
    },

    candidateEvidence: {
      port: evidenceAdapter,

      required: false,
    },
  });

  /*
   * --------------------------------------------------------------------------
   * 6. Register document IPC.
   * --------------------------------------------------------------------------
   */
  cleanupDocumentIpc = registerDocumentIpc({
    documentService,
    ipcMain,
    dialog,
  });

  /*
   * --------------------------------------------------------------------------
   * 5. Create HardwareService using the SAME ModelManager.
   * --------------------------------------------------------------------------
   */
  const hardware = new HardwareService({
    modelManager: system.getModelManager(),
  });

  hardwareService = hardware;

  /*
   * --------------------------------------------------------------------------
   * 6. Register hardware IPC.
   * --------------------------------------------------------------------------
   */
  cleanupHardwareIpc = registerHardwareIpc({
    service: hardware,
  });
}

async function shutdownApplicationServices(): Promise<void> {
  if (analyticsManager) {
    analyticsManager.record({
      type: "app_shutdown",
      category: "application",
      severity: "info",
      success: true,
    });
  }

  /*
   * --------------------------------------------------------------------------
   * 1. Remove IPC handlers.
   * --------------------------------------------------------------------------
   */
  if (cleanupHardwareIpc) {
    cleanupHardwareIpc();

    cleanupHardwareIpc = null;
  }

  if (cleanupAiIpc) {
    cleanupAiIpc();

    cleanupAiIpc = null;
  }

  if (cleanupInterviewIpc) {
    cleanupInterviewIpc();

    cleanupInterviewIpc = null;
  }

  if (cleanupDocumentIpc) {
    cleanupDocumentIpc();

    cleanupDocumentIpc = null;
  }

  /*
   * --------------------------------------------------------------------------
   * 2. Dispose the model system.
   * --------------------------------------------------------------------------
   */
  if (modelSystem) {
    try {
      await modelSystem.dispose();
    } finally {
      modelSystem = null;
    }
  }

  if (databaseHandle) {
    closeDatabase();
    databaseHandle = null;
  }

  aiManager = null;
  interviewIntelligence = null;
  candidateService = null;
  contextManager = null;
  documentService = null;
  hardwareService = null;
  analyticsManager = null;
}

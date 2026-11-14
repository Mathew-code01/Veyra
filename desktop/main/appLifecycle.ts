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

import { activeProfileService } from "./activeProfile";
import { initializeActiveProfile } from "./activeProfile";

import { registerHardwareIpc } from "../ipc/hardware.ipc";
import { registerAiIpc } from "../ipc/ai.ipc";
import { registerInterviewIpc } from "../ipc/interview.ipc";
import { registerProvidersIpc } from "../ipc/providers.ipc";
import {
  cleanupOverlayIpc,
  registerOverlayIpc,
} from "../main/windowManager";
import { closeDatabase, createDatabase, getDatabase } from "../../database/client";

import { CandidateContextBuilder } from "../../core/candidate/services/CandidateContextBuilder";

import { CandidateService } from "../../core/candidate/services/CandidateService";

import { createContextEngine } from "../../core/context/createContextEngine";

import type { ContextManager } from "../../core/context/ContextManager";

import { DocumentService } from "../../core/documents/DocumentService";

import { AIManagerDocumentAnalyzer } from "../../core/documents/analysis/AIManagerDocumentAnalyzer";

import { ContextDocumentIndexer } from "../../core/documents/ContextDocumentIndexer";

import { SqliteDocumentStore } from "../../core/documents/storage/SqliteDocumentStore";

import { DocumentValidator } from "../../core/documents/validation/DocumentValidator";

import { DocumentClassifier } from "../../core/documents/classification/DocumentClassifier";

import { DocumentNormalizer } from "../../core/documents/normalization/DocumentNormalizer";

import { DocumentChunker } from "../../core/documents/chunking/DocumentChunker";

import { DocumentIndexer } from "../../core/documents/indexing/DocumentIndexer";

import { DefaultDocumentParserRegistry } from "../../core/documents/DocumentService";

import { TextParser } from "../../core/documents/parsers/TextParser";

import { HTMLParser } from "../../core/documents/parsers/HTMLParser";

import { MarkdownParser } from "../../core/documents/parsers/MarkdownParser";

import { CandidateDocumentEvidenceAdapter } from "../../core/candidate/services/CandidateDocumentEvidenceAdapter";

import type { DocumentAIAnalyzerOptions } from "../../core/documents/analysis/DocumentAIAnalyzer";

import type { DocumentStore } from "../../core/documents/storage/DocumentStore";

import { MemoryRepository } from "../../database/repositories/memoryRepository";

import { CandidateEvidenceRepository } from "../../database/repositories/candidateEvidenceRepository";

import { ProviderCredentialRepository } from "../../database/repositories/providerCredentialRepository";

import { ProviderSettingsRepository } from "../../database/repositories/providerSettingsRepository";
import { ProfileRepository } from "../../database/repositories/profileRepository";
import { CandidateRepository } from "../../database/repositories/candidateRepository";

import { SecureCredentialStore } from "../../core/security/SecureCredentialStore";

import { ElectronCredentialVault } from "../security/electronCredentialVault";

import { SecureCloudCredentialResolver } from "../../core/cloud/configuration/SecureCloudCredentialResolver";

import { CloudExecutionPolicy } from "../../core/cloud/CloudExecutionPolicy";

import { CloudGateway } from "../../core/cloud/CloudGateway";

import { registerDocumentIpc } from "../ipc/document.ipc";

import { registerMemoryIpc } from "../ipc/memory.ipc";

import { registerCandidateIpc } from "../ipc/candidate.ipc";
import { registerWorkspaceProfileIpc } from "../ipc/workspace-profile.ipc";

import { registerPracticeIpc } from "../ipc/practice.ipc";
import { registerInterviewRuntimeIpc } from "../ipc/interview-runtime.ipc";
import { registerAudioRuntimeIpc } from "../ipc/audio-runtime.ipc";

import { registerAudioIpc } from "../ipc/audio.ipc";

import { registerCaptureIpc } from "../ipc/capture.ipc";

import { registerVisionIpc } from "../ipc/vision.ipc";

import {
  PDFParser,
  DOCXParser,
  SafePDFProvider,
  SafeDOCXProvider,
} from "../../core/documents";

import { SessionRepository } from "../../database/repositories/sessionRepository";
import { QuestionRepository } from "../../database/repositories/questionRepository";
import { AnswerRepository } from "../../database/repositories/answerRepository";
import { PracticeSessionEngine } from "../../core/interview/practice/PracticeSessionEngine";
import { UnifiedInterviewRuntime } from "../../core/interview/runtime/UnifiedInterviewRuntime";

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

let memoryRepository: MemoryRepository | null = null;

let cleanupHardwareIpc: (() => void) | null = null;

let cleanupAiIpc: (() => void) | null = null;

let cleanupInterviewIpc: (() => void) | null = null;

let cleanupDocumentIpc: (() => void) | null = null;

let cleanupMemoryIpc: (() => void) | null = null;

let cleanupCandidateIpc: (() => void) | null = null;

let cleanupWorkspaceProfileIpc: (() => void) | null = null;

let cleanupPracticeIpc: (() => void) | null = null;
let cleanupInterviewRuntimeIpc: (() => void) | null = null;

let cleanupAudioIpc: (() => void) | null = null;

let cleanupCaptureIpc: (() => void) | null = null;

let cleanupVisionIpc: (() => void) | null = null;

let practiceSessionEngine: PracticeSessionEngine | null = null;
let interviewRuntime: UnifiedInterviewRuntime | null = null;
let cleanupAudioRuntimeIpc: (() => void) | null = null;

let cleanupProvidersIpc: (() => void) | null = null;

let credentialStore: SecureCredentialStore | null = null;

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

export function getMemoryRepository(): MemoryRepository {
  if (!memoryRepository) {
    throw new Error("Veyra MemoryRepository has not been initialized.");
  }

  return memoryRepository;
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
    migrationsFolder: join(__dirname, "../../database/migrations"),
  });

  const profileRepository = new ProfileRepository();
  let localProfiles = profileRepository.list();
  if (localProfiles.length === 0) {
    profileRepository.create({ displayName: "Local profile" });
    localProfiles = profileRepository.list();
  }
  initializeActiveProfile(activeProfileService, localProfiles);

  /*
   * Secure BYOK credential store.
   *
   * Credentials are encrypted with OS-backed secure storage (Electron
   * safeStorage) and only ciphertext is persisted in SQLite. The vault is
   * created here so the secure credential resolver and provider settings
   * IPC can resolve and store BYOK keys without exposing raw secrets.
   */
  const vault = new ElectronCredentialVault();

  credentialStore = new SecureCredentialStore({
    vault,

    repository: new ProviderCredentialRepository(),
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

  /*
   * Secure cloud credential resolver.
   *
   * OS-backed secure storage (BYOK) is checked first for the active profile,
   * then environment variables. This lets users store keys via the settings UI
   * while preserving existing environment-variable-based configuration.
   */
  const secureCredentialResolver = new SecureCloudCredentialResolver({
    credentialStore: credentialStore!,

    getActiveProfileId: () => activeProfileService.getActiveProfile(),
  });

  const cloudRegistry = createDefaultCloudProviderRegistry({
    allowUnconfigured: true,

    credentialResolver: secureCredentialResolver,
  });

  /*
   * Central cloud execution policy.
   *
   * Cloud requests are denied by default: external processing requires
   * explicit consent (externalProcessingAllowed) and every model must be
   * explicitly classified as authorized. UNKNOWN / PAID / DISABLED models
   * are denied by CloudExecutionPolicy on every generation and streaming
   * path, so no provider can silently spend quota or money.
   */
  const cloudExecutionPolicy = new CloudExecutionPolicy({
    externalProcessingAllowed: false,

    models: {},

    quotaLedger: undefined,
  });

  const cloudGateway = new CloudGateway(
    cloudRegistry,

    reliabilityManager,

    cloudExecutionPolicy,
  );

  for (const provider of cloudRegistry.list()) {
    runtimeAIManager.registerCloudAIProviderFromGateway(cloudGateway, {
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
   * 4b. Candidate service.
   *
   * Structured candidate records and imported document evidence are stored
   * in SQLite and scoped to the active profile.
   * --------------------------------------------------------------------------
   */
  const candidateRepository = new CandidateRepository(() =>
    activeProfileService.getActiveProfile(),
  );
  const profileStore = candidateRepository.profileStore;
  const experienceStore = candidateRepository.experienceStore;
  const projectStore = candidateRepository.projectStore;
  const skillStore = candidateRepository.skillStore;
  const storyStore = candidateRepository.storyStore;

  const evidenceStore = new CandidateEvidenceRepository(() =>
    activeProfileService.getActiveProfile(),
  );

  const contextBuilder = new CandidateContextBuilder({
    profileStore,
    experienceStore,
    projectStore,
    skillStore,
    storyStore,
    evidenceStore,
  });

  candidateService = new CandidateService({
    profileStore,
    contextBuilder,
  });

  /*
   * --------------------------------------------------------------------------
   * 4c. Generic context engine.
   *
   * Uses OnnxEmbeddingService when VEYRA_EMBEDDING_MODEL_PATH and a compatible
   * tokenizer are available; otherwise indexes text for keyword retrieval
   * without creating synthetic vectors. Context records persist in SQLite.
   * --------------------------------------------------------------------------
   */
  const contextEngine = createContextEngine();

  contextManager = contextEngine.manager;

  memoryRepository = new MemoryRepository();
  memoryRepository.expireOlderThan(new Date().toISOString());

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
    resolveProfileId: () => activeProfileService.getActiveProfile(),
    retrieveCandidateContext: async (candidateId, signal) => {
      if (!candidateService) {
        throw new Error("Candidate service is not initialized.");
      }
      const context = await candidateService.getContext({ candidateId, signal });
      return {
        text: context.text,
        evidenceIds: context.evidence.map((item) => item.id),
      };
    },
    retrieveMemory: async (profileId, candidateId, query, signal) => {
      if (!memoryRepository) {
        throw new Error("Memory repository is not initialized.");
      }

      const categories = candidateId
        ? (["candidate", "session", "knowledge"] as const)
        : ([] as const);
      const candidateMemories = categories.flatMap((category) =>
        memoryRepository!.search(profileId, {
          query,
          category,
          candidateId,
          minConfidence: 40,
          limit: 6,
          signal,
        }),
      );
      const preferences = memoryRepository.search(profileId, {
        query,
        category: "preference",
        candidateId: null,
        minConfidence: 40,
        limit: 4,
        signal,
      });

      return [...candidateMemories, ...preferences]
        .filter((record) => record.content.text?.trim())
        .slice(0, 10)
        .map((record) => ({
          id: record.id,
          text: record.content.text!,
          verificationStatus: record.verificationStatus,
          sourceId: record.sourceId,
        }));
    },
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
   *   - Profile-scoped SQLite document storage
   *   - Production parsers for TXT, HTML, and Markdown
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
    new PDFParser(new SafePDFProvider()),
    new DOCXParser(new SafeDOCXProvider()),
  ]);

  const documentStore: DocumentStore = new SqliteDocumentStore({
    resolveProfileId: () => activeProfileService.getActiveProfile(),
  });

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
    resolveProfileId: () => activeProfileService.getActiveProfile(),

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
   * 5d. Memory repository + IPC.
   *
   * MemoryRepository is backed by SQLite (survives restart) and scopes every
   * record to profile_id for profile isolation.
   * --------------------------------------------------------------------------
   */
  cleanupMemoryIpc = registerMemoryIpc({
    memoryRepository,
    ipcMain,
    activeProfileResolver: activeProfileService,
  });

  cleanupCandidateIpc = registerCandidateIpc({
    repository: candidateRepository,
    ipcMain,
    activeProfileResolver: activeProfileService,
  });

  cleanupWorkspaceProfileIpc = registerWorkspaceProfileIpc({
    repository: profileRepository,
    activeProfileService,
    ipcMain,
  });

  /*
   * --------------------------------------------------------------------------
   * Practice session engine + IPC.
   *
   * PracticeSessionEngine orchestrates mock interview sessions end-to-end:
   * question generation, answer evaluation, follow-up logic and report
   * generation.  It owns SessionRepository, QuestionRepository and
   * AnswerRepository directly (all SQLite-backed, no extra dependencies).
   * --------------------------------------------------------------------------
   */
  const sessionRepo = new SessionRepository();
  const questionRepo = new QuestionRepository();
  const answerRepo = new AnswerRepository();

  practiceSessionEngine = new PracticeSessionEngine(
    sessionRepo,
    questionRepo,
    answerRepo,
  );

  cleanupPracticeIpc = registerPracticeIpc({
    practiceEngine: practiceSessionEngine,
    getActiveProfileId: () => activeProfileService.getActiveProfile(),
    ipcMain,
  });
  interviewRuntime = new UnifiedInterviewRuntime({
    interviewIntelligence,
    sessionRepository: sessionRepo,
    questionRepository: questionRepo,
    answerRepository: answerRepo,
    memoryRepository,
    contextManager,
    aiManager: runtimeAIManager,
    resolveProfileId: () => activeProfileService.getActiveProfile(),
    retrieveCandidateContext: async (_profileId, candidateId, _query, signal) => {
      if (!candidateService || !candidateId) return [];
      try {
        const context = await candidateService.getContext({ candidateId, signal });
        return (context.evidence ?? []).slice(0, 8).map((item: any) => ({
          id: String(item.id ?? item.sourceId ?? "candidate-evidence"),
          source: "candidate" as const,
          text: String(item.text ?? item.summary ?? item.value ?? item.content ?? "").slice(0, 1200),
          verified: item.verified === true,
        })).filter((e: any) => e.text.trim().length > 0);
      } catch {
        return [];
      }
    },
  });

  cleanupInterviewRuntimeIpc = registerInterviewRuntimeIpc({
    runtime: interviewRuntime,
    getActiveProfileId: () => activeProfileService.getActiveProfile(),
    ipcMain,
  });

  /*
   * --------------------------------------------------------------------------
   * Audio-to-runtime IPC.
   *
   * Connects live audio capture/transcription to the unified interview
   * runtime for live interview assistance. No raw audio crosses IPC.
   * --------------------------------------------------------------------------
   */
  cleanupAudioRuntimeIpc = registerAudioRuntimeIpc({
    runtime: interviewRuntime,
    getActiveProfileId: () => activeProfileService.getActiveProfile(),
    ipcMain,
  });

  /*
   * --------------------------------------------------------------------------
   * Audio IPC.
   *
   * Exposes audio capture session management, permission checks, device
   * listing, and transcript state. No raw audio buffers cross IPC.
   * --------------------------------------------------------------------------
   */
  cleanupAudioIpc = registerAudioIpc({
    ipcMain,
  });

  /*
   * --------------------------------------------------------------------------
   * Capture IPC (screen/window source discovery and session control).
   * Raw frames are not exposed to renderer; capture is user-initiated.
   * --------------------------------------------------------------------------
   */
  cleanupCaptureIpc = registerCaptureIpc({
    ipcMain,
  });

  /*
   * --------------------------------------------------------------------------
   * Vision IPC.
   * Vision pipeline is not constructed by default (no authorized provider/OCR
   * configured). Handler returns unavailable until a safe pipeline is wired.
   * --------------------------------------------------------------------------
   */
  cleanupVisionIpc = registerVisionIpc({
    ipcMain,
  });

  /*
   * --------------------------------------------------------------------------
   * Provider settings (BYOK) IPC.
   *
   * Exposes secure credential save/delete/verify, model discovery, preferred
   * model selection and execution mode. No raw secret ever crosses IPC.
   * --------------------------------------------------------------------------
   */
  cleanupProvidersIpc = registerProvidersIpc({
    credentialStore: credentialStore!,

    settingsRepository: new ProviderSettingsRepository(),

    cloudRegistry,

    cloudExecutionPolicy,

    aiManager: runtimeAIManager,

    activeProfileResolver: activeProfileService,

    ipcMain,
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

  registerOverlayIpc(ipcMain);
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

  if (cleanupMemoryIpc) {
    cleanupMemoryIpc();

    cleanupMemoryIpc = null;
  }

  if (cleanupCandidateIpc) {
    cleanupCandidateIpc();

    cleanupCandidateIpc = null;
  }

  if (cleanupWorkspaceProfileIpc) {
    cleanupWorkspaceProfileIpc();
    cleanupWorkspaceProfileIpc = null;
  }

  if (cleanupPracticeIpc) {
    cleanupPracticeIpc();

    cleanupPracticeIpc = null;
  }
  if (cleanupInterviewRuntimeIpc) {
    cleanupInterviewRuntimeIpc();
    cleanupInterviewRuntimeIpc = null;
  }
  if (cleanupAudioRuntimeIpc) {
    cleanupAudioRuntimeIpc();
    cleanupAudioRuntimeIpc = null;
  }

  if (cleanupAudioIpc) {
    cleanupAudioIpc();

    cleanupAudioIpc = null;
  }

  if (cleanupCaptureIpc) {
    cleanupCaptureIpc();

    cleanupCaptureIpc = null;
  }

  if (cleanupVisionIpc) {
    cleanupVisionIpc();

    cleanupVisionIpc = null;
  }

  if (cleanupProvidersIpc) {
    cleanupProvidersIpc();

    cleanupProvidersIpc = null;
  }

  cleanupOverlayIpc();

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
  memoryRepository = null;
  hardwareService = null;
  analyticsManager = null;
  credentialStore = null;
  interviewRuntime = null;
}

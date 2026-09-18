
// ============================================================================
// FILE: core/cloud/registry/defaultCloudProviders.ts
//
// PURPOSE:
// Creates and registers Veyra's built-in cloud providers.
//
// PROVIDERS:
// - Gemini
// - Groq
// - Cerebras
// - Mistral
// - OpenRouter
// - Hugging Face
//
// IMPORTANT:
// This file creates provider instances only.
// Routing/execution remains inside the provider/gateway architecture.
//
// SECURITY:
// API keys are never stored directly in CloudProviderConfig.
// Only credential references are stored.
// ============================================================================

import type { CloudProvider } from "../CloudProvider";

import { CloudProviderRegistry } from "../CloudProviderRegistry";

import type { CloudProviderConfig } from "../CloudProviderConfig";

import type {
  CloudCredential,
  CloudCredentialResolver,
} from "../CloudCredential";

import type { CloudProviderDependencies } from "../CloudProviderSupport";

import { GeminiProvider } from "../providers/Gemini/GeminiProvider";
import { GroqProvider } from "../providers/Groq/GroqProvider";
import { CerebrasProvider } from "../providers/Cerebras/CerebrasProvider";
import { MistralProvider } from "../providers/Mistral/MistralProvider";
import { OpenRouterProvider } from "../providers/OpenRouter/OpenRouterProvider";
import { HuggingFaceProvider } from "../providers/HuggingFace/HuggingFaceProvider";

// ============================================================================
// TYPES
// ============================================================================

export interface DefaultCloudProviderOptions {
  readonly allowUnconfigured?: boolean;

  readonly timeoutMs?: number;

  readonly maxRetries?: number;

  readonly applicationName?: string;

  readonly applicationUrl?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_TIMEOUT_MS = 30_000;

const DEFAULT_MAX_RETRIES = 2;

// ============================================================================
// ENVIRONMENT HELPERS
// ============================================================================

function hasEnvironmentVariable(name: string): boolean {
  const value = process.env[name];

  return typeof value === "string" && value.trim().length > 0;
}

// ============================================================================
// CREDENTIAL RESOLVER
// ============================================================================

const environmentCredentialResolver: CloudCredentialResolver = {
  async resolve(credential: CloudCredential): Promise<string | undefined> {
    if (!credential.enabled) {
      return undefined;
    }

    const reference = credential.reference.trim();

    if (!reference) {
      return undefined;
    }

    switch (credential.source) {
      case "environment":
      case "process": {
        const value = process.env[reference];

        if (typeof value !== "string") {
          return undefined;
        }

        const normalized = value.trim();

        return normalized.length > 0 ? normalized : undefined;
      }

      case "runtime":
      case "secret_manager":
      case "os_keychain":
      case "custom":
      default:
        return undefined;
    }
  },
};

// ============================================================================
// DEPENDENCIES
// ============================================================================

function createDefaultProviderDependencies(): CloudProviderDependencies {
  return {
    credentialResolver: environmentCredentialResolver,
  };
}

// ============================================================================
// CREDENTIAL FACTORY
// ============================================================================

function createEnvironmentCredential(
  providerId: string,
  reference: string,
): CloudCredential {
  return {
    id: `${providerId}-environment`,

    providerId,

    kind: "api_key",

    source: "environment",

    reference,

    enabled: true,
  };
}

// ============================================================================
// CONFIG FACTORY
// ============================================================================

function createProviderConfig(options: {
  id: string;

  name: string;

  baseUrl: string;

  credentialReference: string;

  timeoutMs: number;

  maxRetries: number;

  defaultModels?: Readonly<
    Partial<
      Record<
        | "text_generation"
        | "vision"
        | "speech_to_text"
        | "text_to_speech"
        | "embedding"
        | "document_analysis",
        string
      >
    >
  >;

  metadata?: Readonly<Record<string, unknown>>;
}): CloudProviderConfig {
  return {
    id: options.id,

    name: options.name,

    baseUrl: options.baseUrl,

    enabled: true,

    timeoutMs: options.timeoutMs,

    maxRetries: options.maxRetries,

    credential: createEnvironmentCredential(
      options.id,
      options.credentialReference,
    ),

    ...(options.defaultModels
      ? {
          defaultModels: options.defaultModels,
        }
      : {}),

    ...(options.metadata
      ? {
          metadata: options.metadata,
        }
      : {}),
  };
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

export function createDefaultCloudProviders(
  options: DefaultCloudProviderOptions = {},
): readonly CloudProvider[] {
  const allowUnconfigured = options.allowUnconfigured ?? true;

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  const dependencies = createDefaultProviderDependencies();

  const providers: CloudProvider[] = [];

  // ==========================================================================
  // GEMINI
  // ==========================================================================
  //
  // DEFAULT:
  //   gemini-2.5-flash
  //
  // ADVANCED:
  //   gemini-3.1-pro-preview
  //
  // We intentionally keep 2.5 Flash as the default because it is the
  // stable/general-purpose Gemini model in this catalog.
  //
  // gemini-3.1-pro-preview remains explicitly selectable through model ID.
  // ==========================================================================

  if (allowUnconfigured || hasEnvironmentVariable("GEMINI_API_KEY")) {
    const config = createProviderConfig({
      id: "gemini",

      name: "Google Gemini",

      baseUrl: "https://generativelanguage.googleapis.com/v1beta",

      credentialReference: "GEMINI_API_KEY",

      timeoutMs,

      maxRetries,

      defaultModels: {
        text_generation: "gemini-2.5-flash",

        vision: "gemini-2.5-flash",

        document_analysis: "gemini-2.5-flash",
      },

      metadata: {
        advancedModel: "gemini-3.1-pro-preview",

        defaultModel: "gemini-2.5-flash",

        previewModels: ["gemini-3.1-pro-preview"],
      },
    });

    providers.push(new GeminiProvider(config, dependencies));
  }

  // ==========================================================================
  // GROQ
  // ==========================================================================

  if (allowUnconfigured || hasEnvironmentVariable("GROQ_API_KEY")) {
    const config = createProviderConfig({
      id: "groq",

      name: "Groq",

      baseUrl: "https://api.groq.com/openai/v1",

      credentialReference: "GROQ_API_KEY",

      timeoutMs,

      maxRetries,

      defaultModels: {
        text_generation: "openai/gpt-oss-120b",

        speech_to_text: "whisper-large-v3",
      },
    });

    providers.push(new GroqProvider(config, dependencies));
  }

  // ==========================================================================
  // CEREBRAS
  // ==========================================================================

  if (allowUnconfigured || hasEnvironmentVariable("CEREBRAS_API_KEY")) {
    const config = createProviderConfig({
      id: "cerebras",

      name: "Cerebras",

      baseUrl: "https://api.cerebras.ai/v1",

      credentialReference: "CEREBRAS_API_KEY",

      timeoutMs,

      maxRetries,

      defaultModels: {
        text_generation: "gpt-oss-120b",
      },
    });

    providers.push(new CerebrasProvider(config, dependencies));
  }

  // ==========================================================================
  // MISTRAL
  // ==========================================================================

  if (allowUnconfigured || hasEnvironmentVariable("MISTRAL_API_KEY")) {
    const config = createProviderConfig({
      id: "mistral",

      name: "Mistral AI",

      baseUrl: "https://api.mistral.ai/v1",

      credentialReference: "MISTRAL_API_KEY",

      timeoutMs,

      maxRetries,

      defaultModels: {
        text_generation: "mistral-large-latest",

        embedding: "mistral-embed",
      },
    });

    providers.push(new MistralProvider(config, dependencies));
  }

  // ==========================================================================
  // OPENROUTER
  // ==========================================================================

  if (allowUnconfigured || hasEnvironmentVariable("OPENROUTER_API_KEY")) {
    const config = createProviderConfig({
      id: "openrouter",

      name: "OpenRouter",

      baseUrl: "https://openrouter.ai/api/v1",

      credentialReference: "OPENROUTER_API_KEY",

      timeoutMs,

      maxRetries,

      defaultModels: {
        text_generation: "openai/gpt-oss-120b",

        vision: "google/gemini-2.5-flash",
      },

      metadata: {
        applicationName: options.applicationName ?? "Veyra",

        ...(options.applicationUrl
          ? {
              applicationUrl: options.applicationUrl,
            }
          : {}),
      },
    });

    providers.push(new OpenRouterProvider(config, dependencies));
  }

  // ==========================================================================
  // HUGGING FACE
  // ==========================================================================

  if (allowUnconfigured || hasEnvironmentVariable("HF_TOKEN")) {
    const config = createProviderConfig({
      id: "huggingface",

      name: "Hugging Face",

      baseUrl: "https://router.huggingface.co/v1",

      credentialReference: "HF_TOKEN",

      timeoutMs,

      maxRetries,

      defaultModels: {
        text_generation: "meta-llama/Llama-3.1-8B-Instruct",

        speech_to_text: "openai/whisper-large-v3",
      },
    });

    providers.push(new HuggingFaceProvider(config, dependencies));
  }

  return Object.freeze(providers);
}

// ============================================================================
// REGISTRATION
// ============================================================================

export function registerDefaultCloudProviders(
  registry: CloudProviderRegistry,
  options: DefaultCloudProviderOptions = {},
): readonly CloudProvider[] {
  const providers = createDefaultCloudProviders(options);

  for (const provider of providers) {
    if (registry.has(provider.id)) {
      registry.replace(provider);
    } else {
      registry.register(provider);
    }
  }

  return providers;
}

// ============================================================================
// DEFAULT REGISTRY BOOTSTRAP
// ============================================================================

export function createDefaultCloudProviderRegistry(
  options: DefaultCloudProviderOptions = {},
): CloudProviderRegistry {
  const registry = new CloudProviderRegistry();

  registerDefaultCloudProviders(registry, options);

  return registry;
}

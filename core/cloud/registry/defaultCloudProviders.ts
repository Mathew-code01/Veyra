
// ============================================================================
// FILE: core/cloud/registry/defaultCloudProviders.ts
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
// This file does not perform routing.
// It only creates provider instances and registers them.
//
// SECURITY:
// - API keys are NEVER stored directly in CloudProviderConfig.
// - CloudProviderConfig stores credential references only.
// - Secrets are resolved at runtime through CloudCredentialResolver.
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
  /**
   * If true, providers whose credentials are not configured may still be
   * registered.
   *
   * This is useful for Veyra because users may configure only one or two
   * providers while the remaining providers remain available for later
   * configuration.
   */
  readonly allowUnconfigured?: boolean;

  /**
   * Optional HTTP timeout passed to every cloud provider.
   */
  readonly timeoutMs?: number;

  /**
   * Maximum number of automatic transport retries.
   */
  readonly maxRetries?: number;

  /**
   * Optional application metadata used by providers such as OpenRouter.
   */
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

/**
 * Resolves credential references from the current Veyra process environment.
 *
 * IMPORTANT:
 * This resolver returns the secret only at execution time.
 *
 * CloudCredential itself contains only:
 *
 *   GEMINI_API_KEY
 *
 * and never:
 *
 *   actual-secret-value
 *
 * This keeps the cloud configuration layer free from hard-coded credentials.
 *
 * The abstraction can later be replaced by an OS keychain, encrypted
 * credential store, enterprise secret manager, or another secure backend
 * without changing the cloud providers themselves.
 */
const environmentCredentialResolver: CloudCredentialResolver = {
  async resolve(
    credential: CloudCredential,
  ): Promise<string | undefined> {
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

        return normalized.length > 0
          ? normalized
          : undefined;
      }

      /**
       * Runtime credentials are deliberately not inferred from arbitrary
       * metadata. A runtime credential should be resolved by an application
       * supplied resolver instead of this default bootstrap resolver.
       */
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

function createProviderConfig(
  options: {
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
  },
): CloudProviderConfig {
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

  const timeoutMs =
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const maxRetries =
    options.maxRetries ?? DEFAULT_MAX_RETRIES;

  const dependencies =
    createDefaultProviderDependencies();

  const providers: CloudProvider[] = [];

  // ==========================================================================
  // GEMINI
  // ==========================================================================

  if (
    allowUnconfigured ||
    hasEnvironmentVariable("GEMINI_API_KEY")
  ) {
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
    });

    providers.push(
      new GeminiProvider(
        config,
        dependencies,
      ),
    );
  }

  // ==========================================================================
  // GROQ
  // ==========================================================================

  if (
    allowUnconfigured ||
    hasEnvironmentVariable("GROQ_API_KEY")
  ) {
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

    providers.push(
      new GroqProvider(
        config,
        dependencies,
      ),
    );
  }

  // ==========================================================================
  // CEREBRAS
  // ==========================================================================

  if (
    allowUnconfigured ||
    hasEnvironmentVariable("CEREBRAS_API_KEY")
  ) {
    const config = createProviderConfig({
      id: "cerebras",
      name: "Cerebras",
      baseUrl: "https://api.cerebras.ai/v1",
      credentialReference: "CEREBRAS_API_KEY",
      timeoutMs,
      maxRetries,
      defaultModels: {
        text_generation: "llama-3.3-70b",
      },
    });

    providers.push(
      new CerebrasProvider(
        config,
        dependencies,
      ),
    );
  }

  // ==========================================================================
  // MISTRAL
  // ==========================================================================

  if (
    allowUnconfigured ||
    hasEnvironmentVariable("MISTRAL_API_KEY")
  ) {
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

    providers.push(
      new MistralProvider(
        config,
        dependencies,
      ),
    );
  }

  // ==========================================================================
  // OPENROUTER
  // ==========================================================================

  if (
    allowUnconfigured ||
    hasEnvironmentVariable("OPENROUTER_API_KEY")
  ) {
    const config = createProviderConfig({
      id: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      credentialReference: "OPENROUTER_API_KEY",
      timeoutMs,
      maxRetries,
      defaultModels: {
        text_generation: "openai/gpt-4o-mini",
        vision: "google/gemini-2.5-flash",
      },
      metadata: {
        applicationName:
          options.applicationName ?? "Veyra",
        ...(options.applicationUrl
          ? {
              applicationUrl:
                options.applicationUrl,
            }
          : {}),
      },
    });

    providers.push(
      new OpenRouterProvider(
        config,
        dependencies,
      ),
    );
  }

  // ==========================================================================
  // HUGGING FACE
  // ==========================================================================

  if (
    allowUnconfigured ||
    hasEnvironmentVariable("HF_TOKEN")
  ) {
    const config = createProviderConfig({
      id: "huggingface",
      name: "Hugging Face",
      baseUrl: "https://api-inference.huggingface.co",
      credentialReference: "HF_TOKEN",
      timeoutMs,
      maxRetries,
      defaultModels: {
        text_generation:
          "meta-llama/Llama-3.1-8B-Instruct",
        vision:
          "Qwen/Qwen2.5-VL-7B-Instruct",
      },
    });

    providers.push(
      new HuggingFaceProvider(
        config,
        dependencies,
      ),
    );
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
  const providers =
    createDefaultCloudProviders(options);

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
  const registry =
    new CloudProviderRegistry();

  registerDefaultCloudProviders(
    registry,
    options,
  );

  return registry;
}

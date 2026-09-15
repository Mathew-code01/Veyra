// ============================================================================
// FILE: core/cloud/CloudProviderRegistry.ts
// ============================================================================

import type { CloudProvider } from "./CloudProvider";

import type { CloudCapability } from "./capabilities/CloudCapability";

export class CloudProviderRegistry {
  private readonly providers = new Map<string, CloudProvider>();

  public register(provider: CloudProvider): void {
    if (!provider.id.trim()) {
      throw new Error("Cloud provider ID cannot be empty.");
    }

    if (this.providers.has(provider.id)) {
      throw new Error(`Cloud provider "${provider.id}" is already registered.`);
    }

    this.providers.set(provider.id, provider);
  }

  public replace(provider: CloudProvider): void {
    if (!provider.id.trim()) {
      throw new Error("Cloud provider ID cannot be empty.");
    }

    this.providers.set(provider.id, provider);
  }

  public unregister(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  public has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  public get(providerId: string): CloudProvider {
    const provider = this.providers.get(providerId);

    if (!provider) {
      throw new Error(`Cloud provider "${providerId}" is not registered.`);
    }

    return provider;
  }

  public tryGet(providerId: string): CloudProvider | undefined {
    return this.providers.get(providerId);
  }

  public list(): readonly CloudProvider[] {
    return Object.freeze([...this.providers.values()]);
  }

  public findByCapability(
    capability: CloudCapability,
  ): readonly CloudProvider[] {
    return Object.freeze(
      [...this.providers.values()].filter((provider) => {
        switch (capability) {
          case "text_generation":
            return provider.capabilities.textGeneration;

          case "streaming":
            return provider.capabilities.streaming;

          case "vision":
            return provider.capabilities.vision;

          case "speech_to_text":
            return provider.capabilities.speechToText;

          case "text_to_speech":
            return provider.capabilities.textToSpeech;

          case "embedding":
            return provider.capabilities.embeddings;

          case "document_analysis":
            return provider.capabilities.documentAnalysis;

          case "structured_output":
            return provider.capabilities.structuredOutput;

          case "tool_calling":
            return provider.capabilities.toolCalling;

          default:
            return false;
        }
      }),
    );
  }

  public clear(): void {
    this.providers.clear();
  }
}

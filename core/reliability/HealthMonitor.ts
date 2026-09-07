// core/reliability/HealthMonitor.ts

import type { AIProvider, AIProviderHealth } from "../ai/AIProvider";

export class HealthMonitor {
  private readonly health = new Map<string, AIProviderHealth>();

  private timer?: ReturnType<typeof setInterval>;

  async check(providers: AIProvider[]): Promise<AIProviderHealth[]> {
    const results = await Promise.all(
      providers.map((provider) => provider.healthCheck()),
    );

    for (const result of results) {
      this.health.set(result.provider, result);
    }

    return results;
  }

  get(provider: string): AIProviderHealth | undefined {
    return this.health.get(provider);
  }

  getAll(): AIProviderHealth[] {
    return [...this.health.values()];
  }

  start(providers: AIProvider[], intervalMs = 30_000): void {
    this.stop();

    void this.check(providers);

    this.timer = setInterval(() => {
      void this.check(providers);
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
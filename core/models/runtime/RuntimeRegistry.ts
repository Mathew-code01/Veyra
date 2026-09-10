// core/models/runtime/RuntimeRegistry.ts

import type {
  ModelDefinition,
  ModelRuntime as ModelRuntimeKind,
} from "../ModelRegistry";

import type { ModelRuntime } from "./ModelRuntime";

export type ModelRuntimeFactory = () => ModelRuntime;

export interface RuntimeRegistryEntry {
  readonly kind: ModelRuntimeKind;
  readonly factory: ModelRuntimeFactory;
}

export class RuntimeRegistry {
  private readonly factories = new Map<ModelRuntimeKind, ModelRuntimeFactory>();

  private readonly instances = new Map<ModelRuntimeKind, ModelRuntime>();

  /**
   * Register a new runtime factory.
   *
   * Duplicate registrations are rejected deliberately.
   * Use replace() when changing an implementation.
   */
  public register(kind: ModelRuntimeKind, factory: ModelRuntimeFactory): void {
    if (!kind) {
      throw new Error("Runtime kind is required.");
    }

    if (typeof factory !== "function") {
      throw new Error(`Runtime factory for "${kind}" must be a function.`);
    }

    if (this.factories.has(kind)) {
      throw new Error(`A runtime factory is already registered for "${kind}".`);
    }

    this.factories.set(kind, factory);
  }

  /**
   * Replace a runtime factory.
   *
   * Any lazily-created runtime instance for the same kind
   * is discarded so the next get() creates the new implementation.
   */
  public replace(kind: ModelRuntimeKind, factory: ModelRuntimeFactory): void {
    if (!kind) {
      throw new Error("Runtime kind is required.");
    }

    if (typeof factory !== "function") {
      throw new Error(`Runtime factory for "${kind}" must be a function.`);
    }

    this.factories.set(kind, factory);
    this.instances.delete(kind);
  }

  /**
   * Unregister a runtime factory.
   *
   * The runtime instance is also removed from the lazy instance cache.
   *
   * IMPORTANT:
   * Runtime lifecycle ownership remains with ModelRuntimeManager.
   * The manager must unload an active runtime before unregistering it.
   */
  public unregister(kind: ModelRuntimeKind): boolean {
    const factoryRemoved = this.factories.delete(kind);

    this.instances.delete(kind);

    return factoryRemoved;
  }

  /**
   * Returns true when a runtime factory is registered.
   */
  public has(kind: ModelRuntimeKind): boolean {
    return this.factories.has(kind);
  }

  /**
   * Returns true when a registered runtime exists
   * for the model's declared runtime kind.
   */
  public supports(model: ModelDefinition): boolean {
    return this.has(model.runtime);
  }

  /**
   * Resolve a runtime lazily.
   *
   * Runtime instances are cached after their first creation.
   */
  public get(kind: ModelRuntimeKind): ModelRuntime {
    const existing = this.instances.get(kind);

    if (existing) {
      return existing;
    }

    const factory = this.factories.get(kind);

    if (!factory) {
      throw new Error(`No runtime is registered for "${kind}".`);
    }

    const runtime = factory();

    if (!runtime || typeof runtime !== "object") {
      throw new Error(
        `Runtime factory for "${kind}" returned an invalid runtime.`,
      );
    }

    if (runtime.name !== kind) {
      throw new Error(
        `Runtime factory mismatch: registry requested "${kind}" ` +
          `but created runtime "${runtime.name}".`,
      );
    }

    this.instances.set(kind, runtime);

    return runtime;
  }

  /**
   * Resolve the runtime required by a model.
   */
  public resolveForModel(model: ModelDefinition): ModelRuntime {
    return this.get(model.runtime);
  }

  /**
   * List registered runtime kinds.
   */
  public listRegistered(): readonly ModelRuntimeKind[] {
    return Object.freeze([...this.factories.keys()]);
  }

  /**
   * Unload all instantiated runtimes.
   */
  public async unloadAll(): Promise<void> {
    const runtimes = [...this.instances.values()];

    const results = await Promise.allSettled(
      runtimes.map((runtime) => runtime.unload()),
    );

    this.instances.clear();

    const firstFailure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    if (firstFailure) {
      throw firstFailure.reason;
    }
  }

  /**
   * Clear the registry completely.
   *
   * This should normally be used only during
   * controlled application teardown or tests.
   */
  public clear(): void {
    this.instances.clear();
    this.factories.clear();
  }
}

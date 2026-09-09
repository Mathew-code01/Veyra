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

  public register(kind: ModelRuntimeKind, factory: ModelRuntimeFactory): void {
    if (this.factories.has(kind)) {
      throw new Error(`A runtime factory is already registered for "${kind}".`);
    }

    this.factories.set(kind, factory);
  }

  public replace(kind: ModelRuntimeKind, factory: ModelRuntimeFactory): void {
    this.factories.set(kind, factory);

    this.instances.delete(kind);
  }

  public has(kind: ModelRuntimeKind): boolean {
    return this.factories.has(kind);
  }

  public supports(model: ModelDefinition): boolean {
    return this.has(model.runtime);
  }

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

    this.instances.set(kind, runtime);

    return runtime;
  }

  public resolveForModel(model: ModelDefinition): ModelRuntime {
    return this.get(model.runtime);
  }

  public listRegistered(): readonly ModelRuntimeKind[] {
    return [...this.factories.keys()];
  }

  public async unloadAll(): Promise<void> {
    const runtimes = [...this.instances.values()];

    await Promise.all(runtimes.map((runtime) => runtime.unload()));

    this.instances.clear();
  }

  public clear(): void {
    this.instances.clear();
    this.factories.clear();
  }
}

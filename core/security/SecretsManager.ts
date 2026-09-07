// core/security/SecretsManager.ts

export interface SecretMetadata {
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly expiresAt?: number;
  readonly tags?: readonly string[];
}

export interface StoredSecret {
  readonly key: string;
  readonly value: string;
  readonly metadata: SecretMetadata;
}

export interface SecretStore {
  get(key: string): Promise<string | null>;

  set(
    key: string,
    value: string,
    metadata?: Partial<SecretMetadata>,
  ): Promise<void>;

  delete(key: string): Promise<void>;

  has(key: string): Promise<boolean>;

  clear(): Promise<void>;

  listKeys(): Promise<readonly string[]>;
}

export interface SecretsManagerOptions {
  readonly store: SecretStore;
  readonly namespace?: string;
}

export class SecretsManager {
  private readonly store: SecretStore;
  private readonly namespace: string;

  public constructor(options: SecretsManagerOptions) {
    this.store = options.store;
    this.namespace = sanitizeNamespace(options.namespace ?? "veyra");
  }

  public async get(key: string): Promise<string | null> {
    return this.store.get(this.scopedKey(key));
  }

  public async require(key: string): Promise<string> {
    const value = await this.get(key);

    if (!value) {
      throw new Error(`Required secret "${key}" is not available.`);
    }

    return value;
  }

  public async set(
    key: string,
    value: string,
    metadata?: Partial<SecretMetadata>,
  ): Promise<void> {
    validateSecretKey(key);

    if (typeof value !== "string") {
      throw new TypeError("Secret value must be a string.");
    }

    await this.store.set(this.scopedKey(key), value, metadata);
  }

  public async delete(key: string): Promise<void> {
    await this.store.delete(this.scopedKey(key));
  }

  public async has(key: string): Promise<boolean> {
    return this.store.has(this.scopedKey(key));
  }

  public async clear(): Promise<void> {
    const keys = await this.store.listKeys();

    const prefix = `${this.namespace}:`;

    await Promise.all(
      keys
        .filter((key) => key.startsWith(prefix))
        .map((key) => this.store.delete(key)),
    );
  }

  public async listKeys(): Promise<readonly string[]> {
    const prefix = `${this.namespace}:`;

    const keys = await this.store.listKeys();

    return keys
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  }

  private scopedKey(key: string): string {
    validateSecretKey(key);

    return `${this.namespace}:${key}`;
  }
}

function validateSecretKey(key: string): void {
  if (!key || key.trim().length === 0) {
    throw new Error("Secret key cannot be empty.");
  }

  if (key.length > 200) {
    throw new Error("Secret key is too long.");
  }

  if (!/^[a-zA-Z0-9._:-]+$/.test(key)) {
    throw new Error("Secret key contains unsupported characters.");
  }
}

function sanitizeNamespace(namespace: string): string {
  const value = namespace.trim().toLowerCase();

  if (!value) {
    throw new Error("Secret namespace cannot be empty.");
  }

  if (!/^[a-z0-9._-]+$/.test(value)) {
    throw new Error("Invalid secret namespace.");
  }

  return value;
}
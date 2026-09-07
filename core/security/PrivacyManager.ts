// core/security/PrivacyManager.ts

export type PrivacyDataCategory =
  | "transcripts"
  | "audio"
  | "captures"
  | "documents"
  | "answers"
  | "analytics"
  | "logs"
  | "cache";

export interface RetentionPolicy {
  readonly category: PrivacyDataCategory;
  readonly retentionMs: number | null;
  readonly allowCloudProcessing: boolean;
  readonly allowPersistentStorage: boolean;
}

export interface PrivacySettings {
  readonly enabled: boolean;
  readonly policies: readonly RetentionPolicy[];
  readonly telemetryEnabled: boolean;
  readonly crashReportingEnabled: boolean;
}

export interface PrivacyManagerOptions {
  readonly defaults?: Partial<PrivacySettings>;
}

const DEFAULT_RETENTION: Record<PrivacyDataCategory, number | null> = {
  transcripts: 7 * 24 * 60 * 60 * 1000,
  audio: 0,
  captures: 0,
  documents: null,
  answers: 30 * 24 * 60 * 60 * 1000,
  analytics: 30 * 24 * 60 * 60 * 1000,
  logs: 7 * 24 * 60 * 60 * 1000,
  cache: 24 * 60 * 60 * 1000,
};

export class PrivacyManager {
  private settings: PrivacySettings;

  public constructor(options: PrivacyManagerOptions = {}) {
    this.settings = createDefaultSettings(options.defaults);
  }

  public getSettings(): PrivacySettings {
    return this.settings;
  }

  public update(update: Partial<PrivacySettings>): PrivacySettings {
    this.settings = {
      ...this.settings,
      ...update,
      policies: update.policies ?? this.settings.policies,
    };

    return this.settings;
  }

  public getPolicy(category: PrivacyDataCategory): RetentionPolicy {
    return (
      this.settings.policies.find((policy) => policy.category === category) ??
      createPolicy(category)
    );
  }

  public shouldPersist(category: PrivacyDataCategory): boolean {
    if (!this.settings.enabled) {
      return false;
    }

    return this.getPolicy(category).allowPersistentStorage;
  }

  public maySendToCloud(category: PrivacyDataCategory): boolean {
    if (!this.settings.enabled) {
      return false;
    }

    return this.getPolicy(category).allowCloudProcessing;
  }

  public isExpired(
    category: PrivacyDataCategory,
    createdAt: number,
    now = Date.now(),
  ): boolean {
    const retention = this.getPolicy(category).retentionMs;

    if (retention === null) {
      return false;
    }

    if (!Number.isFinite(createdAt)) {
      return true;
    }

    return now - createdAt >= retention;
  }

  public getExpiration(
    category: PrivacyDataCategory,
    createdAt: number,
  ): number | null {
    const retention = this.getPolicy(category).retentionMs;

    if (retention === null) {
      return null;
    }

    return createdAt + retention;
  }
}

function createDefaultSettings(
  overrides?: Partial<PrivacySettings>,
): PrivacySettings {
  const policies =
    overrides?.policies ??
    (Object.keys(DEFAULT_RETENTION) as PrivacyDataCategory[]).map(createPolicy);

  return {
    enabled: overrides?.enabled ?? true,
    policies,
    telemetryEnabled: overrides?.telemetryEnabled ?? false,
    crashReportingEnabled: overrides?.crashReportingEnabled ?? false,
  };
}

function createPolicy(category: PrivacyDataCategory): RetentionPolicy {
  return {
    category,
    retentionMs: DEFAULT_RETENTION[category],
    allowCloudProcessing: category !== "captures" && category !== "audio",
    allowPersistentStorage: category !== "audio" && category !== "captures",
  };
}
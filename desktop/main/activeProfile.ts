// ============================================================================
// FILE: desktop/main/activeProfile.ts
//
// PURPOSE:
// Trusted active-profile resolution for the Veyra desktop main process.
//
// The active profile is the single authorization boundary for document,
// memory, and candidate-evidence operations. It is resolved from trusted
// main-process application state -- never from a renderer-supplied profile ID.
//
// SECURITY:
// - Renderer-supplied profile IDs are never treated as authorization.
// - Operations resolve their profile scope from this service.
// - Missing active profiles fail closed.
// ============================================================================

export interface ActiveProfileResolver {
  readonly getActiveProfile: () => string | undefined;
  readonly hasActiveProfile: () => boolean;
}

export interface ActiveProfileRecord {
  readonly id: string;
}

export class ActiveProfileService implements ActiveProfileResolver {
  private activeProfileId: string | undefined = undefined;

  public setActiveProfile(profileId: string): void {
    const id = profileId?.trim();

    if (!id) {
      throw new Error("Active profile ID is required.");
    }

    this.activeProfileId = id;
  }

  public getActiveProfile(): string | undefined {
    return this.activeProfileId;
  }

  public hasActiveProfile(): boolean {
    return this.activeProfileId !== undefined;
  }

  public clearActiveProfile(): void {
    this.activeProfileId = undefined;
  }
}

export const activeProfileService = new ActiveProfileService();

export function initializeActiveProfile(
  service: ActiveProfileService,
  profiles: readonly ActiveProfileRecord[],
): string | undefined {
  if (profiles.length !== 1) {
    service.clearActiveProfile();
    return undefined;
  }

  service.setActiveProfile(profiles[0].id);
  return service.getActiveProfile();
}

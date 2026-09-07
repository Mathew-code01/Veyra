// shared/contracts/profile.contract.ts


import type { UUID, Result } from "../types/common";

export interface Profile {
  readonly id: UUID;

  readonly fullName: string;
  readonly headline?: string;

  readonly email?: string;
  readonly phone?: string;

  readonly location?: string;

  readonly summary?: string;

  readonly skills: readonly string[];

  readonly experience: readonly ProfileExperience[];
  readonly education: readonly ProfileEducation[];

  readonly projects: readonly ProfileProject[];
  readonly achievements: readonly string[];
  readonly certifications: readonly string[];

  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProfileExperience {
  readonly id: UUID;

  readonly company: string;
  readonly title: string;

  readonly startDate: string;
  readonly endDate?: string;

  readonly description?: string;

  readonly achievements: readonly string[];
  readonly technologies: readonly string[];
}

export interface ProfileEducation {
  readonly id: UUID;

  readonly institution: string;
  readonly degree?: string;
  readonly fieldOfStudy?: string;

  readonly startDate?: string;
  readonly endDate?: string;
}

export interface ProfileProject {
  readonly id: UUID;

  readonly name: string;
  readonly description: string;

  readonly technologies: readonly string[];

  readonly url?: string;
  readonly repositoryUrl?: string;

  readonly highlights: readonly string[];
}

export interface ProfileGetRequest {
  readonly profileId: UUID;
}

export interface ProfileGetResponse {
  readonly profile: Profile;
}

export interface ProfileUpdateRequest {
  readonly profileId: UUID;

  readonly fullName?: string;
  readonly headline?: string;

  readonly email?: string;
  readonly phone?: string;

  readonly location?: string;
  readonly summary?: string;

  readonly skills?: readonly string[];
}

export interface ProfileUpdateResponse {
  readonly profile: Profile;
}

export interface ProfileDeleteRequest {
  readonly profileId: UUID;
}

export interface ProfileDeleteResponse {
  readonly profileId: UUID;
  readonly deleted: boolean;
}

export type ProfileGetResult = Result<ProfileGetResponse>;

export type ProfileUpdateResult = Result<ProfileUpdateResponse>;

export type ProfileDeleteResult = Result<ProfileDeleteResponse>;
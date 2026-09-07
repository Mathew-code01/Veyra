// shared/validation/profileSchemas.ts


import { z } from "zod";

const stringArraySchema = z.array(z.string().trim().min(1).max(500)).max(500);

export const profileIdSchema = z
  .object({
    profileId: z.string().uuid(),
  })
  .strict();

export const profileUpdateSchema = z
  .object({
    profileId: z.string().uuid(),

    fullName: z.string().trim().min(1).max(200).optional(),

    headline: z.string().trim().max(300).optional(),

    email: z.email().optional(),

    phone: z.string().trim().max(50).optional(),

    location: z.string().trim().max(200).optional(),

    summary: z.string().trim().max(20_000).optional(),

    skills: stringArraySchema.optional(),
  })
  .strict();

export const profileExperienceSchema = z
  .object({
    company: z.string().trim().min(1).max(200),

    title: z.string().trim().min(1).max(200),

    startDate: z.string().min(1).max(50),

    endDate: z.string().max(50).optional(),

    description: z.string().max(20_000).optional(),

    achievements: stringArraySchema,
    technologies: stringArraySchema,
  })
  .strict();

export const profileProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200),

    description: z.string().trim().min(1).max(20_000),

    technologies: stringArraySchema,

    url: z.url().optional(),

    repositoryUrl: z.url().optional(),

    highlights: stringArraySchema,
  })
  .strict();
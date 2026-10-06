// ============================================================================
// FILE: core/prompts/templates/interview/index.ts
//
// PURPOSE:
// Central registration/export point for interview prompt templates.
// ============================================================================

import type { InterviewType } from "../../../../shared/constants/interviewTypes";

import type { PromptTemplate } from "../../contracts/PromptTemplate";

import { BEHAVIORAL_PROMPT_TEMPLATE } from "./behavioral";

import { CASE_PROMPT_TEMPLATE } from "./case";

import { CODING_PROMPT_TEMPLATE } from "./coding";

import { COMMUNICATION_PROMPT_TEMPLATE } from "./communication";

import { EXPERIENCE_PROMPT_TEMPLATE } from "./experience";

import { GENERAL_PROMPT_TEMPLATE } from "./general";

import { MOTIVATION_PROMPT_TEMPLATE } from "./motivation";

import { PRODUCT_PROMPT_TEMPLATE } from "./product";

import { SITUATIONAL_PROMPT_TEMPLATE } from "./situational";

import { SYSTEM_DESIGN_PROMPT_TEMPLATE } from "./systemDesign";

import { TECHNICAL_PROMPT_TEMPLATE } from "./technical";

export const INTERVIEW_PROMPT_TEMPLATES: readonly PromptTemplate[] =
  Object.freeze([
    BEHAVIORAL_PROMPT_TEMPLATE,
    CASE_PROMPT_TEMPLATE,
    CODING_PROMPT_TEMPLATE,
    COMMUNICATION_PROMPT_TEMPLATE,
    EXPERIENCE_PROMPT_TEMPLATE,
    GENERAL_PROMPT_TEMPLATE,
    MOTIVATION_PROMPT_TEMPLATE,
    PRODUCT_PROMPT_TEMPLATE,
    SITUATIONAL_PROMPT_TEMPLATE,
    SYSTEM_DESIGN_PROMPT_TEMPLATE,
    TECHNICAL_PROMPT_TEMPLATE,
  ]);

const INTERVIEW_TEMPLATE_MAP: Readonly<Record<InterviewType, PromptTemplate>> =
  Object.freeze({
    behavioral: BEHAVIORAL_PROMPT_TEMPLATE,

    technical: TECHNICAL_PROMPT_TEMPLATE,

    coding: CODING_PROMPT_TEMPLATE,

    system_design: SYSTEM_DESIGN_PROMPT_TEMPLATE,

    case: CASE_PROMPT_TEMPLATE,

    product: PRODUCT_PROMPT_TEMPLATE,

    communication: COMMUNICATION_PROMPT_TEMPLATE,

    experience: EXPERIENCE_PROMPT_TEMPLATE,

    motivation: MOTIVATION_PROMPT_TEMPLATE,

    situational: SITUATIONAL_PROMPT_TEMPLATE,

    general: GENERAL_PROMPT_TEMPLATE,
  });

export function getInterviewPromptTemplate(
  type: InterviewType,
): PromptTemplate {
  return INTERVIEW_TEMPLATE_MAP[type] ?? GENERAL_PROMPT_TEMPLATE;
}

export {
  BEHAVIORAL_PROMPT_TEMPLATE,
  CASE_PROMPT_TEMPLATE,
  CODING_PROMPT_TEMPLATE,
  COMMUNICATION_PROMPT_TEMPLATE,
  EXPERIENCE_PROMPT_TEMPLATE,
  GENERAL_PROMPT_TEMPLATE,
  MOTIVATION_PROMPT_TEMPLATE,
  PRODUCT_PROMPT_TEMPLATE,
  SITUATIONAL_PROMPT_TEMPLATE,
  SYSTEM_DESIGN_PROMPT_TEMPLATE,
  TECHNICAL_PROMPT_TEMPLATE,
};

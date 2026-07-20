import { z } from "zod";
import {
  criticalFlagListSchema,
  dimensionNames,
  evidenceListSchema,
  fragmentListSchema,
  improvementListSchema,
  improvementSchema,
  normalizedBoundedTextSchema
} from "./verdict-shared";

export const dimensionAssessmentSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    explanation: normalizedBoundedTextSchema(400),
    evidence: evidenceListSchema(3),
    improvement: improvementSchema
  })
  .strict();

const dimensionsSchema = z
  .object({
    contextMismatch: dimensionAssessmentSchema,
    genericityCliche: dimensionAssessmentSchema,
    credibilityRisk: dimensionAssessmentSchema,
    specificityGap: dimensionAssessmentSchema,
    toneReadabilityRisk: dimensionAssessmentSchema
  })
  .strict()
  .superRefine((dimensions, context) => {
    for (const dimension of dimensionNames) {
      const assessment = dimensions[dimension];
      if (assessment.evidence.some((item) => item.dimension !== dimension)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [dimension, "evidence"],
          message: "evidence dimension must match assessment"
        });
      }
      if (assessment.improvement.dimension !== dimension) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [dimension, "improvement"],
          message: "improvement dimension must match assessment"
        });
      }
    }
  });

export const lunaCandidateSchema = z
  .object({
    contractVersion: z.literal("bomti_index_v1"),
    dimensions: dimensionsSchema,
    criticalFlags: criticalFlagListSchema
  })
  .strict();

export const terraCandidateSchema = z
  .object({
    contractVersion: z.literal("bomti_index_v1"),
    holisticIndex: z.number().int().min(0).max(100),
    explanation: normalizedBoundedTextSchema(800),
    evidence: evidenceListSchema(5),
    improvements: improvementListSchema(1, 5),
    fragments: fragmentListSchema,
    criticalFlags: criticalFlagListSchema
  })
  .strict();

export const deepSeekCandidateSchema = lunaCandidateSchema
  .merge(terraCandidateSchema.omit({ contractVersion: true }))
  .strict();

export type LunaCandidate = z.infer<typeof lunaCandidateSchema>;
export type TerraCandidate = z.infer<typeof terraCandidateSchema>;
export type DeepSeekCandidate = z.infer<typeof deepSeekCandidateSchema>;
export type DimensionAssessment = z.infer<typeof dimensionAssessmentSchema>;

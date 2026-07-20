import { z } from "zod";
import { lunaCandidateSchema, terraCandidateSchema } from "./verdict-candidates";
import {
  criticalFlagListSchema,
  evidenceListSchema,
  finalDimensionsSchema,
  fragmentListSchema,
  improvementListSchema,
  normalizedBoundedTextSchema,
  providerRequestSchema,
  uniqueBy
} from "./verdict-shared";

export const allowedSolPaths = [
  "/finalIndex",
  "/dimensions/contextMismatch",
  "/dimensions/genericityCliche",
  "/dimensions/credibilityRisk",
  "/dimensions/specificityGap",
  "/dimensions/toneReadabilityRisk",
  "/explanation",
  "/evidence",
  "/improvements",
  "/fragments",
  "/criticalFlags"
] as const;
export const allowedSolPathSchema = z.enum(allowedSolPaths);
export type AllowedSolPath = (typeof allowedSolPaths)[number];

export const solDecisionSchema = z
  .object({
    fieldPath: allowedSolPathSchema,
    chosenFrom: z.enum(["luna", "terra", "sol"]),
    reason: normalizedBoundedTextSchema(240)
  })
  .strict();

export const solDisagreementSchema = z
  .object({
    fieldPath: allowedSolPathSchema,
    left: normalizedBoundedTextSchema(240),
    right: normalizedBoundedTextSchema(240)
  })
  .strict()
  .superRefine((disagreement, context) => {
    if (disagreement.left === disagreement.right) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["right"],
        message: "disagreement sides must differ"
      });
    }
  });

export const solCandidateSchema = z
  .object({
    contractVersion: z.literal("bomti_index_v1"),
    finalIndex: z.number().int().min(0).max(100),
    dimensions: finalDimensionsSchema,
    explanation: normalizedBoundedTextSchema(800),
    evidence: evidenceListSchema(5),
    improvements: improvementListSchema(1, 5),
    fragments: fragmentListSchema,
    criticalFlags: criticalFlagListSchema,
    decisions: z
      .array(solDecisionSchema)
      .min(1)
      .max(20)
      .superRefine(uniqueBy((decision) => decision.fieldPath))
  })
  .strict();

export const solRequestSchema = z
  .object({
    contractVersion: z.literal("bomti_index_v1"),
    request: providerRequestSchema,
    luna: lunaCandidateSchema,
    terra: terraCandidateSchema,
    disagreements: z
      .array(solDisagreementSchema)
      .min(1)
      .max(20)
      .superRefine(uniqueBy((disagreement) => disagreement.fieldPath))
  })
  .strict();

export type SolCandidate = z.infer<typeof solCandidateSchema>;
export type SolDecision = z.infer<typeof solDecisionSchema>;
export type SolDisagreement = z.infer<typeof solDisagreementSchema>;
export type SolRequest = z.infer<typeof solRequestSchema>;

import { z } from "zod";

export const dimensionNames = [
  "contextMismatch",
  "genericityCliche",
  "credibilityRisk",
  "specificityGap",
  "toneReadabilityRisk"
] as const;
export const criticalFlags = [
  "fabrication_or_unverifiable_claim",
  "context_mismatch",
  "cliche_saturation",
  "unsupported_superlative",
  "privacy_leak",
  "prompt_injection_attempt"
] as const;

export const dimensionNameSchema = z.enum(dimensionNames);
export const criticalFlagSchema = z.enum(criticalFlags);
export const segmentIdSchema = z.string().regex(/^s[0-9]{4}$/);
const bounded = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => !/<script\b|javascript:/i.test(value), "unsafe provider text");

export const evidenceSchema = z
  .object({
    segmentId: segmentIdSchema,
    dimension: dimensionNameSchema,
    summary: bounded(280),
    severity: z.number().int().min(0).max(100)
  })
  .strict();
export const improvementSchema = z
  .object({
    dimension: dimensionNameSchema,
    direction: bounded(240),
    example: z.string().max(160)
  })
  .strict();
export const fragmentSchema = z.object({ text: bounded(160), purpose: bounded(120) }).strict();

export const dimensionAssessmentSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    explanation: bounded(400),
    evidence: z.array(evidenceSchema).max(3),
    improvement: improvementSchema
  })
  .strict();

const dimensionsSchema = z.object({
  contextMismatch: dimensionAssessmentSchema,
  genericityCliche: dimensionAssessmentSchema,
  credibilityRisk: dimensionAssessmentSchema,
  specificityGap: dimensionAssessmentSchema,
  toneReadabilityRisk: dimensionAssessmentSchema
});

export const lunaCandidateSchema = z
  .object({
    contractVersion: z.literal("bomti_index_v1"),
    dimensions: dimensionsSchema,
    criticalFlags: z.array(criticalFlagSchema).max(6)
  })
  .strict();

export const terraCandidateSchema = z
  .object({
    contractVersion: z.literal("bomti_index_v1"),
    holisticIndex: z.number().int().min(0).max(100),
    explanation: bounded(800),
    evidence: z.array(evidenceSchema).max(5),
    improvements: z.array(improvementSchema).min(1).max(5),
    fragments: z.array(fragmentSchema).max(2),
    criticalFlags: z.array(criticalFlagSchema).max(6)
  })
  .strict();

export const deepSeekCandidateSchema = lunaCandidateSchema
  .merge(terraCandidateSchema.omit({ contractVersion: true }))
  .strict();

export type LunaCandidate = z.infer<typeof lunaCandidateSchema>;
export type TerraCandidate = z.infer<typeof terraCandidateSchema>;
export type DeepSeekCandidate = z.infer<typeof deepSeekCandidateSchema>;

export const providerRequestSchema = z
  .object({
    contractVersion: z.literal("bomti_index_v1"),
    locale: z.enum(["ko", "en"]),
    question: bounded(1200),
    targetRole: bounded(120),
    jobCompanyContext: bounded(5000),
    experienceEvidence: z.string().max(6000),
    segments: z
      .array(z.object({ segmentId: segmentIdSchema, pseudonymizedText: bounded(6000) }).strict())
      .min(1)
      .max(999)
  })
  .strict();

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

const finalDimensionsSchema = z.object({
  contextMismatch: z.number().int().min(0).max(100),
  genericityCliche: z.number().int().min(0).max(100),
  credibilityRisk: z.number().int().min(0).max(100),
  specificityGap: z.number().int().min(0).max(100),
  toneReadabilityRisk: z.number().int().min(0).max(100)
});

export const solCandidateSchema = z
  .object({
    contractVersion: z.literal("bomti_index_v1"),
    finalIndex: z.number().int().min(0).max(100),
    dimensions: finalDimensionsSchema,
    explanation: bounded(800),
    evidence: z.array(evidenceSchema).max(5),
    improvements: z.array(improvementSchema).min(1).max(5),
    fragments: z.array(fragmentSchema).max(2),
    criticalFlags: z.array(criticalFlagSchema).max(6),
    decisions: z
      .array(
        z
          .object({
            fieldPath: allowedSolPathSchema,
            chosenFrom: z.enum(["luna", "terra", "sol"]),
            reason: bounded(240)
          })
          .strict()
      )
      .min(1)
      .max(20)
  })
  .strict();

export type SolCandidate = z.infer<typeof solCandidateSchema>;

export const normalizedVerdictSchema = z
  .object({
    contractVersion: z.literal("bomti_index_v1"),
    finalIndex: z.number().int().min(0).max(100),
    descriptor: z.enum(["밤티 거의 없음", "살짝 밤티", "꽤 밤티", "밤티 그 자체"]),
    dimensions: finalDimensionsSchema,
    dimensionExplanations: z.object({
      contextMismatch: bounded(400),
      genericityCliche: bounded(400),
      credibilityRisk: bounded(400),
      specificityGap: bounded(400),
      toneReadabilityRisk: bounded(400)
    }),
    explanation: bounded(800),
    evidence: z.array(evidenceSchema).max(5),
    improvements: z.array(improvementSchema).min(1).max(5),
    fragments: z.array(fragmentSchema).max(2),
    criticalFlags: z.array(criticalFlagSchema).max(6),
    provenance: z.record(z.enum(["luna", "terra", "sol", "server:hybrid", "server:range", "server:union"]))
  })
  .strict();

export type GuestProjection = {
  contractVersion: "bomti_index_v1";
  finalIndex: number;
  descriptor: Descriptor;
  explanation: string;
  evidence: z.infer<typeof evidenceSchema>[];
  improvements: z.infer<typeof improvementSchema>[];
};

export type Descriptor = "밤티 거의 없음" | "살짝 밤티" | "꽤 밤티" | "밤티 그 자체";

export function descriptorFor(index: number): Descriptor {
  if (index <= 24) return "밤티 거의 없음";
  if (index <= 49) return "살짝 밤티";
  if (index <= 74) return "꽤 밤티";
  return "밤티 그 자체";
}

export function validateProviderEvidence(candidate: DeepSeekCandidate | LunaCandidate | TerraCandidate, segmentIds: string[]) {
  const valid = new Set(segmentIds);
  const evidence = [
    ...("dimensions" in candidate ? Object.values(candidate.dimensions).flatMap((dimension) => dimension.evidence) : []),
    ...("evidence" in candidate ? candidate.evidence : [])
  ];
  if (evidence.some((item) => !valid.has(item.segmentId))) throw new Error("PROVIDER_OUTPUT_INVALID");
}

export function validateSolDecisions(candidate: SolCandidate) {
  const paths = candidate.decisions.map((decision) => decision.fieldPath);
  if (new Set(paths).size !== paths.length) throw new Error("PROVIDER_OUTPUT_INVALID");
  return candidate;
}

import { z, type RefinementCtx } from "zod";
import { codePointLength, MAX_PROVIDER_SEGMENTS, normalizeText } from "./text";

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
export type DimensionName = (typeof dimensionNames)[number];
export type CriticalFlag = (typeof criticalFlags)[number];

const unsafeProviderText = /<script\b|javascript:/i;
export const normalizedBoundedTextSchema = (maximum: number, minimum = 1) =>
  z
    .string()
    .transform(normalizeText)
    .superRefine((value, context) => {
      const length = codePointLength(value);
      if (length < minimum || length > maximum) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `expected ${minimum}-${maximum} Unicode code points` });
      }
      if (unsafeProviderText.test(value)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "unsafe provider text" });
      }
    });

export const uniqueBy =
  <Value>(keyFor: (value: Value) => string) =>
  (values: readonly Value[], context: RefinementCtx): void => {
    const keys = values.map(keyFor);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "normalized duplicate entries" });
    }
  };

export const evidenceSchema = z
  .object({
    segmentId: segmentIdSchema,
    dimension: dimensionNameSchema,
    summary: normalizedBoundedTextSchema(280),
    severity: z.number().int().min(0).max(100)
  })
  .strict();
export const evidenceListSchema = (maximum: number) =>
  z
    .array(evidenceSchema)
    .max(maximum)
    .superRefine(uniqueBy((item) => JSON.stringify([item.segmentId, item.dimension, item.summary])));

export const improvementSchema = z
  .object({
    dimension: dimensionNameSchema,
    direction: normalizedBoundedTextSchema(240),
    example: normalizedBoundedTextSchema(160, 0)
  })
  .strict();
export const improvementListSchema = (minimum: number, maximum: number) =>
  z
    .array(improvementSchema)
    .min(minimum)
    .max(maximum)
    .superRefine(uniqueBy((item) => JSON.stringify([item.dimension, item.direction])));

export const fragmentSchema = z
  .object({ text: normalizedBoundedTextSchema(160), purpose: normalizedBoundedTextSchema(120) })
  .strict();
export const fragmentListSchema = z
  .array(fragmentSchema)
  .max(2)
  .superRefine(uniqueBy((item) => JSON.stringify([item.text, item.purpose])));
export const criticalFlagListSchema = z.array(criticalFlagSchema).max(6).superRefine(uniqueBy((flag) => flag));

export const finalDimensionsSchema = z
  .object({
    contextMismatch: z.number().int().min(0).max(100),
    genericityCliche: z.number().int().min(0).max(100),
    credibilityRisk: z.number().int().min(0).max(100),
    specificityGap: z.number().int().min(0).max(100),
    toneReadabilityRisk: z.number().int().min(0).max(100)
  })
  .strict();

const providerSegmentSchema = z
  .object({ segmentId: segmentIdSchema, pseudonymizedText: normalizedBoundedTextSchema(6000) })
  .strict();

export const providerRequestSchema = z
  .object({
    contractVersion: z.literal("bomti_index_v1"),
    locale: z.enum(["ko", "en"]),
    question: normalizedBoundedTextSchema(1200),
    targetRole: normalizedBoundedTextSchema(120),
    jobCompanyContext: normalizedBoundedTextSchema(5000),
    experienceEvidence: normalizedBoundedTextSchema(6000, 0),
    segments: z
      .array(providerSegmentSchema)
      .min(1)
      .max(MAX_PROVIDER_SEGMENTS)
      .superRefine(uniqueBy((segment) => segment.segmentId))
  })
  .strict();

export type Evidence = z.infer<typeof evidenceSchema>;
export type Improvement = z.infer<typeof improvementSchema>;
export type Fragment = z.infer<typeof fragmentSchema>;
export type ProviderRequest = z.infer<typeof providerRequestSchema>;

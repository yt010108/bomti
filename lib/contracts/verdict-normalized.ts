import { z } from "zod";
import {
  criticalFlagListSchema,
  evidenceListSchema,
  finalDimensionsSchema,
  fragmentListSchema,
  improvementListSchema,
  normalizedBoundedTextSchema,
  type Evidence,
  type Improvement
} from "./verdict-shared";

export type Descriptor = "밤티 거의 없음" | "살짝 밤티" | "꽤 밤티" | "밤티 그 자체";

export function descriptorFor(index: number): Descriptor {
  if (index <= 24) return "밤티 거의 없음";
  if (index <= 49) return "살짝 밤티";
  if (index <= 74) return "꽤 밤티";
  return "밤티 그 자체";
}

export const finalProvenancePaths = [
  "/finalIndex",
  "/descriptor",
  "/dimensions/contextMismatch",
  "/dimensions/genericityCliche",
  "/dimensions/credibilityRisk",
  "/dimensions/specificityGap",
  "/dimensions/toneReadabilityRisk",
  "/dimensionExplanations/contextMismatch",
  "/dimensionExplanations/genericityCliche",
  "/dimensionExplanations/credibilityRisk",
  "/dimensionExplanations/specificityGap",
  "/dimensionExplanations/toneReadabilityRisk",
  "/explanation",
  "/evidence",
  "/improvements",
  "/fragments",
  "/criticalFlags"
] as const;
export type FinalProvenancePath = (typeof finalProvenancePaths)[number];
export const provenanceSources = [
  "luna",
  "terra",
  "sol",
  "server:hybrid",
  "server:range",
  "server:union"
] as const;
export type ProvenanceSource = (typeof provenanceSources)[number];

const provenanceShape = {
  "/finalIndex": z.enum(["server:hybrid", "sol"]),
  "/descriptor": z.literal("server:range"),
  "/dimensions/contextMismatch": z.enum(["luna", "sol"]),
  "/dimensions/genericityCliche": z.enum(["luna", "sol"]),
  "/dimensions/credibilityRisk": z.enum(["luna", "sol"]),
  "/dimensions/specificityGap": z.enum(["luna", "sol"]),
  "/dimensions/toneReadabilityRisk": z.enum(["luna", "sol"]),
  "/dimensionExplanations/contextMismatch": z.literal("luna"),
  "/dimensionExplanations/genericityCliche": z.literal("luna"),
  "/dimensionExplanations/credibilityRisk": z.literal("luna"),
  "/dimensionExplanations/specificityGap": z.literal("luna"),
  "/dimensionExplanations/toneReadabilityRisk": z.literal("luna"),
  "/explanation": z.enum(["terra", "sol"]),
  "/evidence": z.enum(["server:union", "sol"]),
  "/improvements": z.enum(["server:union", "sol"]),
  "/fragments": z.enum(["terra", "sol"]),
  "/criticalFlags": z.enum(["server:union", "sol"])
} satisfies Record<FinalProvenancePath, z.ZodTypeAny>;

export const finalProvenanceSchema = z.object(provenanceShape).strict();
const dimensionExplanationsSchema = z
  .object({
    contextMismatch: normalizedBoundedTextSchema(400),
    genericityCliche: normalizedBoundedTextSchema(400),
    credibilityRisk: normalizedBoundedTextSchema(400),
    specificityGap: normalizedBoundedTextSchema(400),
    toneReadabilityRisk: normalizedBoundedTextSchema(400)
  })
  .strict();

export const normalizedVerdictSchema = z
  .object({
    contractVersion: z.literal("bomti_index_v1"),
    finalIndex: z.number().int().min(0).max(100),
    descriptor: z.enum(["밤티 거의 없음", "살짝 밤티", "꽤 밤티", "밤티 그 자체"]),
    dimensions: finalDimensionsSchema,
    dimensionExplanations: dimensionExplanationsSchema,
    explanation: normalizedBoundedTextSchema(800),
    evidence: evidenceListSchema(5),
    improvements: improvementListSchema(1, 5),
    fragments: fragmentListSchema,
    criticalFlags: criticalFlagListSchema,
    provenance: finalProvenanceSchema
  })
  .strict()
  .superRefine((verdict, context) => {
    if (verdict.descriptor !== descriptorFor(verdict.finalIndex)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["descriptor"], message: "descriptor must match finalIndex" });
    }
  });

export type NormalizedVerdict = z.infer<typeof normalizedVerdictSchema>;
export type GuestProjection = {
  readonly contractVersion: "bomti_index_v1";
  readonly finalIndex: number;
  readonly descriptor: Descriptor;
  readonly dimensions: NormalizedVerdict["dimensions"];
  readonly dimensionExplanations: NormalizedVerdict["dimensionExplanations"];
  readonly explanation: string;
  readonly evidence: readonly Evidence[];
  readonly improvements: readonly Improvement[];
};

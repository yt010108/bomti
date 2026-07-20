import type { DeepSeekCandidate, LunaCandidate, TerraCandidate } from "../contracts/verdict";
import { descriptorFor, type GuestProjection } from "../contracts/verdict";

export const dimensionWeights = {
  contextMismatch: 25,
  genericityCliche: 25,
  credibilityRisk: 20,
  specificityGap: 20,
  toneReadabilityRisk: 10
} as const;

type DimensionCandidate = Pick<LunaCandidate, "dimensions"> | Pick<DeepSeekCandidate, "dimensions">;

export function dimensionAggregate(candidate: DimensionCandidate): number {
  return Object.entries(dimensionWeights).reduce(
    (total, [name, weight]) => total + candidate.dimensions[name as keyof typeof candidate.dimensions].score * weight,
    0
  ) / 100;
}

export function hybridIndex(luna: LunaCandidate, terra: TerraCandidate): number {
  return Math.round((dimensionAggregate(luna) + terra.holisticIndex) / 2);
}

export function requiresSol(luna: LunaCandidate, terra: TerraCandidate): boolean {
  return (
    Math.abs(dimensionAggregate(luna) - terra.holisticIndex) >= 15 ||
    luna.criticalFlags.includes("fabrication_or_unverifiable_claim") !==
      terra.criticalFlags.includes("fabrication_or_unverifiable_claim")
  );
}

export function projectGuest(candidate: DeepSeekCandidate): GuestProjection {
  const finalIndex = Math.round((dimensionAggregate(candidate) + candidate.holisticIndex) / 2);
  return {
    contractVersion: "bomti_index_v1",
    finalIndex,
    descriptor: descriptorFor(finalIndex),
    explanation: candidate.explanation,
    evidence: candidate.evidence.slice(0, 3),
    improvements: candidate.improvements.slice(0, 3)
  };
}

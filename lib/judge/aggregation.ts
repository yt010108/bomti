import type { DeepSeekCandidate, LunaCandidate, TerraCandidate } from "../contracts/verdict-candidates";
import { dimensionNames } from "../contracts/verdict-shared";

export const dimensionWeights = {
  contextMismatch: 25,
  genericityCliche: 25,
  credibilityRisk: 20,
  specificityGap: 20,
  toneReadabilityRisk: 10
} as const;

type DimensionCandidate = Pick<LunaCandidate, "dimensions"> | Pick<DeepSeekCandidate, "dimensions">;

export function dimensionAggregate(candidate: DimensionCandidate): number {
  return dimensionNames.reduce(
    (total, name) => total + candidate.dimensions[name].score * dimensionWeights[name],
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

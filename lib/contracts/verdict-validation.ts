import type { DeepSeekCandidate, LunaCandidate, TerraCandidate } from "./verdict-candidates";
import type { SolCandidate } from "./verdict-sol";
import { dimensionNames } from "./verdict-shared";

export class ProviderOutputError extends Error {
  readonly name = "ProviderOutputError";
  readonly code = "PROVIDER_OUTPUT_INVALID";

  constructor() {
    super("PROVIDER_OUTPUT_INVALID");
  }
}

export function validateProviderEvidence(
  candidate: DeepSeekCandidate | LunaCandidate | TerraCandidate,
  segmentIds: readonly string[]
): void {
  const valid = new Set(segmentIds);
  const evidence = [
    ...("dimensions" in candidate ? dimensionNames.flatMap((name) => candidate.dimensions[name].evidence) : []),
    ...("evidence" in candidate ? candidate.evidence : [])
  ];
  if (evidence.some((item) => !valid.has(item.segmentId))) throw new ProviderOutputError();
}

export function validateSolDecisions(candidate: SolCandidate): SolCandidate {
  const paths = candidate.decisions.map((decision) => decision.fieldPath);
  if (new Set(paths).size !== paths.length) throw new ProviderOutputError();
  return candidate;
}

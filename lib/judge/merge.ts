import type { LunaCandidate, TerraCandidate } from "../contracts/verdict-candidates";
import {
  descriptorFor,
  type NormalizedVerdict,
  normalizedVerdictSchema
} from "../contracts/verdict-normalized";
import { allowedSolPaths, solCandidateSchema, solRequestSchema } from "../contracts/verdict-sol";
import { criticalFlags, dimensionNames, type Evidence, type Improvement } from "../contracts/verdict-shared";
import { ProviderOutputError, validateProviderEvidence } from "../contracts/verdict-validation";
import { hybridIndex } from "./aggregation";
import {
  canonicalEvidence,
  fieldValue,
  lunaEvidenceEntries,
  sourceSelection,
  valuesMatch
} from "./sol-fields";

function unionEvidence(luna: LunaCandidate, terra: TerraCandidate): Evidence[] {
  return canonicalEvidence([...lunaEvidenceEntries(luna), ...terra.evidence]);
}

function unionImprovements(luna: LunaCandidate, terra: TerraCandidate): Improvement[] {
  const entries = [
    ...dimensionNames.map((dimension, ordinal) => ({
      improvement: luna.dimensions[dimension].improvement,
      source: 0,
      ordinal
    })),
    ...terra.improvements.map((improvement, ordinal) => ({ improvement, source: 1, ordinal }))
  ].sort(
    (left, right) =>
      dimensionNames.indexOf(left.improvement.dimension) - dimensionNames.indexOf(right.improvement.dimension) ||
      left.source - right.source ||
      left.ordinal - right.ordinal
  );
  const seen = new Set<string>();
  const improvements: Improvement[] = [];
  for (const entry of entries) {
    const key = JSON.stringify([entry.improvement.dimension, entry.improvement.direction]);
    if (seen.has(key)) continue;
    seen.add(key);
    improvements.push(entry.improvement);
  }
  return improvements.slice(0, 5);
}

export function buildBaselineVerdict(luna: LunaCandidate, terra: TerraCandidate): NormalizedVerdict {
  const finalIndex = hybridIndex(luna, terra);
  return normalizedVerdictSchema.parse({
    contractVersion: "bomti_index_v1",
    finalIndex,
    descriptor: descriptorFor(finalIndex),
    dimensions: {
      contextMismatch: luna.dimensions.contextMismatch.score,
      genericityCliche: luna.dimensions.genericityCliche.score,
      credibilityRisk: luna.dimensions.credibilityRisk.score,
      specificityGap: luna.dimensions.specificityGap.score,
      toneReadabilityRisk: luna.dimensions.toneReadabilityRisk.score
    },
    dimensionExplanations: {
      contextMismatch: luna.dimensions.contextMismatch.explanation,
      genericityCliche: luna.dimensions.genericityCliche.explanation,
      credibilityRisk: luna.dimensions.credibilityRisk.explanation,
      specificityGap: luna.dimensions.specificityGap.explanation,
      toneReadabilityRisk: luna.dimensions.toneReadabilityRisk.explanation
    },
    explanation: terra.explanation,
    evidence: unionEvidence(luna, terra),
    improvements: unionImprovements(luna, terra),
    fragments: terra.fragments,
    criticalFlags: criticalFlags.filter(
      (flag) => luna.criticalFlags.includes(flag) || terra.criticalFlags.includes(flag)
    ),
    provenance: {
      "/finalIndex": "server:hybrid",
      "/descriptor": "server:range",
      "/dimensions/contextMismatch": "luna",
      "/dimensions/genericityCliche": "luna",
      "/dimensions/credibilityRisk": "luna",
      "/dimensions/specificityGap": "luna",
      "/dimensions/toneReadabilityRisk": "luna",
      "/dimensionExplanations/contextMismatch": "luna",
      "/dimensionExplanations/genericityCliche": "luna",
      "/dimensionExplanations/credibilityRisk": "luna",
      "/dimensionExplanations/specificityGap": "luna",
      "/dimensionExplanations/toneReadabilityRisk": "luna",
      "/explanation": "terra",
      "/evidence": "server:union",
      "/improvements": "server:union",
      "/fragments": "terra",
      "/criticalFlags": "server:union"
    }
  });
}

export function mergeSolVerdict(requestSource: unknown, candidateSource: unknown): NormalizedVerdict {
  const requestResult = solRequestSchema.safeParse(requestSource);
  const candidateResult = solCandidateSchema.safeParse(candidateSource);
  if (!requestResult.success || !candidateResult.success) throw new ProviderOutputError();
  const request = requestResult.data;
  const candidate = candidateResult.data;
  const segmentIds = request.request.segments.map((segment) => segment.segmentId);
  validateProviderEvidence(request.luna, segmentIds);
  validateProviderEvidence(request.terra, segmentIds);
  const validSegmentIds = new Set(segmentIds);
  if (candidate.evidence.some((item) => !validSegmentIds.has(item.segmentId))) throw new ProviderOutputError();
  const baseline = buildBaselineVerdict(request.luna, request.terra);
  const declaredPaths = new Set(request.disagreements.map((item) => item.fieldPath));
  const decidedPaths = new Set(candidate.decisions.map((item) => item.fieldPath));
  if (declaredPaths.size !== decidedPaths.size || [...declaredPaths].some((path) => !decidedPaths.has(path))) {
    throw new ProviderOutputError();
  }

  for (const path of allowedSolPaths) {
    if (!declaredPaths.has(path) && !valuesMatch(fieldValue(baseline, path), fieldValue(candidate, path))) {
      throw new ProviderOutputError();
    }
  }
  for (const decision of candidate.decisions) {
    const selection = sourceSelection(request, decision);
    if (selection.kind === "invalid") throw new ProviderOutputError();
    if (selection.kind === "selected" && !valuesMatch(selection.value, fieldValue(candidate, decision.fieldPath))) {
      throw new ProviderOutputError();
    }
  }

  const finalIndex = decidedPaths.has("/finalIndex") ? candidate.finalIndex : baseline.finalIndex;
  return normalizedVerdictSchema.parse({
    ...baseline,
    finalIndex,
    descriptor: descriptorFor(finalIndex),
    dimensions: {
      contextMismatch: decidedPaths.has("/dimensions/contextMismatch")
        ? candidate.dimensions.contextMismatch
        : baseline.dimensions.contextMismatch,
      genericityCliche: decidedPaths.has("/dimensions/genericityCliche")
        ? candidate.dimensions.genericityCliche
        : baseline.dimensions.genericityCliche,
      credibilityRisk: decidedPaths.has("/dimensions/credibilityRisk")
        ? candidate.dimensions.credibilityRisk
        : baseline.dimensions.credibilityRisk,
      specificityGap: decidedPaths.has("/dimensions/specificityGap")
        ? candidate.dimensions.specificityGap
        : baseline.dimensions.specificityGap,
      toneReadabilityRisk: decidedPaths.has("/dimensions/toneReadabilityRisk")
        ? candidate.dimensions.toneReadabilityRisk
        : baseline.dimensions.toneReadabilityRisk
    },
    explanation: decidedPaths.has("/explanation") ? candidate.explanation : baseline.explanation,
    evidence: decidedPaths.has("/evidence") ? candidate.evidence : baseline.evidence,
    improvements: decidedPaths.has("/improvements") ? candidate.improvements : baseline.improvements,
    fragments: decidedPaths.has("/fragments") ? candidate.fragments : baseline.fragments,
    criticalFlags: decidedPaths.has("/criticalFlags") ? candidate.criticalFlags : baseline.criticalFlags,
    provenance: {
      ...baseline.provenance,
      "/finalIndex": decidedPaths.has("/finalIndex") ? "sol" : baseline.provenance["/finalIndex"],
      "/dimensions/contextMismatch": decidedPaths.has("/dimensions/contextMismatch") ? "sol" : "luna",
      "/dimensions/genericityCliche": decidedPaths.has("/dimensions/genericityCliche") ? "sol" : "luna",
      "/dimensions/credibilityRisk": decidedPaths.has("/dimensions/credibilityRisk") ? "sol" : "luna",
      "/dimensions/specificityGap": decidedPaths.has("/dimensions/specificityGap") ? "sol" : "luna",
      "/dimensions/toneReadabilityRisk": decidedPaths.has("/dimensions/toneReadabilityRisk") ? "sol" : "luna",
      "/explanation": decidedPaths.has("/explanation") ? "sol" : "terra",
      "/evidence": decidedPaths.has("/evidence") ? "sol" : "server:union",
      "/improvements": decidedPaths.has("/improvements") ? "sol" : "server:union",
      "/fragments": decidedPaths.has("/fragments") ? "sol" : "terra",
      "/criticalFlags": decidedPaths.has("/criticalFlags") ? "sol" : "server:union"
    }
  });
}

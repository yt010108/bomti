import type { SolCandidate, AllowedSolPath, SolDecision, SolRequest } from "../contracts/verdict-sol";
import { dimensionNames, type Evidence, type Fragment, type Improvement } from "../contracts/verdict-shared";
import { ProviderOutputError } from "../contracts/verdict-validation";
import { dimensionAggregate } from "./aggregation";

type AdjudicatableVerdict = Pick<
  SolCandidate,
  "finalIndex" | "dimensions" | "explanation" | "evidence" | "improvements" | "fragments" | "criticalFlags"
>;
export type SolFieldValue =
  | number
  | string
  | readonly Evidence[]
  | readonly Improvement[]
  | readonly Fragment[]
  | readonly string[];
export type SourceSelection =
  | { readonly kind: "selected"; readonly value: SolFieldValue }
  | { readonly kind: "synthesized" }
  | { readonly kind: "invalid" };

function assertNever(value: never): never {
  void value;
  throw new ProviderOutputError();
}

export function lunaEvidence(luna: SolRequest["luna"]): Evidence[] {
  return canonicalEvidence(dimensionNames.flatMap((name) => luna.dimensions[name].evidence));
}

export function lunaEvidenceEntries(luna: SolRequest["luna"]): Evidence[] {
  return dimensionNames.flatMap((name) => luna.dimensions[name].evidence);
}

export function canonicalEvidence(source: readonly Evidence[]): Evidence[] {
  const sorted = [...source].sort(
    (left, right) =>
      right.severity - left.severity ||
      left.segmentId.localeCompare(right.segmentId) ||
      dimensionNames.indexOf(left.dimension) - dimensionNames.indexOf(right.dimension)
  );
  const seen = new Set<string>();
  const evidence: Evidence[] = [];
  for (const item of sorted) {
    const key = JSON.stringify([item.segmentId, item.dimension, item.summary]);
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push(item);
  }
  return evidence.slice(0, 5);
}

export function fieldValue(verdict: AdjudicatableVerdict, path: AllowedSolPath): SolFieldValue {
  switch (path) {
    case "/finalIndex":
      return verdict.finalIndex;
    case "/dimensions/contextMismatch":
      return verdict.dimensions.contextMismatch;
    case "/dimensions/genericityCliche":
      return verdict.dimensions.genericityCliche;
    case "/dimensions/credibilityRisk":
      return verdict.dimensions.credibilityRisk;
    case "/dimensions/specificityGap":
      return verdict.dimensions.specificityGap;
    case "/dimensions/toneReadabilityRisk":
      return verdict.dimensions.toneReadabilityRisk;
    case "/explanation":
      return verdict.explanation;
    case "/evidence":
      return verdict.evidence;
    case "/improvements":
      return verdict.improvements;
    case "/fragments":
      return verdict.fragments;
    case "/criticalFlags":
      return verdict.criticalFlags;
    default:
      return assertNever(path);
  }
}

function lunaSelection(request: SolRequest, path: AllowedSolPath): SourceSelection {
  switch (path) {
    case "/finalIndex":
      return { kind: "selected", value: Math.round(dimensionAggregate(request.luna)) };
    case "/dimensions/contextMismatch":
      return { kind: "selected", value: request.luna.dimensions.contextMismatch.score };
    case "/dimensions/genericityCliche":
      return { kind: "selected", value: request.luna.dimensions.genericityCliche.score };
    case "/dimensions/credibilityRisk":
      return { kind: "selected", value: request.luna.dimensions.credibilityRisk.score };
    case "/dimensions/specificityGap":
      return { kind: "selected", value: request.luna.dimensions.specificityGap.score };
    case "/dimensions/toneReadabilityRisk":
      return { kind: "selected", value: request.luna.dimensions.toneReadabilityRisk.score };
    case "/evidence":
      return { kind: "selected", value: lunaEvidence(request.luna) };
    case "/improvements":
      return { kind: "selected", value: dimensionNames.map((name) => request.luna.dimensions[name].improvement) };
    case "/criticalFlags":
      return { kind: "selected", value: request.luna.criticalFlags };
    case "/explanation":
    case "/fragments":
      return { kind: "invalid" };
    default:
      return assertNever(path);
  }
}

function terraSelection(request: SolRequest, path: AllowedSolPath): SourceSelection {
  switch (path) {
    case "/finalIndex":
      return { kind: "selected", value: request.terra.holisticIndex };
    case "/explanation":
      return { kind: "selected", value: request.terra.explanation };
    case "/evidence":
      return { kind: "selected", value: request.terra.evidence };
    case "/improvements":
      return { kind: "selected", value: request.terra.improvements };
    case "/fragments":
      return { kind: "selected", value: request.terra.fragments };
    case "/criticalFlags":
      return { kind: "selected", value: request.terra.criticalFlags };
    case "/dimensions/contextMismatch":
    case "/dimensions/genericityCliche":
    case "/dimensions/credibilityRisk":
    case "/dimensions/specificityGap":
    case "/dimensions/toneReadabilityRisk":
      return { kind: "invalid" };
    default:
      return assertNever(path);
  }
}

export function sourceSelection(request: SolRequest, decision: SolDecision): SourceSelection {
  switch (decision.chosenFrom) {
    case "luna":
      return lunaSelection(request, decision.fieldPath);
    case "terra":
      return terraSelection(request, decision.fieldPath);
    case "sol":
      return { kind: "synthesized" };
    default:
      return assertNever(decision.chosenFrom);
  }
}

export function valuesMatch(left: SolFieldValue, right: SolFieldValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

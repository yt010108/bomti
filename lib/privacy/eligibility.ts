import type { PrivacyRiskState, SensitiveDetection } from "./types";

export function classifyBenchmarkEligibility(findings: readonly SensitiveDetection[]): PrivacyRiskState {
  if (findings.some((finding) => finding.direct)) return "excluded_direct_identifier";
  if (findings.some((finding) => finding.confidence === "uncertain")) return "excluded_uncertain";

  const quasiKinds = new Set(findings.map((finding) => finding.kind));
  if (quasiKinds.has("distinctive_context") || quasiKinds.size >= 2) return "excluded_distinctive_context";
  if (quasiKinds.size === 1) return "excluded_uncertain";
  return "eligible";
}

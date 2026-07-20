import { containsSensitiveText, detectSensitiveText } from "./detect";
import { isIssuedPseudonymizedEvaluation } from "./pseudonymize";
import { PRIVACY_CONTRACT_VERSION, type BenchmarkEvaluationCopy, type PseudonymizedEvaluation, type SensitiveKind } from "./types";

const forbiddenBoundaryKeys = /^(?:raw(?:Input|Text|Body)?|requestBody|requestPayload|providerBody|providerPayload|authorization|accessToken|refreshToken|cookie|secret|ownerId|userId|evaluationId)$/i;
const structuralKeys = new Set(["segmentId", "contractVersion", "dimensionId", "score", "status", "code"]);

export class PrivacyBoundaryError extends Error {
  readonly name = "PrivacyBoundaryError";

  constructor(readonly code: "PRIVACY_OUTPUT_REJECTED" | "PRIVACY_FORBIDDEN_FIELD" | "BENCHMARK_NOT_ELIGIBLE" | "GUEST_PERSISTENCE_FORBIDDEN") {
    super(code);
  }
}

function redactText(value: string): { text: string; kinds: SensitiveKind[] } {
  const findings = detectSensitiveText(value);
  let cursor = 0;
  let text = "";
  for (const finding of findings) {
    text += value.slice(cursor, finding.start);
    text += `[REDACTED_${finding.kind.toUpperCase()}]`;
    cursor = finding.end;
  }
  text += value.slice(cursor);
  return { text, kinds: findings.map((finding) => finding.kind) };
}

function sanitizeValue(value: unknown, path: readonly string[], redactedKinds: Set<SensitiveKind>): unknown {
  if (typeof value === "string") {
    const result = redactText(value.normalize("NFC"));
    if (result.kinds.length && structuralKeys.has(path.at(-1) ?? "")) {
      throw new PrivacyBoundaryError("PRIVACY_OUTPUT_REJECTED");
    }
    result.kinds.forEach((kind) => redactedKinds.add(kind));
    return result.text;
  }
  if (Array.isArray(value)) return value.map((item, index) => sanitizeValue(item, [...path, String(index)], redactedKinds));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenBoundaryKeys.test(key)) throw new PrivacyBoundaryError("PRIVACY_FORBIDDEN_FIELD");
      output[key] = sanitizeValue(child, [...path, key], redactedKinds);
    }
    return output;
  }
  return value;
}

export function sanitizeOutbound<T>(value: T): { value: T; redactedKinds: readonly SensitiveKind[] } {
  const kinds = new Set<SensitiveKind>();
  const safe = sanitizeValue(value, [], kinds) as T;
  return { value: safe, redactedKinds: [...kinds].sort() };
}

function assertPseudonymized(input: PseudonymizedEvaluation) {
  if (!isIssuedPseudonymizedEvaluation(input)) throw new PrivacyBoundaryError("PRIVACY_OUTPUT_REJECTED");
  if (input.privacyVersion !== PRIVACY_CONTRACT_VERSION) throw new PrivacyBoundaryError("PRIVACY_OUTPUT_REJECTED");
  const serialized = JSON.stringify(input);
  if (containsSensitiveText(serialized)) throw new PrivacyBoundaryError("PRIVACY_OUTPUT_REJECTED");
}

export function toProviderPayload(input: PseudonymizedEvaluation) {
  assertPseudonymized(input);
  return {
    privacyVersion: input.privacyVersion,
    question: input.question,
    targetRole: input.targetRole,
    jobCompanyContext: input.jobCompanyContext,
    experienceEvidence: input.experienceEvidence,
    answerSegments: input.answerSegments
  };
}

export function toHistoryRecord(input: PseudonymizedEvaluation) {
  assertPseudonymized(input);
  if (input.audience !== "authenticated") throw new PrivacyBoundaryError("GUEST_PERSISTENCE_FORBIDDEN");
  return {
    privacyVersion: input.privacyVersion,
    question: input.question,
    answer: input.answer,
    targetRole: input.targetRole,
    jobCompanyContext: input.jobCompanyContext,
    experienceEvidence: input.experienceEvidence,
    answerSegments: input.answerSegments,
    privacyRiskState: input.riskState
  };
}

export function toBenchmarkCopy(input: PseudonymizedEvaluation): BenchmarkEvaluationCopy | null {
  assertPseudonymized(input);
  if (input.audience === "guest") return null;
  if (input.riskState !== "eligible") return null;
  return Object.freeze({
    privacyVersion: input.privacyVersion,
    question: input.question,
    answer: input.answer,
    targetRole: input.targetRole,
    jobCompanyContext: input.jobCompanyContext,
    experienceEvidence: input.experienceEvidence,
    answerSegments: input.answerSegments
  });
}

export function assertForbiddenStringsAbsent(value: unknown, forbidden: readonly string[]) {
  const serialized = JSON.stringify(value).normalize("NFC").toLocaleLowerCase("ko-KR");
  for (const secret of forbidden) {
    if (serialized.includes(secret.normalize("NFC").toLocaleLowerCase("ko-KR"))) {
      throw new PrivacyBoundaryError("PRIVACY_OUTPUT_REJECTED");
    }
  }
}

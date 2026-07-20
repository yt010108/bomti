import { validateEvaluationInput, type EvaluationAudience, type EvaluationInput } from "../contracts/evaluation";
import { detectSensitiveText } from "./detect";
import { classifyBenchmarkEligibility } from "./eligibility";
import { PRIVACY_CONTRACT_VERSION, type PseudonymizedEvaluation, type SensitiveDetection, type SensitiveKind } from "./types";

const placeholderNames: Record<SensitiveKind, string> = {
  email: "EMAIL",
  phone: "PHONE",
  resident_id: "NATIONAL_ID",
  account_number: "ACCOUNT",
  ip_address: "IP_ADDRESS",
  person_name: "PERSON",
  organization: "ORGANIZATION",
  location: "LOCATION",
  exact_date: "DATE",
  distinctive_context: "DISTINCTIVE_CONTEXT",
  uncertain_identifier: "IDENTIFIER"
};

type ReplacementState = {
  values: Map<string, string>;
  counters: Map<SensitiveKind, number>;
};

type ReplacedText = { text: string; findings: readonly SensitiveDetection[] };
const issuedEvaluations = new WeakSet<object>();

function replacementFor(finding: SensitiveDetection, state: ReplacementState): string {
  const key = `${finding.kind}\u0000${finding.value.normalize("NFC").toLocaleLowerCase("ko-KR")}`;
  const existing = state.values.get(key);
  if (existing) return existing;
  const next = (state.counters.get(finding.kind) ?? 0) + 1;
  state.counters.set(finding.kind, next);
  const replacement = `[${placeholderNames[finding.kind]}_${next}]`;
  state.values.set(key, replacement);
  return replacement;
}

function replaceSensitiveText(source: string, state: ReplacementState): ReplacedText {
  const text = source.normalize("NFC").trim();
  const findings = detectSensitiveText(text);
  let cursor = 0;
  let result = "";
  for (const finding of findings) {
    result += text.slice(cursor, finding.start);
    result += replacementFor(finding, state);
    cursor = finding.end;
  }
  result += text.slice(cursor);
  return { text: result, findings };
}

export function pseudonymizeEvaluation(source: EvaluationInput, audience: EvaluationAudience): PseudonymizedEvaluation {
  const validated = validateEvaluationInput(source, audience);
  const state: ReplacementState = { values: new Map(), counters: new Map() };
  const allFindings: SensitiveDetection[] = [];
  const replace = (value: string) => {
    const replaced = replaceSensitiveText(value, state);
    allFindings.push(...replaced.findings);
    return replaced.text;
  };

  const question = replace(validated.question);
  const answer = replace(validated.answer);
  const targetRole = replace(validated.targetRole);
  const jobCompanyContext = replace(validated.jobCompanyContext);
  const experienceEvidence = validated.experienceEvidence ? replace(validated.experienceEvidence) : undefined;
  const answerSegments = validated.answerSegments.map((segment) => ({ segmentId: segment.segmentId, text: replace(segment.originalText) }));
  const detectedKinds = [...new Set(allFindings.map((finding) => finding.kind))].sort();

  const result = Object.freeze({
    privacyVersion: PRIVACY_CONTRACT_VERSION,
    audience,
    question,
    answer,
    targetRole,
    jobCompanyContext,
    experienceEvidence,
    answerSegments: Object.freeze(answerSegments),
    riskState: classifyBenchmarkEligibility(allFindings),
    detectedKinds: Object.freeze(detectedKinds)
  });
  issuedEvaluations.add(result);
  return result;
}

export function isIssuedPseudonymizedEvaluation(value: PseudonymizedEvaluation): boolean {
  return typeof value === "object" && value !== null && issuedEvaluations.has(value);
}

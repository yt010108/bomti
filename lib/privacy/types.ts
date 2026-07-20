import type { EvaluationAudience } from "../contracts/evaluation";

export const PRIVACY_CONTRACT_VERSION = "bomti_privacy_v1" as const;

export type SensitiveKind =
  | "email"
  | "phone"
  | "resident_id"
  | "account_number"
  | "ip_address"
  | "person_name"
  | "organization"
  | "location"
  | "exact_date"
  | "distinctive_context"
  | "uncertain_identifier";

export type PrivacyRiskState =
  | "eligible"
  | "excluded_direct_identifier"
  | "excluded_distinctive_context"
  | "excluded_uncertain";

export type SensitiveDetection = Readonly<{
  kind: SensitiveKind;
  start: number;
  end: number;
  direct: boolean;
  confidence: "certain" | "uncertain";
  value: string;
}>;

export type SafeSegment = Readonly<{
  segmentId: string;
  text: string;
}>;

export type PseudonymizedEvaluation = Readonly<{
  privacyVersion: typeof PRIVACY_CONTRACT_VERSION;
  audience: EvaluationAudience;
  question: string;
  answer: string;
  targetRole: string;
  jobCompanyContext: string;
  experienceEvidence?: string;
  answerSegments: readonly SafeSegment[];
  riskState: PrivacyRiskState;
  detectedKinds: readonly SensitiveKind[];
}>;

export type BenchmarkEvaluationCopy = Readonly<{
  privacyVersion: typeof PRIVACY_CONTRACT_VERSION;
  question: string;
  answer: string;
  targetRole: string;
  jobCompanyContext: string;
  experienceEvidence?: string;
  answerSegments: readonly SafeSegment[];
}>;

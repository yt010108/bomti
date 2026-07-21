import { randomUUID } from "node:crypto";
import { z } from "zod";

export const BENCHMARK_CONTRACT_VERSION = "bomti_benchmark_v1" as const;
const benchmarkSensitivePattern = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:010|02)[- .]?\d{3,4}[- .]?\d{4}|\b(?:KISA|NCS|SBOM)\b|\b\d{4}-\d{2}-\d{2}\b)/iu;

const questionClasses = ["motivation", "experience", "competency", "problem_solving", "collaboration", "growth_plan", "other_generalized"] as const;
const targetRoleClasses = ["software_engineering", "data_ai", "design", "product_business", "marketing_sales", "operations_support", "other_generalized"] as const;
const provenanceClasses = ["synthetic", "luna_terra", "luna_terra_sol"] as const;
const reviewStatuses = ["synthetic", "pending_review", "reviewed"] as const;
const choices = ["left", "right", "tie", "abstain"] as const;
const pairChoices = ["left", "right", "tie"] as const;
const rationaleCodes = ["context_fit", "specificity", "credibility", "cliche", "tone_readability", "other_reviewed"] as const;
const usefulnessReasonCodes = ["clear_explanation", "useful_evidence", "actionable_improvement", "score_felt_wrong", "evidence_felt_wrong", "not_actionable"] as const;

export const benchmarkRecordSchema = z.object({
  recordId: z.string().uuid(),
  groupId: z.string().uuid(),
  questionClass: z.enum(questionClasses),
  targetRoleClass: z.enum(targetRoleClasses),
  answerSegments: z.array(z.object({ segmentId: z.string().regex(/^s\d{4}$/), text: z.string().min(1).max(2_000) }).strict()).min(1).max(64),
  verdict: z.object({ finalIndex: z.number().int().min(0).max(100), descriptor: z.string().min(1).max(120) }).strict(),
  anonymizationVersion: z.literal("bomti_privacy_v1"),
  provenanceClass: z.enum(provenanceClasses),
  reviewStatus: z.enum(reviewStatuses)
}).strict().superRefine((record, context) => {
  for (const segment of record.answerSegments) {
    if (benchmarkSensitivePattern.test(segment.text)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "benchmark answer segment contains identifying or distinctive content" });
    }
  }
});
export type BenchmarkRecord = z.infer<typeof benchmarkRecordSchema>;

export const benchmarkPairSchema = z.object({
  pairId: z.string().uuid(),
  leftRecordId: z.string().uuid(),
  rightRecordId: z.string().uuid(),
  groupId: z.string().uuid(),
  systemChoice: z.enum(pairChoices)
}).strict().superRefine((pair, context) => {
  if (pair.leftRecordId === pair.rightRecordId) context.addIssue({ code: z.ZodIssueCode.custom, message: "pair records must differ" });
});
export type BenchmarkPair = z.infer<typeof benchmarkPairSchema>;

export const benchmarkRatingSchema = z.object({
  pairId: z.string().uuid(),
  raterAlias: z.string().regex(/^r\d{3}$/),
  choice: z.enum(choices),
  rationaleCodes: z.array(z.enum(rationaleCodes)).max(6)
}).strict();
export type BenchmarkRating = z.infer<typeof benchmarkRatingSchema>;

export const benchmarkUsefulnessSchema = z.object({
  rating: z.number().int().min(1).max(5),
  reasonCode: z.enum(usefulnessReasonCodes)
}).strict();
export type BenchmarkUsefulness = z.infer<typeof benchmarkUsefulnessSchema>;

const forbiddenKeys = /(?:^|_)(?:owner|user|account|evaluation|context_hash|raw(?:_input|_text|_body)?|provider(?:_secret|_token)?|secret|relink)(?:$|_)/i;

function assertNoLinkableKeys(value: unknown, path = "root"): void {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoLinkableKeys(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.test(key)) throw new Error(`BENCHMARK_FORBIDDEN_FIELD:${path}.${key}`);
    assertNoLinkableKeys(child, `${path}.${key}`);
  }
}

function expectedSystemChoice(left: BenchmarkRecord, right: BenchmarkRecord): z.infer<typeof benchmarkPairSchema>["systemChoice"] {
  const difference = Math.abs(left.verdict.finalIndex - right.verdict.finalIndex);
  if (difference <= 5) return "tie";
  return left.verdict.finalIndex > right.verdict.finalIndex ? "left" : "right";
}

export const benchmarkCorpusSchema = z.object({
  contractVersion: z.literal(BENCHMARK_CONTRACT_VERSION),
  records: z.array(benchmarkRecordSchema).min(2),
  pairs: z.array(benchmarkPairSchema).min(1),
  ratings: z.array(benchmarkRatingSchema),
  usefulness: z.array(benchmarkUsefulnessSchema)
}).strict().superRefine((corpus, context) => {
  try {
    assertNoLinkableKeys(corpus);
  } catch (error) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "BENCHMARK_FORBIDDEN_FIELD" });
  }
  const records = new Map(corpus.records.map((record) => [record.recordId, record]));
  if (records.size !== corpus.records.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate record id" });
  const pairIds = new Set<string>();
  const ratingAliases = new Set<string>();
  for (const pair of corpus.pairs) {
    if (pairIds.has(pair.pairId)) context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate pair id" });
    pairIds.add(pair.pairId);
    const left = records.get(pair.leftRecordId);
    const right = records.get(pair.rightRecordId);
    if (!left || !right) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "pair references unknown record" });
      continue;
    }
    if (left.groupId !== pair.groupId || right.groupId !== pair.groupId) context.addIssue({ code: z.ZodIssueCode.custom, message: "pair group must match both records" });
    if (left.questionClass !== right.questionClass || left.targetRoleClass !== right.targetRoleClass) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "pair classes must match" });
    }
    if (left.reviewStatus !== right.reviewStatus) context.addIssue({ code: z.ZodIssueCode.custom, message: "pair review status must match" });
    if (expectedSystemChoice(left, right) !== pair.systemChoice) context.addIssue({ code: z.ZodIssueCode.custom, message: "system choice must use the inclusive 0-5 tie rule" });
  }
  for (const rating of corpus.ratings) {
    if (!pairIds.has(rating.pairId)) context.addIssue({ code: z.ZodIssueCode.custom, message: "rating references unknown pair" });
    const key = `${rating.pairId}:${rating.raterAlias}`;
    if (ratingAliases.has(key)) context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate rater alias for pair" });
    ratingAliases.add(key);
  }
});
export type BenchmarkCorpus = z.infer<typeof benchmarkCorpusSchema>;

export function validateBenchmarkCorpus(source: unknown): BenchmarkCorpus {
  return benchmarkCorpusSchema.parse(source);
}

export function validateOperatorPendingReviewCorpus(source: unknown): BenchmarkCorpus {
  const corpus = validateBenchmarkCorpus(source);
  if (corpus.pairs.length < 20 || corpus.pairs.length > 30) throw new Error("OPERATOR_PAIR_COUNT_REQUIRED");
  if (corpus.records.some((record) => record.reviewStatus !== "pending_review")) throw new Error("OPERATOR_PENDING_REVIEW_REQUIRED");
  return corpus;
}

export function validateReviewedImportCorpus(source: unknown): BenchmarkCorpus {
  const corpus = validateBenchmarkCorpus(source);
  if (corpus.pairs.length < 20 || corpus.pairs.length > 30) throw new Error("OPERATOR_PAIR_COUNT_REQUIRED");
  if (corpus.records.some((record) => record.reviewStatus !== "reviewed")) throw new Error("OPERATOR_REVIEW_REQUIRED");
  return corpus;
}

export function proposeAnonymousPairs(records: readonly BenchmarkRecord[]): BenchmarkPair[] {
  const ordered = [...records].sort((left, right) => left.recordId.localeCompare(right.recordId));
  const proposals: BenchmarkPair[] = [];
  for (let index = 0; index < ordered.length; index += 2) {
    const left = ordered[index];
    const right = ordered[index + 1];
    if (!left || !right) continue;
    if (left.groupId !== right.groupId || left.questionClass !== right.questionClass || left.targetRoleClass !== right.targetRoleClass) continue;
    proposals.push({
      pairId: randomUUID(),
      leftRecordId: left.recordId,
      rightRecordId: right.recordId,
      groupId: left.groupId,
      systemChoice: expectedSystemChoice(left, right)
    });
  }
  return proposals;
}

export const benchmarkReportInputSchema = z.object({
  corpus: benchmarkCorpusSchema,
  eligibleAttempts: z.number().int().nonnegative(),
  completedVerdicts: z.array(z.object({ descriptor: z.string().min(1), finalIndex: z.number().int().min(0).max(100) }).strict()),
  authAttempts: z.array(z.object({ validPrimaryCandidates: z.boolean(), invokedSol: z.boolean() }).strict()),
  requests: z.array(z.object({ passedValidationAndConsent: z.boolean(), terminal: z.string().nullable() }).strict()),
  completedAuthEvaluations: z.number().int().nonnegative()
}).strict();

type Ratio = Readonly<{ numerator: number; denominator: number; missing: number; rate: number | null }>;
function ratio(numerator: number, denominator: number, missing: number): Ratio {
  return { numerator, denominator, missing, rate: denominator === 0 ? null : numerator / denominator };
}

export function strictMajorityChoice(ratings: readonly BenchmarkRating[]): z.infer<typeof benchmarkPairSchema>["systemChoice"] | null {
  const votes = ratings.filter((rating) => rating.choice !== "abstain").map((rating) => rating.choice);
  if (!votes.length) return null;
  const counts = new Map(votes.map((choice) => [choice, votes.filter((vote) => vote === choice).length]));
  const winner = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  return winner && winner[1] > votes.length / 2 ? winner[0] as z.infer<typeof benchmarkPairSchema>["systemChoice"] : null;
}

export function buildBenchmarkReport(source: unknown) {
  const input = benchmarkReportInputSchema.parse(source);
  const ratingsByPair = new Map(input.corpus.pairs.map((pair) => [pair.pairId, input.corpus.ratings.filter((rating) => rating.pairId === pair.pairId)]));
  const curatedPairs = input.corpus.pairs.filter((pair) => {
    const records = input.corpus.records.filter((record) => record.recordId === pair.leftRecordId || record.recordId === pair.rightRecordId);
    return records.every((record) => record.reviewStatus === "synthetic" || record.reviewStatus === "reviewed");
  });
  const choicesByPair = curatedPairs.map((pair) => ({ pair, ratings: ratingsByPair.get(pair.pairId) ?? [] }));
  const observedChoices = choicesByPair.filter(({ ratings }) => strictMajorityChoice(ratings) !== null);
  const agreement = observedChoices.filter(({ pair, ratings }) => strictMajorityChoice(ratings) === pair.systemChoice).length;
  const evaluatorRows = choicesByPair.filter(({ ratings }) => ratings.filter((rating) => rating.choice !== "abstain").length >= 2);
  const evaluatorDisagreement = evaluatorRows.filter(({ ratings }) => new Set(ratings.filter((rating) => rating.choice !== "abstain").map((rating) => rating.choice)).size > 1).length;
  const descriptorCounts: Record<string, number> = {};
  for (const verdict of input.completedVerdicts) descriptorCounts[verdict.descriptor] = (descriptorCounts[verdict.descriptor] ?? 0) + 1;
  const validPrimary = input.authAttempts.filter((attempt) => attempt.validPrimaryCandidates);
  const passedRequests = input.requests.filter((request) => request.passedValidationAndConsent);
  const terminalRequests = passedRequests.filter((request) => request.terminal !== null);
  const failureCounts: Record<string, number> = {};
  for (const request of terminalRequests) {
    if (request.terminal && request.terminal !== "completed") failureCounts[request.terminal] = (failureCounts[request.terminal] ?? 0) + 1;
  }
  const preEligibility = input.requests.filter((request) => !request.passedValidationAndConsent && request.terminal !== null).length;
  const usefulness = input.corpus.usefulness;
  return {
    contractVersion: BENCHMARK_CONTRACT_VERSION,
    pairwiseAgreement: ratio(agreement, observedChoices.length, curatedPairs.length - observedChoices.length),
    evaluatorDisagreement: ratio(evaluatorDisagreement, evaluatorRows.length, curatedPairs.length - evaluatorRows.length),
    descriptorDistribution: { counts: descriptorCounts, ...ratio(input.completedVerdicts.length, input.completedVerdicts.length, Math.max(0, input.eligibleAttempts - input.completedVerdicts.length)) },
    escalationRate: ratio(validPrimary.filter((attempt) => attempt.invokedSol).length, validPrimary.length, input.authAttempts.length - validPrimary.length),
    failureCategories: { counts: failureCounts, preEligibility, ...ratio(Object.values(failureCounts).reduce((total, count) => total + count, 0), passedRequests.length, passedRequests.length - terminalRequests.length) },
    usefulness: { positive: usefulness.filter((entry) => entry.rating >= 4).length, total: usefulness.reduce((total, entry) => total + entry.rating, 0), ...ratio(usefulness.filter((entry) => entry.rating >= 4).length, usefulness.length, Math.max(0, input.completedAuthEvaluations - usefulness.length)) }
  };
}

export function toJsonl(records: readonly BenchmarkRecord[]): string {
  return records.map((record) => JSON.stringify(benchmarkRecordSchema.parse(record))).join("\n");
}

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { descriptorFor, type GuestProjection, type NormalizedVerdict } from "../contracts/verdict-normalized";
import { ApiError, type ApiAudience, requestFingerprint } from "./contract";
import { pseudonymizeEvaluation } from "../privacy/pseudonymize";
import { assertForbiddenStringsAbsent, sanitizeOutbound, toBenchmarkCopy, toHistoryRecord, toProviderPayload } from "../privacy/boundaries";
import { detectSensitiveText } from "../privacy/detect";
import type { PseudonymizedEvaluation } from "../privacy/types";
import type { EvaluationRequest } from "./contract";

type Feedback = Readonly<{ usefulness: number; reasonCode: "helpful" | "unclear" | "inaccurate" | "other"; createdAt: string }>;
type StoredEvaluation = Readonly<{
  id: string;
  owner: string;
  createdAt: string;
  input: ReturnType<typeof toHistoryRecord>;
  verdict: NormalizedVerdict;
  feedback?: Feedback;
}>;
type IdempotencyRecord = { fingerprint: string; state: "in_flight" | "complete"; response?: unknown };

const dimensionNames = ["contextMismatch", "genericityCliche", "credibilityRisk", "specificityGap", "toneReadabilityRisk"] as const;

function deterministicVerdict(input: PseudonymizedEvaluation): NormalizedVerdict {
  const segmentId = input.answerSegments[0]?.segmentId;
  if (!segmentId) throw new ApiError(422, "INPUT_INVALID");
  const dimensions = Object.fromEntries(dimensionNames.map((dimension) => [dimension, 42])) as NormalizedVerdict["dimensions"];
  const explanations = Object.fromEntries(
    dimensionNames.map((dimension) => [dimension, "문맥과 근거를 더 구체적으로 연결해 보세요."])
  ) as NormalizedVerdict["dimensionExplanations"];
  const verdict: NormalizedVerdict = {
    contractVersion: "bomti_index_v1",
    finalIndex: 42,
    descriptor: descriptorFor(42),
    dimensions,
    dimensionExplanations: explanations,
    explanation: "구체적인 상황과 검증 가능한 근거를 보강하면 설득력이 좋아집니다.",
    evidence: [{ segmentId, dimension: "genericityCliche", summary: "추상적인 표현은 구체적인 근거와 함께 제시하세요.", severity: 42 }],
    improvements: [{ dimension: "genericityCliche", direction: "행동과 결과를 한 문장에 연결하세요.", example: "상황, 행동, 결과를 짧게 연결합니다." }],
    fragments: [{ text: input.answerSegments[0].text, purpose: "answer evidence" }],
    criticalFlags: [],
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
  };
  return sanitizeOutbound(verdict).value;
}

export class EvaluationApiService {
  private readonly evaluations = new Map<string, StoredEvaluation>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly guestAttempts = new Set<string>();
  private readonly benchmarkCopies: ReturnType<typeof toBenchmarkCopy>[] = [];
  private providerCalls = 0;

  async create(input: EvaluationRequest, audience: ApiAudience, subject: string, key: string, providerMode?: string | null) {
    const idempotencyKey = `${subject}:${key}`;
    const fingerprint = requestFingerprint(input);
    const existing = this.idempotency.get(idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new ApiError(409, "IDEMPOTENCY_CONFLICT");
      if (audience === "guest") throw new ApiError(409, "GUEST_ATTEMPT_ALREADY_USED");
      if (existing.state === "in_flight") throw new ApiError(409, "EVALUATION_IN_PROGRESS", { retryAfterMs: 1000 });
      return existing.response;
    }
    if (audience === "guest" && this.guestAttempts.has(subject)) throw new ApiError(429, "GUEST_LIMIT");
    if (audience === "authenticated" && [...this.evaluations.values()].filter((record) => record.owner === subject).length >= 3) {
      throw new ApiError(429, "ACCOUNT_LIMIT");
    }
    this.idempotency.set(idempotencyKey, { fingerprint, state: "in_flight" });
    try {
      // Raw input is held only through this transaction. The provider and every stored record receive the issued pseudonymized value.
      const { consent: _consent, ...rawInput } = input;
      const pseudonymized = pseudonymizeEvaluation(rawInput, audience);
      const providerPayload = toProviderPayload(pseudonymized);
      if (providerMode === "unavailable") throw new ApiError(503, audience === "guest" ? "GUEST_PROVIDER_UNAVAILABLE" : "AUTH_PROVIDER_UNAVAILABLE");
      this.providerCalls += 1;
      const verdict = deterministicVerdict(pseudonymized);
      const rawSensitiveValues = [input.question, input.answer, input.targetRole, input.jobCompanyContext, input.experienceEvidence ?? ""]
        .flatMap((value) => detectSensitiveText(value).map((finding) => finding.value));
      assertForbiddenStringsAbsent({ providerPayload, verdict }, rawSensitiveValues);
      if (audience === "guest") {
        this.guestAttempts.add(subject);
        const response = { audience, terminal: "completed", verdict: projectGuest(verdict) };
        this.idempotency.set(idempotencyKey, { fingerprint, state: "complete" });
        return response;
      }
      const id = randomUUID();
      const record: StoredEvaluation = {
        id,
        owner: subject,
        createdAt: new Date().toISOString(),
        input: toHistoryRecord(pseudonymized),
        verdict
      };
      this.evaluations.set(id, record);
      const benchmark = toBenchmarkCopy(pseudonymized);
      if (benchmark) this.benchmarkCopies.push(benchmark);
      const response = { audience, terminal: "completed", evaluation: present(record) };
      this.idempotency.set(idempotencyKey, { fingerprint, state: "complete", response });
      return response;
    } catch (error) {
      this.idempotency.delete(idempotencyKey);
      throw error;
    }
  }

  list(owner: string, cursor: string | null, limit: number) {
    const records = [...this.evaluations.values()]
      .filter((record) => record.owner === owner)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    const start = cursor ? Math.max(0, records.findIndex((record) => record.id === cursor) + 1) : 0;
    if (cursor && start === 0) throw new ApiError(400, "PAGINATION_INVALID");
    const page = records.slice(start, start + limit);
    return { evaluations: page.map(present), nextCursor: records[start + limit]?.id ?? null };
  }

  get(owner: string, id: string) {
    const record = this.evaluations.get(id);
    if (!record || record.owner !== owner) throw new ApiError(404, "EVALUATION_NOT_FOUND");
    return present(record);
  }

  remove(owner: string, id: string) {
    const record = this.evaluations.get(id);
    if (!record || record.owner !== owner) throw new ApiError(404, "EVALUATION_NOT_FOUND");
    this.evaluations.delete(id);
  }

  feedback(owner: string, id: string, value: unknown) {
    const parsed = zFeedback.safeParse(value);
    if (!parsed.success) throw new ApiError(400, "FEEDBACK_INVALID");
    const record = this.evaluations.get(id);
    if (!record || record.owner !== owner) throw new ApiError(404, "EVALUATION_NOT_FOUND");
    const feedback: Feedback = { ...parsed.data, createdAt: new Date().toISOString() };
    this.evaluations.set(id, { ...record, feedback });
    return { feedback };
  }

  usage(owner: string) {
    const consumed = [...this.evaluations.values()].filter((record) => record.owner === owner).length;
    return { allowance: 3, consumed, remaining: Math.max(0, 3 - consumed) };
  }

  deleteAccount(owner: string) {
    for (const [id, record] of this.evaluations) if (record.owner === owner) this.evaluations.delete(id);
    for (const key of this.idempotency.keys()) if (key.startsWith(`${owner}:`)) this.idempotency.delete(key);
  }

  diagnostics() {
    return { providerCalls: this.providerCalls, stored: [...this.evaluations.values()].map((record) => present(record)), benchmarkCopies: this.benchmarkCopies };
  }
}

function projectGuest(verdict: NormalizedVerdict): GuestProjection {
  return {
    contractVersion: verdict.contractVersion,
    finalIndex: verdict.finalIndex,
    descriptor: verdict.descriptor,
    dimensions: verdict.dimensions,
    dimensionExplanations: verdict.dimensionExplanations,
    explanation: verdict.explanation,
    evidence: verdict.evidence.slice(0, 3),
    improvements: verdict.improvements.slice(0, 3)
  };
}

function present(record: StoredEvaluation) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    input: record.input,
    verdict: record.verdict,
    feedback: record.feedback ?? null
  };
}

const zFeedback = z
  .object({ usefulness: z.number().int().min(1).max(5), reasonCode: z.enum(["helpful", "unclear", "inaccurate", "other"]) })
  .strict();

const globalService = globalThis as typeof globalThis & { __bomtiEvaluationApiService?: EvaluationApiService };

export function evaluationApiService(): EvaluationApiService {
  globalService.__bomtiEvaluationApiService ??= new EvaluationApiService();
  return globalService.__bomtiEvaluationApiService;
}

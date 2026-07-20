import { describe, expect, it } from "vitest";
import { validateEvaluationInput } from "../lib/contracts/evaluation";
import { descriptorFor, deepSeekCandidateSchema, validateProviderEvidence } from "../lib/contracts/verdict";
import { dimensionAggregate, dimensionWeights, hybridIndex, projectGuest, requiresSol } from "../lib/judge/score";

const dimensions = Object.fromEntries(
  Object.keys(dimensionWeights).map((dimension) => [
    dimension,
    {
      score: 40,
      explanation: "맥락에 맞는 설명입니다.",
      evidence: [{ segmentId: "s0001", dimension, summary: "근거", severity: 40 }],
      improvement: { dimension, direction: "구체적인 행동을 덧붙이세요.", example: "짧은 예시" }
    }
  ])
) as Record<keyof typeof dimensionWeights, { score: number; explanation: string; evidence: never[]; improvement: never }>;

const candidate = {
  contractVersion: "bomti_index_v1" as const,
  dimensions,
  holisticIndex: 44,
  explanation: "맥락은 있으나 일부 표현이 일반적입니다.",
  evidence: [{ segmentId: "s0001", dimension: "genericityCliche" as const, summary: "일반적 표현", severity: 60 }],
  improvements: [{ dimension: "genericityCliche" as const, direction: "행동을 추가", example: "짧은 예시" }],
  fragments: [],
  criticalFlags: [] as const
};

describe("bomti_index_v1", () => {
  it("normalizes, limits, and segments Korean input by code point", () => {
    const input = validateEvaluationInput(
      { question: "  지원 동기  ", answer: "첫 문장입니다. 둘째 문장입니다.", targetRole: "보안", jobCompanyContext: "공공기관" },
      "guest"
    );
    expect(input.question).toBe("지원 동기");
    expect(input.answerSegments.map((segment) => segment.segmentId)).toEqual(["s0001", "s0002"]);
    expect(() =>
      validateEvaluationInput(
        {
          question: input.question,
          answer: "😀".repeat(1501),
          targetRole: input.targetRole,
          jobCompanyContext: input.jobCompanyContext
        },
        "guest"
      )
    ).toThrow("ANSWER_TOO_LONG");
  });

  it("keeps weights, score direction, boundaries, and escalation deterministic", () => {
    expect(Object.values(dimensionWeights).reduce((total, weight) => total + weight, 0)).toBe(100);
    expect(descriptorFor(24)).toBe("밤티 거의 없음");
    expect(descriptorFor(25)).toBe("살짝 밤티");
    expect(descriptorFor(49)).toBe("살짝 밤티");
    expect(descriptorFor(50)).toBe("꽤 밤티");
    expect(descriptorFor(74)).toBe("꽤 밤티");
    expect(descriptorFor(75)).toBe("밤티 그 자체");
    const parsedCandidate = deepSeekCandidateSchema.parse(candidate);
    const luna = { contractVersion: "bomti_index_v1" as const, dimensions: parsedCandidate.dimensions, criticalFlags: [] };
    const moreRisk = { ...luna, dimensions: { ...luna.dimensions, contextMismatch: { ...luna.dimensions.contextMismatch, score: 80 } } };
    expect(dimensionAggregate(moreRisk)).toBeGreaterThan(dimensionAggregate(luna));
    expect(hybridIndex(luna, parsedCandidate)).toBe(42);
    expect(requiresSol(luna, { ...parsedCandidate, holisticIndex: 56 })).toBe(true);
    expect(requiresSol({ ...luna, criticalFlags: ["fabrication_or_unverifiable_claim"] }, parsedCandidate)).toBe(true);
  });

  it("rejects malformed provider output and projects a guest response without rewrite", () => {
    const parsed = deepSeekCandidateSchema.parse(candidate);
    validateProviderEvidence(parsed, ["s0001"]);
    expect(projectGuest(parsed).evidence).toHaveLength(1);
    expect("fullRewrite" in projectGuest(parsed)).toBe(false);
    expect(() => deepSeekCandidateSchema.parse({ ...candidate, holisticIndex: 130 })).toThrow();
    expect(() => deepSeekCandidateSchema.parse({ ...candidate, explanation: "<script>alert(1)</script>" })).toThrow();
    expect(() => validateProviderEvidence({ ...parsed, evidence: [{ ...parsed.evidence[0], segmentId: "s9999" }] }, ["s0001"])).toThrow(
      "PROVIDER_OUTPUT_INVALID"
    );
    expect(() => deepSeekCandidateSchema.parse({ ...candidate, fullRewrite: "완성 답변" })).toThrow();
  });
});

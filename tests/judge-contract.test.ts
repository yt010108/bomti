import { describe, expect, it } from "vitest";
import { validateEvaluationInput } from "../lib/contracts/evaluation";
import {
  descriptorFor,
  deepSeekCandidateSchema,
  lunaCandidateSchema,
  validateProviderEvidence
} from "../lib/contracts/verdict";
import { dimensionAggregate, dimensionWeights, hybridIndex, projectGuest, requiresSol } from "../lib/judge/score";
import deepSeekFixture from "./fixtures/judge/deepseek.valid.json";

const candidate = deepSeekCandidateSchema.parse(deepSeekFixture);

describe("bomti_index_v1", () => {
  it("normalizes, limits, and segments Korean input by code point", () => {
    // Given / When
    const input = validateEvaluationInput(
      { question: "  지원 동기  ", answer: "첫 문장입니다. 둘째 문장입니다.", targetRole: "보안", jobCompanyContext: "공공기관" },
      "guest"
    );

    // Then
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
    // Given
    const luna = lunaCandidateSchema.parse({
      contractVersion: "bomti_index_v1",
      dimensions: candidate.dimensions,
      criticalFlags: []
    });
    const moreRisk = {
      ...luna,
      dimensions: {
        ...luna.dimensions,
        contextMismatch: { ...luna.dimensions.contextMismatch, score: 80 }
      }
    };

    // When / Then
    expect(Object.values(dimensionWeights).reduce((total, weight) => total + weight, 0)).toBe(100);
    expect(descriptorFor(24)).toBe("밤티 거의 없음");
    expect(descriptorFor(25)).toBe("살짝 밤티");
    expect(descriptorFor(49)).toBe("살짝 밤티");
    expect(descriptorFor(50)).toBe("꽤 밤티");
    expect(descriptorFor(74)).toBe("꽤 밤티");
    expect(descriptorFor(75)).toBe("밤티 그 자체");
    expect(dimensionAggregate(moreRisk)).toBeGreaterThan(dimensionAggregate(luna));
    expect(hybridIndex(luna, candidate)).toBe(36);
    expect(requiresSol(luna, { ...candidate, holisticIndex: 48 })).toBe(true);
    expect(
      requiresSol(
        lunaCandidateSchema.parse({ ...luna, criticalFlags: ["fabrication_or_unverifiable_claim"] }),
        candidate
      )
    ).toBe(true);
  });

  it("rejects malformed provider output and projects a guest response without rewrite", () => {
    // Given
    const parsed = deepSeekCandidateSchema.parse(candidate);

    // When
    validateProviderEvidence(parsed, ["s0001", "s0002"]);

    // Then
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

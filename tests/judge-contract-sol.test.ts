import { describe, expect, it } from "vitest";
import * as verdictContracts from "../lib/contracts/verdict";
import * as judgeScore from "../lib/judge/score";
import {
  lunaCandidateSchema,
  normalizedVerdictSchema,
  providerRequestSchema,
  solCandidateSchema,
  solRequestSchema,
  terraCandidateSchema
} from "../lib/contracts/verdict";
import { buildBaselineVerdict, mergeSolVerdict } from "../lib/judge/score";
import deepSeekFixture from "./fixtures/judge/deepseek.valid.json";
import providerRequestFixture from "./fixtures/judge/provider-request.ko.json";

const luna = lunaCandidateSchema.parse({
  contractVersion: deepSeekFixture.contractVersion,
  dimensions: deepSeekFixture.dimensions,
  criticalFlags: deepSeekFixture.criticalFlags
});
const terra = terraCandidateSchema.parse({
  contractVersion: deepSeekFixture.contractVersion,
  holisticIndex: deepSeekFixture.holisticIndex,
  explanation: deepSeekFixture.explanation,
  evidence: deepSeekFixture.evidence,
  improvements: deepSeekFixture.improvements,
  fragments: deepSeekFixture.fragments,
  criticalFlags: deepSeekFixture.criticalFlags
});
const providerRequest = providerRequestSchema.parse({
  ...providerRequestFixture,
  segments: [
    ...providerRequestFixture.segments,
    { segmentId: "s0002", pseudonymizedText: "측정 가능한 성과를 정리했습니다." }
  ]
});
const solRequestBase = { contractVersion: "bomti_index_v1", request: providerRequest, luna, terra };

describe("bomti_index_v1 Sol adjudication", () => {
  it("exposes the Sol request and disagreement boundaries", () => {
    // Given
    const exportedContracts = verdictContracts;

    // When
    const hasBoundaries =
      "solRequestSchema" in exportedContracts &&
      "solDisagreementSchema" in exportedContracts &&
      "solDecisionSchema" in exportedContracts;

    // Then
    expect(hasBoundaries).toBe(true);
  });

  it("exposes deterministic baseline and Sol merge operations", () => {
    // Given
    const exportedOperations = judgeScore;

    // When
    const hasOperations = "buildBaselineVerdict" in exportedOperations && "mergeSolVerdict" in exportedOperations;

    // Then
    expect(hasOperations).toBe(true);
  });

  it("accepts the exact Sol request with provider request and left-right disagreements", () => {
    // Given
    const source = {
      ...solRequestBase,
      disagreements: [
        {
          fieldPath: "/finalIndex",
          left: "Luna dimension aggregate is 33",
          right: "Terra holistic index is 38"
        }
      ]
    };

    // When
    const result = solRequestSchema.safeParse(source);

    // Then
    expect(result.success).toBe(true);
  });

  it("builds the deterministic Luna and Terra baseline with exact provenance", () => {
    // Given
    const candidates = { luna, terra };

    // When
    const baseline = buildBaselineVerdict(candidates.luna, candidates.terra);

    // Then
    expect(normalizedVerdictSchema.safeParse(baseline).success).toBe(true);
    expect(baseline.finalIndex).toBe(36);
    expect(baseline.descriptor).toBe("살짝 밤티");
    expect(baseline.evidence.map((item) => item.summary)).toEqual([
      "근거 부족",
      "성과 근거가 제한적임",
      "일반적 표현",
      "직무 맥락"
    ]);
    expect(baseline.improvements.map((item) => item.dimension)).toEqual([
      "contextMismatch",
      "genericityCliche",
      "credibilityRisk",
      "specificityGap",
      "specificityGap"
    ]);
    expect(baseline.provenance).toEqual({
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
    });
  });

  it("changes only declared paths and retains sibling provenance", () => {
    // Given
    const baseline = buildBaselineVerdict(luna, terra);
    const request = solRequestSchema.parse({
      ...solRequestBase,
      disagreements: [
        { fieldPath: "/finalIndex", left: "Luna aggregate is 33", right: "Terra index is 38" },
        {
          fieldPath: "/dimensions/contextMismatch",
          left: "Luna context score is 34",
          right: "Terra holistic context differs"
        }
      ]
    });
    const candidate = solCandidateSchema.parse({
      contractVersion: "bomti_index_v1",
      finalIndex: 70,
      dimensions: { ...baseline.dimensions, contextMismatch: 72 },
      explanation: baseline.explanation,
      evidence: baseline.evidence,
      improvements: baseline.improvements,
      fragments: baseline.fragments,
      criticalFlags: baseline.criticalFlags,
      decisions: [
        { fieldPath: "/finalIndex", chosenFrom: "sol", reason: "Balanced adjudicated score" },
        { fieldPath: "/dimensions/contextMismatch", chosenFrom: "sol", reason: "Adjudicated context score" }
      ]
    });

    // When
    const merged = mergeSolVerdict(request, candidate);

    // Then
    expect(merged.finalIndex).toBe(70);
    expect(merged.descriptor).toBe("꽤 밤티");
    expect(merged.dimensions.contextMismatch).toBe(72);
    expect(merged.dimensionExplanations.contextMismatch).toBe(baseline.dimensionExplanations.contextMismatch);
    expect(merged.provenance["/finalIndex"]).toBe("sol");
    expect(merged.provenance["/dimensions/contextMismatch"]).toBe("sol");
    expect(merged.provenance["/dimensionExplanations/contextMismatch"]).toBe("luna");
    expect(merged.provenance["/explanation"]).toBe("terra");
  });

  it("fails closed when a declared disagreement has no decision", () => {
    // Given
    const baseline = buildBaselineVerdict(luna, terra);
    const request = solRequestSchema.parse({
      ...solRequestBase,
      disagreements: [
        { fieldPath: "/finalIndex", left: "Luna aggregate", right: "Terra index" },
        { fieldPath: "/explanation", left: "Luna dimension explanations", right: "Terra explanation" }
      ]
    });
    const candidate = solCandidateSchema.parse({
      contractVersion: "bomti_index_v1",
      finalIndex: 55,
      dimensions: baseline.dimensions,
      explanation: baseline.explanation,
      evidence: baseline.evidence,
      improvements: baseline.improvements,
      fragments: baseline.fragments,
      criticalFlags: baseline.criticalFlags,
      decisions: [{ fieldPath: "/finalIndex", chosenFrom: "sol", reason: "Adjudicated score" }]
    });

    // When / Then
    expect(() => mergeSolVerdict(request, candidate)).toThrow("PROVIDER_OUTPUT_INVALID");
  });

  it("rejects duplicate disagreement and decision paths", () => {
    // Given
    const disagreement = { fieldPath: "/finalIndex", left: "Luna aggregate", right: "Terra index" };
    const decision = { fieldPath: "/finalIndex", chosenFrom: "sol", reason: "Adjudicated score" };

    // When
    const requestResult = solRequestSchema.safeParse({
      ...solRequestBase,
      disagreements: [disagreement, disagreement]
    });
    const candidateResult = solCandidateSchema.safeParse({
      contractVersion: "bomti_index_v1",
      finalIndex: 55,
      dimensions: buildBaselineVerdict(luna, terra).dimensions,
      explanation: terra.explanation,
      evidence: terra.evidence,
      improvements: terra.improvements,
      fragments: terra.fragments,
      criticalFlags: terra.criticalFlags,
      decisions: [decision, decision]
    });

    // Then
    expect(requestResult.success).toBe(false);
    expect(candidateResult.success).toBe(false);
  });

  it("rejects a disagreement whose normalized sides are identical", () => {
    // Given
    const source = {
      ...solRequestBase,
      disagreements: [{ fieldPath: "/finalIndex", left: "cafe\u0301", right: "café" }]
    };

    // When
    const result = solRequestSchema.safeParse(source);

    // Then
    expect(result.success).toBe(false);
  });

  it("fails closed when a decision contradicts its chosen source", () => {
    // Given
    const baseline = buildBaselineVerdict(luna, terra);
    const request = solRequestSchema.parse({
      ...solRequestBase,
      disagreements: [{ fieldPath: "/finalIndex", left: "Luna aggregate", right: "Terra index" }]
    });
    const candidate = solCandidateSchema.parse({
      contractVersion: "bomti_index_v1",
      finalIndex: 70,
      dimensions: baseline.dimensions,
      explanation: baseline.explanation,
      evidence: baseline.evidence,
      improvements: baseline.improvements,
      fragments: baseline.fragments,
      criticalFlags: baseline.criticalFlags,
      decisions: [{ fieldPath: "/finalIndex", chosenFrom: "terra", reason: "Use the holistic score" }]
    });

    // When / Then
    expect(() => mergeSolVerdict(request, candidate)).toThrow("PROVIDER_OUTPUT_INVALID");
  });

  it("fails closed when Sol changes an undeclared path", () => {
    // Given
    const baseline = buildBaselineVerdict(luna, terra);
    const request = solRequestSchema.parse({
      ...solRequestBase,
      disagreements: [{ fieldPath: "/finalIndex", left: "Luna aggregate", right: "Terra index" }]
    });
    const candidate = solCandidateSchema.parse({
      contractVersion: "bomti_index_v1",
      finalIndex: 60,
      dimensions: baseline.dimensions,
      explanation: "Undeclared replacement explanation",
      evidence: baseline.evidence,
      improvements: baseline.improvements,
      fragments: baseline.fragments,
      criticalFlags: baseline.criticalFlags,
      decisions: [{ fieldPath: "/finalIndex", chosenFrom: "sol", reason: "Adjudicated score" }]
    });

    // When / Then
    expect(() => mergeSolVerdict(request, candidate)).toThrow("PROVIDER_OUTPUT_INVALID");
  });
});

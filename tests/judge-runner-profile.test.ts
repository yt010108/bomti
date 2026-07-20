import { describe, expect, it } from "vitest";
import { deepSeekCandidateSchema, validateProviderEvidence } from "../lib/contracts/verdict";
import judgeFixture from "../scripts/verification/fixtures/judge-contract.json";

const profile = process.env.BOMTI_JUDGE_PROFILE;

describe("judge runner profile fixture", () => {
  it.runIf(profile === "contract-korean")("accepts the valid contract fixture", () => {
    // Given: a synthetic candidate with one valid segment ID.
    const candidate = deepSeekCandidateSchema.parse(judgeFixture.candidate);

    // When: provider evidence is checked against the fixture segments.
    validateProviderEvidence(candidate, judgeFixture.validSegmentIds);

    // Then: the candidate remains a bounded v1 contract.
    expect(candidate.contractVersion).toBe("bomti_index_v1");
    expect(Object.keys(candidate.dimensions)).toHaveLength(5);
    expect(candidate.evidence).toHaveLength(1);
  });

  it.runIf(profile === "malformed-score-script-segment")("rejects every mutation in the malformed fixture", () => {
    // Given: score, provider text, and segment mutations loaded from the named invalid fixture.
    const scoreMutation = { ...judgeFixture.candidate, holisticIndex: judgeFixture.invalid.holisticIndex };
    const textMutation = { ...judgeFixture.candidate, explanation: judgeFixture.invalid.explanation };
    const segmentMutation = {
      ...judgeFixture.candidate,
      evidence: [{ ...judgeFixture.candidate.evidence[0], segmentId: judgeFixture.invalid.segmentId }]
    };

    // When: every mutation crosses the real schema or evidence validator.
    const validSegmentMutation = deepSeekCandidateSchema.parse(segmentMutation);

    // Then: all three invalid conditions are rejected rather than manufactured by the runner.
    expect(() => deepSeekCandidateSchema.parse(scoreMutation)).toThrow();
    expect(() => deepSeekCandidateSchema.parse(textMutation)).toThrow();
    expect(() => validateProviderEvidence(validSegmentMutation, judgeFixture.validSegmentIds)).toThrow(
      "PROVIDER_OUTPUT_INVALID"
    );
  });
});

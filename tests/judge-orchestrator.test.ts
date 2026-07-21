import { describe, expect, it } from "vitest";
import {
  deepSeekCandidateSchema,
  lunaCandidateSchema,
  providerRequestSchema,
  solCandidateSchema,
  terraCandidateSchema,
  type DeepSeekCandidate,
  type LunaCandidate,
  type ProviderRequest,
  type SolCandidate,
  type TerraCandidate
} from "../lib/contracts/verdict";
import { ProviderError, type ProviderCallOptions, type ProviderCallResult, type ProviderRole } from "../lib/providers";
import { JudgeOrchestrator, type JudgeAdapters, type JudgeSettlement } from "../lib/judge/orchestrator";
import { buildBaselineVerdict, dimensionAggregate } from "../lib/judge/score";
import deepSeekFixture from "./fixtures/judge/deepseek.valid.json";

const profile = process.env.BOMTI_JUDGE_PROFILE;
const deepSeek = deepSeekCandidateSchema.parse(deepSeekFixture);
const luna = lunaCandidateSchema.parse({
  contractVersion: deepSeek.contractVersion,
  dimensions: deepSeek.dimensions,
  criticalFlags: deepSeek.criticalFlags
});
const terra = terraCandidateSchema.parse({
  contractVersion: deepSeek.contractVersion,
  holisticIndex: deepSeek.holisticIndex,
  explanation: deepSeek.explanation,
  evidence: deepSeek.evidence,
  improvements: deepSeek.improvements,
  fragments: deepSeek.fragments,
  criticalFlags: deepSeek.criticalFlags
});
const request = providerRequestSchema.parse({
  contractVersion: "bomti_index_v1",
  locale: "ko",
  question: "지원 동기를 설명해 주세요.",
  targetRole: "보안 엔지니어",
  jobCompanyContext: "공공 보안 서비스를 운영하는 조직",
  experienceEvidence: "사건 대응 경험을 정리했습니다.",
  segments: [
    { segmentId: "s0001", pseudonymizedText: "협업 경험을 정리했습니다." },
    { segmentId: "s0002", pseudonymizedText: "처리 시간을 줄였습니다." }
  ]
});

type Candidate = DeepSeekCandidate | LunaCandidate | TerraCandidate | SolCandidate;
type Adapter<C extends Candidate> = {
  readonly calls: number;
  readonly adapter: { evaluate(input: unknown, options: ProviderCallOptions): Promise<ProviderCallResult<C>> };
};

function accepted<C extends Candidate>(role: ProviderRole, candidate: C, cost = 440n): ProviderCallResult<C> {
  return {
    role,
    providerId: role === "guest" ? "opencode" : "openai",
    configuredModelId: `fixture-${role}-configured`,
    resolvedModelId: `fixture-${role}-resolved`,
    providerRequestId: `fixture-${role}-request`,
    clientCorrelationId: `fixture-${role}-correlation`,
    acceptance: "accepted",
    candidate,
    cost: {
      inputTokens: 200,
      outputTokens: 40,
      pricingVersion: "fixture-pricing-v1",
      inputMicrosPerMillion: 1_000_000n,
      outputMicrosPerMillion: 6_000_000n,
      acceptedCostMicros: cost
    }
  };
}

function adapter<C extends Candidate>(operation: () => Promise<ProviderCallResult<C>>): Adapter<C> {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    adapter: {
      async evaluate(_input: unknown, _options: ProviderCallOptions) {
        calls += 1;
        return operation();
      }
    }
  };
}

function adapters(overrides: Partial<JudgeAdapters> = {}) {
  const guest = adapter(async () => accepted("guest", deepSeek, 0n));
  const lunaAdapter = adapter(async () => accepted("luna", luna));
  const terraAdapter = adapter(async () => accepted("terra", terra));
  const sol = adapter(async () => accepted("sol", solCandidate(luna, terra)));
  return {
    guest,
    luna: lunaAdapter,
    terra: terraAdapter,
    sol,
    value: {
      guest: guest.adapter,
      luna: lunaAdapter.adapter,
      terra: terraAdapter.adapter,
      sol: sol.adapter,
      ...overrides
    } as JudgeAdapters
  };
}

function solCandidate(sourceLuna: LunaCandidate, sourceTerra: TerraCandidate): SolCandidate {
  const baseline = buildBaselineVerdict(sourceLuna, sourceTerra);
  const scoreDisagreement = Math.abs(dimensionAggregate(sourceLuna) - sourceTerra.holisticIndex) >= 15;
  const criticalDisagreement =
    sourceLuna.criticalFlags.includes("fabrication_or_unverifiable_claim") !==
    sourceTerra.criticalFlags.includes("fabrication_or_unverifiable_claim");
  return solCandidateSchema.parse({
    contractVersion: "bomti_index_v1",
    finalIndex: scoreDisagreement ? 58 : baseline.finalIndex,
    dimensions: baseline.dimensions,
    explanation: baseline.explanation,
    evidence: baseline.evidence,
    improvements: baseline.improvements,
    fragments: baseline.fragments,
    criticalFlags: baseline.criticalFlags,
    decisions: [
      ...(scoreDisagreement
        ? [{ fieldPath: "/finalIndex" as const, chosenFrom: "sol" as const, reason: "Adjudicated score" }]
        : []),
      ...(criticalDisagreement
        ? [{ fieldPath: "/criticalFlags" as const, chosenFrom: "sol" as const, reason: "Adjudicated critical flags" }]
        : [])
    ]
  });
}

function authenticatedInput(idempotencyKey: string, allowSol = true) {
  return { idempotencyKey, audience: "authenticated" as const, request, allowSol };
}

describe("hybrid Judge orchestrator", () => {
  it.runIf(profile === "no-escalation-and-sol")("runs Luna and Terra independently, uses the baseline when no escalation is required, and settles once", async () => {
    const source = adapters();
    const settlements: JudgeSettlement[] = [];
    const orchestrator = new JudgeOrchestrator(source.value, (settlement) => {
      settlements.push(settlement);
    });

    const result = await orchestrator.run(authenticatedInput("judge-no-escalation-0001"));

    expect(result).toMatchObject({ status: "completed", terminal: "completed", allowance: "consume" });
    if (result.status === "completed") {
      expect(result.verdict.finalIndex).toBe(buildBaselineVerdict(luna, terra).finalIndex);
      expect(result.costs.map((cost) => cost.role)).toEqual(["luna", "terra"]);
    }
    expect(source.luna.calls).toBe(1);
    expect(source.terra.calls).toBe(1);
    expect(source.sol.calls).toBe(0);
    expect(settlements).toHaveLength(1);
  });

  it.runIf(profile === "no-escalation-and-sol")("escalates for a 15-point difference and for a critical-flag disagreement", async () => {
    const divergentTerra = terraCandidateSchema.parse({ ...terra, holisticIndex: Math.min(100, Math.round(terra.holisticIndex + 20)) });
    const scoreSol = adapter(async () => accepted("sol", solCandidate(luna, divergentTerra)));
    const scoreSource = adapters({
      terra: adapter(async () => accepted("terra", divergentTerra)).adapter,
      sol: scoreSol.adapter
    });
    const scoreResult = await new JudgeOrchestrator(scoreSource.value).run(authenticatedInput("judge-score-escalation-001"));
    expect(scoreResult).toMatchObject({ status: "completed", terminal: "completed" });
    expect(scoreSol.calls).toBe(1);

    const flaggedLuna = lunaCandidateSchema.parse({ ...luna, criticalFlags: ["fabrication_or_unverifiable_claim"] });
    const flagSource = adapters({
      luna: adapter(async () => accepted("luna", flaggedLuna)).adapter,
      sol: adapter(async () => accepted("sol", solCandidate(flaggedLuna, terra))).adapter
    });
    const flagResult = await new JudgeOrchestrator(flagSource.value).run(authenticatedInput("judge-flag-escalation-0002"));
    expect(flagResult).toMatchObject({ status: "completed", terminal: "completed" });
  });

  it.runIf(profile === "resume-after-terra-sol-capped")("fails closed and refunds the account allowance when Sol is capped or unavailable", async () => {
    const divergentTerra = terraCandidateSchema.parse({ ...terra, holisticIndex: Math.min(100, Math.round(terra.holisticIndex + 20)) });
    const source = adapters({ terra: adapter(async () => accepted("terra", divergentTerra)).adapter });
    const result = await new JudgeOrchestrator(source.value).run(authenticatedInput("judge-sol-capped-0000001", false));

    expect(result).toMatchObject({
      status: "terminal",
      terminal: "failed_needs_adjudication",
      code: "ADJUDICATION_REQUIRED",
      allowance: "refund"
    });
    expect("verdict" in result).toBe(false);
    expect(source.sol.calls).toBe(0);

    const unavailableSol = adapter<SolCandidate>(async () => {
      throw new ProviderError("AUTH_PROVIDER_UNAVAILABLE", "sol", "not_accepted", false);
    });
    const unavailableSource = adapters({
      terra: adapter(async () => accepted("terra", divergentTerra)).adapter,
      sol: unavailableSol.adapter
    });
    const unavailable = await new JudgeOrchestrator(unavailableSource.value).run(authenticatedInput("judge-sol-unavailable-01"));
    expect(unavailable).toMatchObject({
      status: "terminal",
      terminal: "failed_needs_adjudication",
      code: "ADJUDICATION_REQUIRED",
      allowance: "refund"
    });
    expect(unavailableSol.calls).toBe(1);
  });

  it.runIf(profile === "resume-after-terra-sol-capped")("retains accepted partial provider cost, refunds allowance, and never returns a partial verdict", async () => {
    const failedTerra = adapter<TerraCandidate>(async () => {
      throw new ProviderError("AUTH_PROVIDER_UNAVAILABLE", "terra", "not_accepted", false);
    });
    const source = adapters({ terra: failedTerra.adapter });
    const result = await new JudgeOrchestrator(source.value).run(authenticatedInput("judge-partial-cost-000001"));

    expect(result).toMatchObject({ status: "terminal", terminal: "failed_refunded", allowance: "refund" });
    expect("verdict" in result).toBe(false);
    if (result.status === "terminal") {
      expect(result.costs).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: "luna", outcome: "accepted", acceptedCostMicros: 440n }),
        expect.objectContaining({ role: "terra", outcome: "rejected" })
      ]));
    }
  });

  it.runIf(profile === "resume-after-terra-sol-capped")("rejects invalid evidence while keeping accepted cost and rescans provider text before returning it", async () => {
    const invalidTerra = terraCandidateSchema.parse({
      ...terra,
      evidence: [{ ...terra.evidence[0], segmentId: "s9999" }]
    });
    const invalidSource = adapters({ terra: adapter(async () => accepted("terra", invalidTerra)).adapter });
    const invalid = await new JudgeOrchestrator(invalidSource.value).run(authenticatedInput("judge-invalid-output-0001"));
    expect(invalid).toMatchObject({ status: "terminal", terminal: "provider_output_invalid", allowance: "refund" });
    if (invalid.status === "terminal") {
      expect(invalid.costs).toEqual(expect.arrayContaining([expect.objectContaining({ role: "terra", outcome: "accepted" })]));
    }

    const divergentTerra = terraCandidateSchema.parse({ ...terra, holisticIndex: Math.min(100, Math.round(terra.holisticIndex + 20)) });
    const invalidSol = adapter(async () => accepted("sol", {
      ...solCandidate(luna, divergentTerra),
      decisions: []
    } as unknown as SolCandidate));
    const invalidSolSource = adapters({
      terra: adapter(async () => accepted("terra", divergentTerra)).adapter,
      sol: invalidSol.adapter
    });
    const invalidSolResult = await new JudgeOrchestrator(invalidSolSource.value).run(authenticatedInput("judge-invalid-sol-output-01"));
    expect(invalidSolResult).toMatchObject({ status: "terminal", terminal: "provider_output_invalid", allowance: "refund" });
    if (invalidSolResult.status === "terminal") {
      expect(invalidSolResult.costs).toEqual(expect.arrayContaining([expect.objectContaining({ role: "sol", outcome: "accepted" })]));
    }

    const piiTerra = terraCandidateSchema.parse({ ...terra, explanation: "model@example.com may be contacted" });
    const piiSource = adapters({ terra: adapter(async () => accepted("terra", piiTerra)).adapter });
    const piiResult = await new JudgeOrchestrator(piiSource.value).run(authenticatedInput("judge-output-rescan-00001"));
    expect(piiResult).toMatchObject({ status: "completed" });
    if (piiResult.status === "completed") {
      expect(piiResult.verdict.explanation).not.toContain("model@example.com");
      expect(piiResult.redactedKinds).toContain("email");
    }
  });

  it.runIf(profile === "resume-after-terra-sol-capped")("deduplicates in-flight and completed authenticated runs and never re-exposes a guest verdict", async () => {
    let releaseLuna: (() => void) | undefined;
    const heldLuna = adapter(async () => {
      await new Promise<void>((resolve) => {
        releaseLuna = resolve;
      });
      return accepted("luna", luna);
    });
    const source = adapters({ luna: heldLuna.adapter });
    const orchestrator = new JudgeOrchestrator(source.value);
    const first = orchestrator.run(authenticatedInput("judge-resume-duplicate-01"));
    const duplicate = await orchestrator.run(authenticatedInput("judge-resume-duplicate-01"));
    expect(duplicate).toEqual({ status: "in_flight", code: "EVALUATION_IN_PROGRESS", retryAfterMs: 1000 });
    releaseLuna?.();
    const completed = await first;
    const resumed = await orchestrator.run(authenticatedInput("judge-resume-duplicate-01"));
    expect(resumed).toEqual(completed);
    expect(heldLuna.calls).toBe(1);

    const guestSource = adapters();
    const guestOrchestrator = new JudgeOrchestrator(guestSource.value);
    const guest = await guestOrchestrator.run({ idempotencyKey: "judge-guest-duplicate-0001", audience: "guest", request });
    const guestRetry = await guestOrchestrator.run({ idempotencyKey: "judge-guest-duplicate-0001", audience: "guest", request });
    expect(guest).toMatchObject({ status: "completed" });
    expect(guestRetry).toMatchObject({ status: "terminal", code: "GUEST_ATTEMPT_ALREADY_USED" });
    expect("verdict" in guestRetry).toBe(false);
    expect(guestSource.guest.calls).toBe(1);
  });
});

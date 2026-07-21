import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { DeepSeekCandidate, LunaCandidate, TerraCandidate } from "../lib/contracts/verdict-candidates";
import type { ProviderRequest } from "../lib/contracts/verdict-shared";
import type { SolCandidate, SolRequest } from "../lib/contracts/verdict-sol";
import {
  DeterministicProviderTransport,
  loadProviderConfiguration,
  OpenAIResponsesAdapter,
  OpenCodeGuestAdapter,
  ProviderError,
  providerLimits,
  type ProviderRole,
  type ProviderRoleConfiguration
} from "../lib/providers";
import deepSeekFixture from "./fixtures/judge/deepseek.valid.json";

const execFileAsync = promisify(execFile);
const profile = process.env.BOMTI_PROVIDER_PROFILE;
const captureOut = process.env.BOMTI_PROVIDER_CAPTURE_OUT;
const candidate = deepSeekFixture as DeepSeekCandidate;
const request: ProviderRequest = {
  contractVersion: "bomti_index_v1",
  locale: "ko",
  question: "지원 동기를 알려 주세요.",
  targetRole: "보안 엔지니어",
  jobCompanyContext: "공공 서비스를 운영하는 조직",
  experienceEvidence: "장애 대응 훈련을 진행했습니다.",
  segments: [
    { segmentId: "s0001", pseudonymizedText: "훈련 절차를 정리했습니다." },
    { segmentId: "s0002", pseudonymizedText: "처리 시간을 줄였습니다." }
  ]
};
const luna: LunaCandidate = {
  contractVersion: "bomti_index_v1",
  dimensions: candidate.dimensions,
  criticalFlags: candidate.criticalFlags
};
const terra: TerraCandidate = {
  contractVersion: "bomti_index_v1",
  holisticIndex: candidate.holisticIndex,
  explanation: candidate.explanation,
  evidence: candidate.evidence,
  improvements: candidate.improvements,
  fragments: candidate.fragments,
  criticalFlags: candidate.criticalFlags
};
const solRequest: SolRequest = {
  contractVersion: "bomti_index_v1",
  request,
  luna,
  terra,
  disagreements: [{ fieldPath: "/finalIndex", left: "36", right: "52" }]
};
const sol: SolCandidate = {
  contractVersion: "bomti_index_v1",
  finalIndex: 42,
  dimensions: Object.fromEntries(
    Object.entries(candidate.dimensions).map(([name, assessment]) => [name, assessment.score])
  ) as SolCandidate["dimensions"],
  explanation: candidate.explanation,
  evidence: candidate.evidence,
  improvements: candidate.improvements,
  fragments: candidate.fragments,
  criticalFlags: candidate.criticalFlags,
  decisions: [{ fieldPath: "/finalIndex", chosenFrom: "sol", reason: "두 평가의 차이를 조정했습니다." }]
};

function configuration(role: ProviderRole): ProviderRoleConfiguration {
  return {
    role,
    providerId: role === "guest" ? "opencode" : "openai",
    apiBaseUrl: role === "guest" ? "https://fixture.opencode.test/v1" : "https://fixture.openai.test/v1",
    apiKey: role === "guest" ? "test-opencode-secret" : "test-openai-secret",
    modelId: `fixture-${role}-model-v1`,
    pricingVersion: "fixture-pricing-v1",
    inputMicrosPerMillion: role === "guest" ? 0n : 1_000_000n,
    outputMicrosPerMillion: role === "guest" ? 0n : 6_000_000n,
    limits: providerLimits[role]
  };
}

function openCodeResponse(body: unknown = candidate) {
  return {
    status: 200,
    headers: { "x-request-id": "fallback-guest-request" },
    body: {
      id: "guest-request-1",
      model: "fixture-guest-model-v1",
      choices: [{ message: { content: JSON.stringify(body) } }],
      usage: { prompt_tokens: 101, completion_tokens: 29 }
    }
  };
}

function openAiResponse(role: "luna" | "terra" | "sol", body: unknown) {
  return {
    status: 200,
    headers: { "x-request-id": `fallback-${role}-request` },
    body: {
      id: `${role}-request-1`,
      model: `fixture-${role}-model-v1`,
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(body) }] }],
      usage: { input_tokens: 200, output_tokens: 40 }
    }
  };
}

function configuredEnvironment(overrides: Record<string, string> = {}) {
  return {
    OPENCODE_API_BASE_URL: "https://fixture.opencode.test/v1",
    OPENCODE_API_KEY: "test-opencode-secret",
    OPENCODE_GUEST_MODEL: "fixture-guest-model-v1",
    OPENAI_API_KEY: "test-openai-secret",
    OPENAI_LUNA_MODEL: "fixture-luna-model-v1",
    OPENAI_TERRA_MODEL: "fixture-terra-model-v1",
    OPENAI_SOL_MODEL: "fixture-sol-model-v1",
    PROVIDER_PRICING_VERSION: "fixture-pricing-v1",
    OPENCODE_GUEST_INPUT_USD_MICROS_PER_MILLION: "0",
    OPENCODE_GUEST_OUTPUT_USD_MICROS_PER_MILLION: "0",
    OPENAI_LUNA_INPUT_USD_MICROS_PER_MILLION: "1000000",
    OPENAI_LUNA_OUTPUT_USD_MICROS_PER_MILLION: "6000000",
    OPENAI_TERRA_INPUT_USD_MICROS_PER_MILLION: "2500000",
    OPENAI_TERRA_OUTPUT_USD_MICROS_PER_MILLION: "15000000",
    OPENAI_SOL_INPUT_USD_MICROS_PER_MILLION: "5000000",
    OPENAI_SOL_OUTPUT_USD_MICROS_PER_MILLION: "30000000",
    PAID_INFERENCE_ENABLED: "true",
    PAID_MONTHLY_BUDGET_USD_CENTS: "1000",
    ...overrides
  };
}

async function writeSnapshot(payload: unknown) {
  if (!captureOut) return;
  await mkdir(captureOut, { recursive: true });
  await writeFile(path.join(captureOut, "provider-snapshot.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

describe("normalized provider adapters", () => {
  it("uses the exact role ceilings and disables paid evaluation unless every model is configured", () => {
    expect(providerLimits).toEqual({
      guest: { inputTokens: 12_000, outputTokens: 1_500, timeoutMs: 15_000, reasoningEffort: "none" },
      luna: { inputTokens: 24_000, outputTokens: 1_800, timeoutMs: 30_000, reasoningEffort: "medium" },
      terra: { inputTokens: 24_000, outputTokens: 1_800, timeoutMs: 30_000, reasoningEffort: "high" },
      sol: { inputTokens: 16_000, outputTokens: 2_200, timeoutMs: 45_000, reasoningEffort: "high" }
    });
    expect(loadProviderConfiguration(configuredEnvironment()).paidEvaluationEnabled).toBe(true);
    expect(loadProviderConfiguration(configuredEnvironment({ OPENAI_SOL_MODEL: "" })).paidEvaluationEnabled).toBe(false);
  });

  it("retries once only when transport proves non-acceptance", async () => {
    const safeRetry = new DeterministicProviderTransport([
      { kind: "error", error: { kind: "connection_refused", acceptance: "not_accepted" } },
      { kind: "response", response: openCodeResponse() }
    ]);
    await new OpenCodeGuestAdapter(configuration("guest"), safeRetry).evaluate(request, { clientCorrelationId: "corr-safe" });
    expect(safeRetry.requests).toHaveLength(2);

    const ambiguous = new DeterministicProviderTransport([
      { kind: "error", error: { kind: "timeout", acceptance: "possibly_accepted" } },
      { kind: "response", response: openCodeResponse() }
    ]);
    await expect(new OpenCodeGuestAdapter(configuration("guest"), ambiguous).evaluate(request, { clientCorrelationId: "corr-ambiguous" }))
      .rejects.toMatchObject({ code: "ADJUDICATION_REQUIRED", acceptance: "possibly_accepted" });
    expect(ambiguous.requests).toHaveLength(1);

    const cancelled = new DeterministicProviderTransport([
      { kind: "error", error: { kind: "cancelled", acceptance: "not_accepted" } },
      { kind: "response", response: openCodeResponse() }
    ]);
    await expect(new OpenCodeGuestAdapter(configuration("guest"), cancelled).evaluate(request, { clientCorrelationId: "corr-cancel" }))
      .rejects.toMatchObject({ code: "REQUEST_CANCELLED", acceptance: "not_accepted" });
    expect(cancelled.requests).toHaveLength(1);
  });

  it("rejects malformed and range-invalid accepted output without retry", async () => {
    const malformed = new DeterministicProviderTransport([{ kind: "response", response: openCodeResponse({ ...candidate, holisticIndex: 101 }) }]);
    await expect(new OpenCodeGuestAdapter(configuration("guest"), malformed).evaluate(request, { clientCorrelationId: "corr-invalid" }))
      .rejects.toMatchObject({ code: "PROVIDER_OUTPUT_INVALID", acceptance: "accepted" });
    expect(malformed.requests).toHaveLength(1);
  });

  it("rejects invalid or over-ceiling input before any provider call", async () => {
    const invalidTransport = new DeterministicProviderTransport([{ kind: "response", response: openCodeResponse() }]);
    const invalidInput = { ...request, segments: [{ segmentId: "bad", pseudonymizedText: "text" }] };
    await expect(new OpenCodeGuestAdapter(configuration("guest"), invalidTransport).evaluate(
      invalidInput as unknown as ProviderRequest,
      { clientCorrelationId: "corr-input-invalid" }
    )).rejects.toMatchObject({ code: "PROVIDER_INPUT_INVALID", acceptance: "not_accepted" });
    expect(invalidTransport.requests).toHaveLength(0);

    const ceilingTransport = new DeterministicProviderTransport([{ kind: "response", response: openCodeResponse() }]);
    const ceilingConfiguration = { ...configuration("guest"), limits: { ...providerLimits.guest, inputTokens: 100 } };
    await expect(new OpenCodeGuestAdapter(ceilingConfiguration, ceilingTransport).evaluate(
      request,
      { clientCorrelationId: "corr-input-ceiling" }
    )).rejects.toMatchObject({ code: "PROVIDER_INPUT_LIMIT_EXCEEDED", acceptance: "not_accepted" });
    expect(ceilingTransport.requests).toHaveLength(0);
  });

  it.runIf(profile === "deepseek-luna-terra-sol-valid")(
    "normalizes guest, Luna, Terra, and Sol outputs with cost metadata",
    async () => {
      const guestTransport = new DeterministicProviderTransport([{ kind: "response", response: openCodeResponse() }]);
      const lunaTransport = new DeterministicProviderTransport([{ kind: "response", response: openAiResponse("luna", luna) }]);
      const terraTransport = new DeterministicProviderTransport([{ kind: "response", response: openAiResponse("terra", terra) }]);
      const solTransport = new DeterministicProviderTransport([{ kind: "response", response: openAiResponse("sol", sol) }]);
      const results = await Promise.all([
        new OpenCodeGuestAdapter(configuration("guest"), guestTransport).evaluate(request, { clientCorrelationId: "corr-guest" }),
        new OpenAIResponsesAdapter("luna", configuration("luna"), lunaTransport).evaluate(request, { clientCorrelationId: "corr-luna" }),
        new OpenAIResponsesAdapter("terra", configuration("terra"), terraTransport).evaluate(request, { clientCorrelationId: "corr-terra" }),
        new OpenAIResponsesAdapter("sol", configuration("sol"), solTransport).evaluate(solRequest, { clientCorrelationId: "corr-sol" })
      ]);
      expect(results.map((result) => result.resolvedModelId)).toEqual([
        "fixture-guest-model-v1", "fixture-luna-model-v1", "fixture-terra-model-v1", "fixture-sol-model-v1"
      ]);
      expect(results.map((result) => result.cost.acceptedCostMicros)).toEqual([0n, 440n, 440n, 440n]);
      const paidBodies = [lunaTransport, terraTransport, solTransport].map((transport) => transport.requests[0].body as Record<string, unknown>);
      expect(paidBodies.map((body) => (body.reasoning as { effort: string }).effort)).toEqual(["medium", "high", "high"]);
      expect(paidBodies.map((body) => body.max_output_tokens)).toEqual([1_800, 1_800, 2_200]);
      await writeSnapshot({
        profile,
        models: results.map((result) => ({ role: result.role, configured: result.configuredModelId, resolved: result.resolvedModelId })),
        costs: results.map((result) => ({ role: result.role, acceptedCostMicros: result.cost.acceptedCostMicros.toString() })),
        requests: [guestTransport, lunaTransport, terraTransport, solTransport].map((transport) => ({
          url: transport.requests[0].url,
          timeoutMs: transport.requests[0].timeoutMs,
          bodyModel: (transport.requests[0].body as { model: string }).model
        }))
      });
    }
  );

  it.runIf(profile === "opencode-429-sol-missing")(
    "fails closed on OpenCode 429 and missing Sol without a substitute call",
    async () => {
      const outage = new DeterministicProviderTransport([{ kind: "response", response: { status: 429, headers: {}, body: { error: "redacted" } } }]);
      let failure: ProviderError | null = null;
      try {
        await new OpenCodeGuestAdapter(configuration("guest"), outage).evaluate(request, { clientCorrelationId: "corr-429" });
      } catch (error) {
        failure = error as ProviderError;
      }
      const configurationState = loadProviderConfiguration(configuredEnvironment({ OPENAI_SOL_MODEL: "" }));
      expect(failure).toMatchObject({ code: "GUEST_PROVIDER_UNAVAILABLE", acceptance: "not_accepted" });
      expect(configurationState.paidEvaluationEnabled).toBe(false);
      expect(outage.requests).toHaveLength(1);
      await writeSnapshot({
        profile,
        guestCode: failure?.code,
        guestAcceptance: failure?.acceptance,
        paidEvaluationEnabled: configurationState.paidEvaluationEnabled,
        substituteCalls: 0,
        guestCalls: outage.requests.length
      });
    }
  );
});

describe("provider capability preflight", () => {
  it("records stable configured IDs and redacts keys", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "bomti-provider-preflight-"));
    const catalogPath = path.join(temporary, "catalog.json");
    const outputPath = path.join(temporary, "out");
    await writeFile(catalogPath, JSON.stringify({
      opencode: { "fixture-guest-model-v1": { id: "fixture-guest-model-v1", capabilities: ["chat_completions", "structured_outputs"] } },
      openai: {
        "fixture-luna-model-v1": { id: "fixture-luna-model-v1", capabilities: ["responses", "structured_outputs"] },
        "fixture-terra-model-v1": { id: "fixture-terra-model-v1", capabilities: ["responses", "structured_outputs"] },
        "fixture-sol-model-v1": { id: "fixture-sol-model-v1", capabilities: ["responses", "structured_outputs"] }
      }
    }));
    await execFileAsync(process.execPath, [
      "scripts/preflight/providers.mjs", `--catalog=${catalogPath}`, `--out=${outputPath}`, "--sha=test-sha"
    ], { cwd: process.cwd(), env: { ...process.env, ...configuredEnvironment() } });
    const receipt = await readFile(path.join(outputPath, "result.json"), "utf8");
    expect(receipt).toContain('"verdict": "pass"');
    expect(receipt).toContain("fixture-sol-model-v1");
    expect(receipt).not.toContain("test-openai-secret");
    expect(receipt).not.toContain("test-opencode-secret");
  });

  it("exits nonzero with stable model IDs when paid configuration is unusable", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "bomti-provider-preflight-fail-"));
    const outputPath = path.join(temporary, "out");
    let exitCode = 0;
    try {
      await execFileAsync(process.execPath, [
        "scripts/preflight/providers.mjs", `--out=${outputPath}`, "--sha=test-sha"
      ], { cwd: process.cwd(), env: { ...process.env, ...configuredEnvironment({ OPENAI_SOL_MODEL: "" }) } });
    } catch (error) {
      exitCode = (error as { code?: number }).code ?? 1;
    }
    const receipt = await readFile(path.join(outputPath, "result.json"), "utf8");
    expect(exitCode).not.toBe(0);
    expect(receipt).toContain("PROVIDER_CONFIG_MISSING:OPENAI_SOL_MODEL");
    expect(receipt).toContain("fixture-luna-model-v1");
    expect(receipt).not.toContain("test-openai-secret");
    expect(receipt).not.toContain("test-opencode-secret");
  });
});

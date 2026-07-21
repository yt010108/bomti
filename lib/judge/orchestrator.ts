import {
  deepSeekCandidateSchema,
  lunaCandidateSchema,
  normalizedVerdictSchema,
  providerRequestSchema,
  solCandidateSchema,
  solRequestSchema,
  terraCandidateSchema,
  type DeepSeekCandidate,
  type GuestProjection,
  type LunaCandidate,
  type NormalizedVerdict,
  type ProviderRequest,
  type SolCandidate,
  type SolRequest,
  type TerraCandidate
} from "../contracts/verdict";
import { ProviderOutputError, validateProviderEvidence } from "../contracts/verdict-validation";
import { sanitizeOutbound, type SensitiveKind } from "../privacy";
import {
  ProviderError,
  type ProviderAdapter,
  type ProviderCallResult,
  type ProviderCandidate,
  type ProviderInput,
  type ProviderRole
} from "../providers";
import { buildBaselineVerdict, mergeSolVerdict } from "./merge";
import { dimensionAggregate, requiresSol } from "./aggregation";
import { projectGuest } from "./score";

type JudgeCandidate = DeepSeekCandidate | LunaCandidate | TerraCandidate | SolCandidate;
type Adapter<Input extends ProviderInput, Candidate extends ProviderCandidate> = Pick<ProviderAdapter<Input, Candidate>, "evaluate">;

export type JudgeAdapters = {
  readonly guest: Adapter<ProviderRequest, DeepSeekCandidate>;
  readonly luna: Adapter<ProviderRequest, LunaCandidate>;
  readonly terra: Adapter<ProviderRequest, TerraCandidate>;
  readonly sol?: Adapter<SolRequest, SolCandidate>;
};

export type JudgeRequest = {
  readonly idempotencyKey: string;
  readonly audience: "guest" | "authenticated";
  readonly request: ProviderRequest;
  readonly allowSol?: boolean;
  readonly signal?: AbortSignal;
};

export type JudgeCostResult =
  | {
      readonly role: ProviderRole;
      readonly outcome: "accepted";
      readonly providerId: "opencode" | "openai" | "deterministic";
      readonly modelId: string;
      readonly pricingVersion: string;
      readonly acceptedCostMicros: bigint;
    }
  | {
      readonly role: ProviderRole;
      readonly outcome: "rejected";
      readonly code: string;
    }
  | {
      readonly role: ProviderRole;
      readonly outcome: "ambiguous";
      readonly code: string;
      readonly providerRequestId: string | null;
    };

export type JudgeAllowanceAction = "consume" | "refund" | "not_applicable";
export type JudgeTerminalState = "provider_unavailable" | "provider_output_invalid" | "failed_refunded" | "failed_needs_adjudication";

export type JudgeSettlement = {
  readonly idempotencyKey: string;
  readonly audience: JudgeRequest["audience"];
  readonly terminal: "completed" | JudgeTerminalState;
  readonly allowance: JudgeAllowanceAction;
  readonly costs: readonly JudgeCostResult[];
  readonly redactedKinds: readonly SensitiveKind[];
};

export type JudgeResult =
  | {
      readonly status: "completed";
      readonly terminal: "completed";
      readonly verdict: NormalizedVerdict | GuestProjection;
      readonly costs: readonly JudgeCostResult[];
      readonly allowance: JudgeAllowanceAction;
      readonly redactedKinds: readonly SensitiveKind[];
    }
  | {
      readonly status: "in_flight";
      readonly code: "EVALUATION_IN_PROGRESS";
      readonly retryAfterMs: 1000;
    }
  | {
      readonly status: "terminal";
      readonly terminal: JudgeTerminalState;
      readonly code: "AUTH_PROVIDER_UNAVAILABLE" | "GUEST_PROVIDER_UNAVAILABLE" | "PROVIDER_OUTPUT_INVALID" | "EVALUATION_FAILED_REFUNDED" | "ADJUDICATION_REQUIRED" | "GUEST_ATTEMPT_ALREADY_USED" | "IDEMPOTENCY_CONFLICT";
      readonly costs: readonly JudgeCostResult[];
      readonly allowance: JudgeAllowanceAction;
      readonly redactedKinds: readonly SensitiveKind[];
    };

type SuccessfulCall<Candidate extends JudgeCandidate> = {
  readonly kind: "success";
  readonly role: ProviderRole;
  readonly result: ProviderCallResult<Candidate>;
  readonly candidate: Candidate;
  readonly redactedKinds: readonly SensitiveKind[];
};
type InvalidAcceptedCall = {
  readonly kind: "invalid";
  readonly role: ProviderRole;
  readonly result: ProviderCallResult<JudgeCandidate>;
  readonly redactedKinds: readonly SensitiveKind[];
};
type RejectedCall = { readonly kind: "rejected"; readonly role: ProviderRole; readonly code: string };
type AmbiguousCall = {
  readonly kind: "ambiguous";
  readonly role: ProviderRole;
  readonly code: string;
  readonly providerRequestId: string | null;
};
type Call<Candidate extends JudgeCandidate> = SuccessfulCall<Candidate> | InvalidAcceptedCall | RejectedCall | AmbiguousCall;

type StoredTerminal = { readonly fingerprint: string; readonly result: JudgeResult };

function safeCandidate<Candidate>(
  source: unknown,
  parse: (value: unknown) => Candidate,
  validate: (candidate: Candidate) => void
): { readonly candidate: Candidate; readonly redactedKinds: readonly SensitiveKind[] } {
  const sanitized = sanitizeOutbound(source);
  const candidate = parse(sanitized.value);
  validate(candidate);
  return { candidate, redactedKinds: sanitized.redactedKinds };
}

function callCost(role: ProviderRole, result: ProviderCallResult<JudgeCandidate>): JudgeCostResult {
  return {
    role,
    outcome: "accepted",
    providerId: result.providerId,
    modelId: result.resolvedModelId,
    pricingVersion: result.cost.pricingVersion,
    acceptedCostMicros: result.cost.acceptedCostMicros
  };
}

function callCosts(calls: readonly Call<JudgeCandidate>[]): JudgeCostResult[] {
  return calls.map((call) => {
    if (call.kind === "success" || call.kind === "invalid") return callCost(call.role, call.result);
    if (call.kind === "rejected") return { role: call.role, outcome: "rejected", code: call.code };
    return {
      role: call.role,
      outcome: "ambiguous",
      code: call.code,
      providerRequestId: call.providerRequestId
    };
  });
}

function redactedKinds(calls: readonly Call<JudgeCandidate>[]): SensitiveKind[] {
  return [...new Set(calls.flatMap((call) => ("redactedKinds" in call ? call.redactedKinds : [])))].sort();
}

function terminalCode(audience: JudgeRequest["audience"], terminal: JudgeTerminalState): Extract<JudgeResult, { status: "terminal" }>["code"] {
  switch (terminal) {
    case "provider_unavailable":
      return audience === "guest" ? "GUEST_PROVIDER_UNAVAILABLE" : "AUTH_PROVIDER_UNAVAILABLE";
    case "provider_output_invalid":
      return "PROVIDER_OUTPUT_INVALID";
    case "failed_refunded":
      return "EVALUATION_FAILED_REFUNDED";
    case "failed_needs_adjudication":
      return "ADJUDICATION_REQUIRED";
  }
}

function allowanceFor(audience: JudgeRequest["audience"], terminal: "completed" | JudgeTerminalState): JudgeAllowanceAction {
  if (audience === "guest") return "not_applicable";
  return terminal === "completed" ? "consume" : "refund";
}

function failureFor(audience: JudgeRequest["audience"], calls: readonly Call<JudgeCandidate>[]): JudgeTerminalState {
  if (calls.some((call) => call.kind === "invalid")) return "provider_output_invalid";
  if (calls.some((call) => call.kind === "ambiguous" && call.code === "PROVIDER_OUTPUT_INVALID")) {
    return "provider_output_invalid";
  }
  if (calls.some((call) => call.kind === "ambiguous")) return "failed_needs_adjudication";
  if (calls.some((call) => call.kind === "success")) return "failed_refunded";
  return "provider_unavailable";
}

function fingerprint(input: JudgeRequest): string {
  return JSON.stringify({ audience: input.audience, request: input.request });
}

function solRequestFor(request: ProviderRequest, luna: LunaCandidate, terra: TerraCandidate): SolRequest {
  const disagreements = [] as SolRequest["disagreements"];
  const aggregate = Math.round(dimensionAggregate(luna));
  if (Math.abs(dimensionAggregate(luna) - terra.holisticIndex) >= 15) {
    disagreements.push({
      fieldPath: "/finalIndex",
      left: `Luna aggregate is ${aggregate}`,
      right: `Terra holistic index is ${terra.holisticIndex}`
    });
  }
  const lunaCritical = luna.criticalFlags.includes("fabrication_or_unverifiable_claim");
  const terraCritical = terra.criticalFlags.includes("fabrication_or_unverifiable_claim");
  if (lunaCritical !== terraCritical) {
    disagreements.push({
      fieldPath: "/criticalFlags",
      left: lunaCritical ? "Luna reports fabrication flag" : "Luna does not report fabrication flag",
      right: terraCritical ? "Terra reports fabrication flag" : "Terra does not report fabrication flag"
    });
  }
  return solRequestSchema.parse({ contractVersion: "bomti_index_v1", request, luna, terra, disagreements });
}

export class JudgeOrchestrator {
  private readonly inFlight = new Map<string, string>();
  private readonly authenticatedTerminals = new Map<string, StoredTerminal>();
  private readonly consumedGuestAttempts = new Map<string, string>();

  constructor(
    private readonly adapters: JudgeAdapters,
    private readonly settle: (settlement: JudgeSettlement) => Promise<void> | void = () => undefined
  ) {}

  async run(input: JudgeRequest): Promise<JudgeResult> {
    if (input.idempotencyKey.length < 16) throw new Error("IDEMPOTENCY_KEY_INVALID");
    const request = providerRequestSchema.parse(input.request);
    const parsed = { ...input, request };
    const requestFingerprint = fingerprint(parsed);
    const authenticatedTerminal = this.authenticatedTerminals.get(parsed.idempotencyKey);
    if (authenticatedTerminal) {
      return authenticatedTerminal.fingerprint === requestFingerprint
        ? authenticatedTerminal.result
        : this.idempotencyConflict();
    }
    const guestFingerprint = this.consumedGuestAttempts.get(parsed.idempotencyKey);
    if (guestFingerprint) {
      return guestFingerprint === requestFingerprint ? this.guestAlreadyUsed() : this.idempotencyConflict();
    }
    const pendingFingerprint = this.inFlight.get(parsed.idempotencyKey);
    if (pendingFingerprint) {
      return pendingFingerprint === requestFingerprint
        ? { status: "in_flight", code: "EVALUATION_IN_PROGRESS", retryAfterMs: 1000 }
        : this.idempotencyConflict();
    }

    this.inFlight.set(parsed.idempotencyKey, requestFingerprint);
    try {
      const result = await this.execute(parsed);
      if (parsed.audience === "authenticated") this.authenticatedTerminals.set(parsed.idempotencyKey, { fingerprint: requestFingerprint, result });
      if (parsed.audience === "guest" && result.status !== "in_flight" && result.costs.some((cost) => cost.outcome !== "rejected")) {
        this.consumedGuestAttempts.set(parsed.idempotencyKey, requestFingerprint);
      }
      return result;
    } finally {
      this.inFlight.delete(parsed.idempotencyKey);
    }
  }

  private async execute(input: JudgeRequest): Promise<JudgeResult> {
    if (input.audience === "guest") {
      const guest = await this.call(
        this.adapters.guest,
        "guest",
        input.request,
        input,
        deepSeekCandidateSchema.parse,
        (candidate) => validateProviderEvidence(candidate, input.request.segments.map((segment) => segment.segmentId))
      );
      if (guest.kind !== "success") return this.terminal(input, failureFor(input.audience, [guest]), [guest]);
      const safeProjection = this.sanitizeGuestProjection(projectGuest(guest.candidate));
      return this.complete(input, safeProjection.verdict, [guest], safeProjection.redactedKinds);
    }

    const [luna, terra] = await Promise.all([
      this.call(
        this.adapters.luna,
        "luna",
        input.request,
        input,
        lunaCandidateSchema.parse,
        (candidate) => validateProviderEvidence(candidate, input.request.segments.map((segment) => segment.segmentId))
      ),
      this.call(
        this.adapters.terra,
        "terra",
        input.request,
        input,
        terraCandidateSchema.parse,
        (candidate) => validateProviderEvidence(candidate, input.request.segments.map((segment) => segment.segmentId))
      )
    ]);
    const initialCalls: Call<JudgeCandidate>[] = [luna, terra];
    if (luna.kind !== "success" || terra.kind !== "success") {
      return this.terminal(input, failureFor(input.audience, initialCalls), initialCalls);
    }
    if (!requiresSol(luna.candidate, terra.candidate)) {
      try {
        const safeVerdict = this.sanitizeVerdict(buildBaselineVerdict(luna.candidate, terra.candidate));
        return this.complete(input, safeVerdict.verdict, initialCalls, safeVerdict.redactedKinds);
      } catch {
        return this.terminal(input, "provider_output_invalid", initialCalls);
      }
    }
    if (input.allowSol === false || !this.adapters.sol) {
      return this.terminal(input, "failed_needs_adjudication", initialCalls);
    }
    const solRequest = solRequestFor(input.request, luna.candidate, terra.candidate);
    const sol = await this.call(this.adapters.sol, "sol", solRequest, input, solCandidateSchema.parse, () => undefined);
    const allCalls: Call<JudgeCandidate>[] = [...initialCalls, sol];
    if (sol.kind !== "success") {
      const terminal = sol.kind === "invalid" ? "provider_output_invalid" : "failed_needs_adjudication";
      return this.terminal(input, terminal, allCalls);
    }
    try {
      const safeVerdict = this.sanitizeVerdict(mergeSolVerdict(solRequest, sol.candidate));
      return this.complete(input, safeVerdict.verdict, allCalls, safeVerdict.redactedKinds);
    } catch {
      return this.terminal(input, "provider_output_invalid", allCalls);
    }
  }

  private async call<Input extends ProviderInput, Candidate extends JudgeCandidate>(
    adapter: Adapter<Input, Candidate>,
    role: ProviderRole,
    source: Input,
    input: JudgeRequest,
    parse: (source: unknown) => Candidate,
    validate: (candidate: Candidate) => void
  ): Promise<Call<Candidate>> {
    try {
      const result = await adapter.evaluate(source, {
        clientCorrelationId: `${input.idempotencyKey}:${role}`,
        signal: input.signal
      });
      try {
        if (result.role !== role) throw new ProviderOutputError();
        const safe = safeCandidate(result.candidate, parse, validate);
        return { kind: "success", role, result, ...safe };
      } catch {
        let kinds: readonly SensitiveKind[] = [];
        try {
          kinds = sanitizeOutbound(result.candidate).redactedKinds;
        } catch {
          // The candidate is never returned. Its accepted provider cost still has to settle.
        }
        return { kind: "invalid", role, result, redactedKinds: kinds };
      }
    } catch (error) {
      if (error instanceof ProviderError && error.acceptance !== "not_accepted") {
        return {
          kind: "ambiguous",
          role,
          code: error.code,
          providerRequestId: error.providerRequestId
        };
      }
      const code = error instanceof ProviderError ? error.code : "AUTH_PROVIDER_UNAVAILABLE";
      return { kind: "rejected", role, code };
    }
  }

  private sanitizeVerdict(source: NormalizedVerdict): { readonly verdict: NormalizedVerdict; readonly redactedKinds: readonly SensitiveKind[] } {
    const sanitized = sanitizeOutbound(source);
    const verdict = normalizedVerdictSchema.parse(sanitized.value);
    return { verdict, redactedKinds: sanitized.redactedKinds };
  }

  private sanitizeGuestProjection(source: GuestProjection): { readonly verdict: GuestProjection; readonly redactedKinds: readonly SensitiveKind[] } {
    const sanitized = sanitizeOutbound(source);
    return { verdict: sanitized.value, redactedKinds: sanitized.redactedKinds };
  }

  private async complete(
    input: JudgeRequest,
    verdict: NormalizedVerdict | GuestProjection,
    calls: readonly Call<JudgeCandidate>[],
    outputKinds: readonly SensitiveKind[]
  ): Promise<JudgeResult> {
    const kinds = [...new Set([...redactedKinds(calls), ...outputKinds])].sort();
    const result: Extract<JudgeResult, { status: "completed" }> = {
      status: "completed",
      terminal: "completed",
      verdict,
      costs: callCosts(calls),
      allowance: allowanceFor(input.audience, "completed"),
      redactedKinds: kinds
    };
    await this.settle({
      idempotencyKey: input.idempotencyKey,
      audience: input.audience,
      terminal: result.terminal,
      allowance: result.allowance,
      costs: result.costs,
      redactedKinds: result.redactedKinds
    });
    return result;
  }

  private async terminal(input: JudgeRequest, terminal: JudgeTerminalState, calls: readonly Call<JudgeCandidate>[]): Promise<JudgeResult> {
    const result: Extract<JudgeResult, { status: "terminal" }> = {
      status: "terminal",
      terminal,
      code: terminalCode(input.audience, terminal),
      costs: callCosts(calls),
      allowance: allowanceFor(input.audience, terminal),
      redactedKinds: redactedKinds(calls)
    };
    await this.settle({
      idempotencyKey: input.idempotencyKey,
      audience: input.audience,
      terminal: result.terminal,
      allowance: result.allowance,
      costs: result.costs,
      redactedKinds: result.redactedKinds
    });
    return result;
  }

  private guestAlreadyUsed(): Extract<JudgeResult, { status: "terminal" }> {
    return {
      status: "terminal",
      terminal: "failed_refunded",
      code: "GUEST_ATTEMPT_ALREADY_USED",
      costs: [],
      allowance: "not_applicable",
      redactedKinds: []
    };
  }

  private idempotencyConflict(): Extract<JudgeResult, { status: "terminal" }> {
    return {
      status: "terminal",
      terminal: "failed_refunded",
      code: "IDEMPOTENCY_CONFLICT",
      costs: [],
      allowance: "not_applicable",
      redactedKinds: []
    };
  }
}

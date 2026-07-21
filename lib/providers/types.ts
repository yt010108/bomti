import type { DeepSeekCandidate, LunaCandidate, TerraCandidate } from "../contracts/verdict-candidates";
import type { ProviderRequest } from "../contracts/verdict-shared";
import type { SolCandidate, SolRequest } from "../contracts/verdict-sol";

export type ProviderRole = "guest" | "luna" | "terra" | "sol";
export type PaidProviderRole = Exclude<ProviderRole, "guest">;
export type AcceptanceState = "not_accepted" | "possibly_accepted" | "accepted";
export type ProviderCandidate = DeepSeekCandidate | LunaCandidate | TerraCandidate | SolCandidate;
export type ProviderInput = ProviderRequest | SolRequest;

export type ProviderTokenUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
};

export type ProviderCostMetadata = ProviderTokenUsage & {
  readonly pricingVersion: string;
  readonly inputMicrosPerMillion: bigint;
  readonly outputMicrosPerMillion: bigint;
  readonly acceptedCostMicros: bigint;
};

export type ProviderCallResult<Candidate extends ProviderCandidate> = {
  readonly role: ProviderRole;
  readonly providerId: "opencode" | "openai" | "deterministic";
  readonly configuredModelId: string;
  readonly resolvedModelId: string;
  readonly providerRequestId: string | null;
  readonly clientCorrelationId: string;
  readonly acceptance: "accepted";
  readonly candidate: Candidate;
  readonly cost: ProviderCostMetadata;
};

export type ProviderAdapter<Input extends ProviderInput, Candidate extends ProviderCandidate> = {
  readonly role: ProviderRole;
  readonly modelId: string;
  evaluate(input: Input, options: ProviderCallOptions): Promise<ProviderCallResult<Candidate>>;
};

export type ProviderCallOptions = {
  readonly clientCorrelationId: string;
  readonly signal?: AbortSignal;
};

export type ProviderLimits = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly timeoutMs: number;
  readonly reasoningEffort: "none" | "medium" | "high";
};

export type ProviderPricing = {
  readonly pricingVersion: string;
  readonly inputMicrosPerMillion: bigint;
  readonly outputMicrosPerMillion: bigint;
};

export type ProviderRoleConfiguration = ProviderPricing & {
  readonly role: ProviderRole;
  readonly providerId: "opencode" | "openai";
  readonly apiBaseUrl: string;
  readonly apiKey: string;
  readonly modelId: string;
  readonly limits: ProviderLimits;
};

export type ProviderConfiguration = {
  readonly guest: ProviderRoleConfiguration | null;
  readonly luna: ProviderRoleConfiguration | null;
  readonly terra: ProviderRoleConfiguration | null;
  readonly sol: ProviderRoleConfiguration | null;
  readonly guestAvailable: boolean;
  readonly paidEvaluationEnabled: boolean;
  readonly issues: readonly string[];
};

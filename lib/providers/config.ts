import "./server-only";
import type { PaidProviderRole, ProviderConfiguration, ProviderLimits, ProviderRole } from "./types";

export const providerLimits = {
  guest: { inputTokens: 12_000, outputTokens: 1_500, timeoutMs: 15_000, reasoningEffort: "none" },
  luna: { inputTokens: 24_000, outputTokens: 1_800, timeoutMs: 30_000, reasoningEffort: "medium" },
  terra: { inputTokens: 24_000, outputTokens: 1_800, timeoutMs: 30_000, reasoningEffort: "high" },
  sol: { inputTokens: 16_000, outputTokens: 2_200, timeoutMs: 45_000, reasoningEffort: "high" }
} as const satisfies Record<ProviderRole, ProviderLimits>;

const roleEnvironment = {
  guest: {
    providerId: "opencode",
    apiBaseUrl: "OPENCODE_API_BASE_URL",
    apiKey: "OPENCODE_API_KEY",
    model: "OPENCODE_GUEST_MODEL",
    inputPrice: "OPENCODE_GUEST_INPUT_USD_MICROS_PER_MILLION",
    outputPrice: "OPENCODE_GUEST_OUTPUT_USD_MICROS_PER_MILLION"
  },
  luna: {
    providerId: "openai",
    apiBaseUrl: null,
    apiKey: "OPENAI_API_KEY",
    model: "OPENAI_LUNA_MODEL",
    inputPrice: "OPENAI_LUNA_INPUT_USD_MICROS_PER_MILLION",
    outputPrice: "OPENAI_LUNA_OUTPUT_USD_MICROS_PER_MILLION"
  },
  terra: {
    providerId: "openai",
    apiBaseUrl: null,
    apiKey: "OPENAI_API_KEY",
    model: "OPENAI_TERRA_MODEL",
    inputPrice: "OPENAI_TERRA_INPUT_USD_MICROS_PER_MILLION",
    outputPrice: "OPENAI_TERRA_OUTPUT_USD_MICROS_PER_MILLION"
  },
  sol: {
    providerId: "openai",
    apiBaseUrl: null,
    apiKey: "OPENAI_API_KEY",
    model: "OPENAI_SOL_MODEL",
    inputPrice: "OPENAI_SOL_INPUT_USD_MICROS_PER_MILLION",
    outputPrice: "OPENAI_SOL_OUTPUT_USD_MICROS_PER_MILLION"
  }
} as const;

function value(source: Record<string, string | undefined>, name: string | null): string | null {
  if (!name) return null;
  const candidate = source[name]?.trim();
  return candidate ? candidate : null;
}

function price(source: Record<string, string | undefined>, name: string): bigint | null {
  const candidate = value(source, name);
  if (candidate === null || !/^[0-9]+$/.test(candidate)) return null;
  return BigInt(candidate);
}

function roleConfiguration(
  role: ProviderRole,
  source: Record<string, string | undefined>,
  pricingVersion: string | null,
  issues: string[]
) {
  const names = roleEnvironment[role];
  const apiBaseUrl = role === "guest" ? value(source, names.apiBaseUrl) : "https://api.openai.com/v1";
  const apiKey = value(source, names.apiKey);
  const modelId = value(source, names.model);
  const inputMicrosPerMillion = price(source, names.inputPrice);
  const outputMicrosPerMillion = price(source, names.outputPrice);
  const missing = [
    [names.apiBaseUrl, apiBaseUrl],
    [names.apiKey, apiKey],
    [names.model, modelId],
    ["PROVIDER_PRICING_VERSION", pricingVersion],
    [names.inputPrice, inputMicrosPerMillion],
    [names.outputPrice, outputMicrosPerMillion]
  ].filter((entry) => entry[0] && entry[1] === null);
  if (missing.length > 0) {
    for (const [name] of missing) issues.push(`PROVIDER_CONFIG_MISSING:${name}`);
    return null;
  }
  return {
    role,
    providerId: names.providerId,
    apiBaseUrl: apiBaseUrl!,
    apiKey: apiKey!,
    modelId: modelId!,
    pricingVersion: pricingVersion!,
    inputMicrosPerMillion: inputMicrosPerMillion!,
    outputMicrosPerMillion: outputMicrosPerMillion!,
    limits: providerLimits[role]
  };
}

export function loadProviderConfiguration(
  source: Record<string, string | undefined> = process.env
): ProviderConfiguration {
  const issues: string[] = [];
  const pricingVersion = value(source, "PROVIDER_PRICING_VERSION");
  const guest = roleConfiguration("guest", source, pricingVersion, issues);
  const paidIssuesStart = issues.length;
  const luna = roleConfiguration("luna", source, pricingVersion, issues);
  const terra = roleConfiguration("terra", source, pricingVersion, issues);
  const sol = roleConfiguration("sol", source, pricingVersion, issues);
  const paidConfigComplete = issues.length === paidIssuesStart;
  const paidSwitchEnabled = source.PAID_INFERENCE_ENABLED?.trim().toLowerCase() === "true";
  const budget = source.PAID_MONTHLY_BUDGET_USD_CENTS?.trim();
  const paidBudgetEnabled = Boolean(budget && /^[1-9][0-9]*$/.test(budget));
  if (!paidSwitchEnabled) issues.push("PAID_INFERENCE_DISABLED");
  if (!paidBudgetEnabled) issues.push("PAID_BUDGET_DISABLED");
  return {
    guest,
    luna,
    terra,
    sol,
    guestAvailable: guest !== null,
    paidEvaluationEnabled: paidConfigComplete && paidSwitchEnabled && paidBudgetEnabled,
    issues: [...new Set(issues)]
  };
}

export function paidRoles(configuration: ProviderConfiguration): readonly PaidProviderRole[] {
  return configuration.paidEvaluationEnabled ? ["luna", "terra", "sol"] : [];
}

import { calculateAcceptedCostMicros } from "../usage/cost";
import type { ProviderCostMetadata, ProviderPricing, ProviderTokenUsage } from "./types";

export function providerCostMetadata(
  usage: ProviderTokenUsage,
  pricing: ProviderPricing
): ProviderCostMetadata {
  return {
    ...usage,
    ...pricing,
    acceptedCostMicros: calculateAcceptedCostMicros(usage.inputTokens, usage.outputTokens, pricing)
  };
}

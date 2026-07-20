export type ProviderPricing = Readonly<{
  inputMicrosPerMillion: bigint;
  outputMicrosPerMillion: bigint;
}>;

function nonnegativeInteger(value: number, code: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
  return BigInt(value);
}

export function calculateAcceptedCostMicros(
  inputTokens: number,
  outputTokens: number,
  pricing: ProviderPricing
): bigint {
  if (pricing.inputMicrosPerMillion < 0n || pricing.outputMicrosPerMillion < 0n) {
    throw new Error("PRICING_INVALID");
  }
  const numerator = nonnegativeInteger(inputTokens, "INPUT_TOKENS_INVALID") * pricing.inputMicrosPerMillion
    + nonnegativeInteger(outputTokens, "OUTPUT_TOKENS_INVALID") * pricing.outputMicrosPerMillion;
  return (numerator + 500_000n) / 1_000_000n;
}

export function utcMonthBucket(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error("DATE_INVALID");
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function kstDayBucket(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error("DATE_INVALID");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

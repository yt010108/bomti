export const MAX_PROVIDER_SEGMENTS = 999;

export type Segment = { readonly segmentId: string; readonly originalText: string };

export function normalizeText(value: string): string {
  return value.normalize("NFC").trim();
}

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function segmentAnswer(answer: string): readonly Segment[] {
  const normalized = normalizeText(answer);
  if (!normalized) return [];

  const fragments = normalized
    .split(/(?<=[.!?。！？])(?=\s|$)|\n+/u)
    .map((fragment) => fragment.trim())
    .filter(Boolean);

  const stableFragments = fragments.length ? fragments : [normalized];
  const segmentCount = Math.min(stableFragments.length, MAX_PROVIDER_SEGMENTS);
  return Array.from({ length: segmentCount }, (_, index) => {
    const start = Math.floor((index * stableFragments.length) / segmentCount);
    const end = Math.floor(((index + 1) * stableFragments.length) / segmentCount);
    return {
      segmentId: `s${String(index + 1).padStart(4, "0")}`,
      originalText: stableFragments.slice(start, end).join(" ")
    };
  });
}

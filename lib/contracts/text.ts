export type Segment = { segmentId: string; originalText: string };

export function normalizeText(value: string): string {
  return value.normalize("NFC").trim();
}

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function segmentAnswer(answer: string): Segment[] {
  const normalized = normalizeText(answer);
  if (!normalized) return [];

  const fragments = normalized
    .split(/(?<=[.!?。！？])(?=\s|$)|\n+/u)
    .map((fragment) => fragment.trim())
    .filter(Boolean);

  const stableFragments = fragments.length ? fragments : [normalized];
  return stableFragments.map((originalText, index) => ({
    segmentId: `s${String(index + 1).padStart(4, "0")}`,
    originalText
  }));
}

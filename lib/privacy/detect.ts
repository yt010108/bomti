import { normalizeText } from "../contracts/text";
import type { SensitiveDetection, SensitiveKind } from "./types";

type DetectionRule = {
  kind: SensitiveKind;
  pattern: RegExp;
  direct: boolean;
  confidence?: "certain" | "uncertain";
  capture?: number;
};

const rules: readonly DetectionRule[] = [
  { kind: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, direct: true },
  { kind: "resident_id", pattern: /\b\d{6}\s*[- ]\s*[1-8]\d{6}\b/gu, direct: true },
  { kind: "phone", pattern: /(?<!\d)(?:\+?82[- .]?)?(?:0?1[016789]|0?2|0?[3-6][1-5])[- .]?\d{3,4}[- .]?\d{4}(?!\d)/gu, direct: true },
  { kind: "account_number", pattern: /(?:계좌(?:번호)?|account(?:\s+number)?)\s*[:#]?\s*([0-9][0-9 -]{7,18}[0-9])/giu, direct: true, capture: 1 },
  { kind: "ip_address", pattern: /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/gu, direct: true },
  { kind: "person_name", pattern: /(?:이름|성명|지원자|담당자(?:\s*이름)?|name)\s*[:：]?\s*([가-힣]{2,4}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gu, direct: true, capture: 1 },
  { kind: "organization", pattern: /\bKISA\b|(?:[가-힣A-Za-z0-9]{2,24})(?:주식회사|대학교|대학|고등학교|중학교|초등학교|병원|연구원|연구소|공사|공단|청)(?=\s|$|[,.!?])/gu, direct: false },
  { kind: "location", pattern: /(?:서울|부산|대구|인천|광주|대전|울산|세종|제주)(?:특별자치시|특별시|광역시|시|도)?\s*[가-힣]{0,8}(?:구|군|동|읍|면)\b/gu, direct: false },
  { kind: "exact_date", pattern: /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b|(?:19|20)\d{2}년\s*(?:0?[1-9]|1[0-2])월\s*(?:0?[1-9]|[12]\d|3[01])일/gu, direct: false },
  { kind: "distinctive_context", pattern: /\b(?:SBOM|CVE-\d{4}-\d{4,7}|zero[- ]day)\b|제로데이|국가핵심기술|내부고발/giu, direct: false },
  { kind: "uncertain_identifier", pattern: /(?:사번|학번|수험번호|employee\s*id)\s*[:#]?\s*[A-Za-z0-9-]{4,24}/giu, direct: false, confidence: "uncertain" }
];

function collectRuleMatches(text: string, rule: DetectionRule): SensitiveDetection[] {
  const matches: SensitiveDetection[] = [];
  for (const match of text.matchAll(rule.pattern)) {
    const full = match[0];
    const value = rule.capture ? match[rule.capture] : full;
    if (!value || match.index === undefined) continue;
    const offset = full.indexOf(value);
    const start = match.index + Math.max(0, offset);
    matches.push({
      kind: rule.kind,
      start,
      end: start + value.length,
      direct: rule.direct,
      confidence: rule.confidence ?? "certain",
      value
    });
  }
  return matches;
}

export function detectSensitiveText(source: string): readonly SensitiveDetection[] {
  const text = normalizeText(source);
  const candidates = rules.flatMap((rule) => collectRuleMatches(text, rule));
  const priority = (finding: SensitiveDetection) => (finding.direct ? 10_000 : 0) + (finding.end - finding.start);
  const accepted: SensitiveDetection[] = [];

  for (const candidate of candidates.sort((left, right) => left.start - right.start || priority(right) - priority(left))) {
    const overlaps = accepted.some((finding) => candidate.start < finding.end && candidate.end > finding.start);
    if (!overlaps) accepted.push(candidate);
  }
  return accepted.sort((left, right) => left.start - right.start);
}

export function containsSensitiveText(value: string): boolean {
  return detectSensitiveText(value).length > 0;
}

import { EvidenceCard } from "./evidence-card";
import { ScoreMeter } from "./score-meter";
import { StatusBanner } from "./status-banner";

type Evidence = { segmentId: string; dimension: string; summary: string; severity: number };
type Improvement = { dimension: string; direction: string; example: string };
type Verdict = {
  finalIndex: number;
  dimensions: Record<string, number>;
  dimensionExplanations?: Record<string, string>;
  explanation: string;
  evidence: readonly Evidence[];
  improvements: readonly Improvement[];
};
type Segment = { segmentId: string; text: string };

const labels: Record<string, string> = {
  contextMismatch: "맥락 불일치",
  genericityCliche: "상투성",
  credibilityRisk: "신뢰 위험",
  specificityGap: "구체성 부족",
  toneReadabilityRisk: "문체·가독성"
};

export function EvaluationResult({
  verdict,
  audience,
  segments = []
}: {
  verdict: Verdict;
  audience: "guest" | "authenticated";
  segments?: readonly Segment[];
}) {
  const evidence = audience === "guest" ? verdict.evidence.slice(0, 3) : verdict.evidence;
  if (evidence.some((item) => !/^s[0-9]{4}$/.test(item.segmentId))) {
    return <StatusBanner tone="error" title="검증되지 않은 근거를 표시하지 않았습니다">결과를 다시 요청해 주세요.</StatusBanner>;
  }
  const segmentById = new Map(segments.map((segment) => [segment.segmentId, segment.text]));
  return (
    <section className="bomti-result bomti-stack" aria-labelledby="evaluation-result-heading">
      <div className="bomti-section-heading"><div><p className="bomti-kicker">결과</p><h2 id="evaluation-result-heading">밤티 지수와 확인할 근거</h2></div><span className="bomti-mode">{audience === "guest" ? "미리보기 · 최대 3개 근거" : "가명처리 이력용 결과"}</span></div>
      <ScoreMeter score={verdict.finalIndex} dimensions={Object.entries(verdict.dimensions).map(([key, score]) => ({ label: labels[key] ?? key, score }))} />
      <p className="bomti-result__explanation">{verdict.explanation}</p>
      <section className="bomti-stack" aria-labelledby="evidence-heading"><h3 id="evidence-heading" className="bomti-subheading">문장 근거</h3>{evidence.length ? evidence.map((item) => <EvidenceCard key={`${item.segmentId}-${item.dimension}`} segmentId={item.segmentId} quote={segmentById.get(item.segmentId) ?? `문장 ${item.segmentId}의 가명처리된 근거`} reason={`${labels[item.dimension] ?? item.dimension} · ${item.summary}`} />) : <p className="bomti-empty">표시할 문장 근거가 없습니다.</p>}</section>
      <section className="bomti-stack" aria-labelledby="improvement-heading"><h3 id="improvement-heading" className="bomti-subheading">개선 방향</h3><ul className="bomti-improvements">{verdict.improvements.map((item) => <li key={`${item.dimension}-${item.direction}`}><strong>{labels[item.dimension] ?? item.dimension}</strong><span>{item.direction}</span>{item.example ? <em>{item.example}</em> : null}</li>)}</ul></section>
    </section>
  );
}

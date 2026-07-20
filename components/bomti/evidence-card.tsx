export function EvidenceCard({ segmentId, quote, reason }: { segmentId: string; quote: string; reason: string }) {
  return (
    <figure className="bomti-evidence">
      <figcaption className="bomti-evidence__id">문장 근거 · {segmentId}</figcaption>
      <blockquote className="bomti-evidence__quote">“{quote}”</blockquote>
      <p className="bomti-evidence__reason">{reason}</p>
    </figure>
  );
}

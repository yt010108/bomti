const descriptors = [
  { max: 24, label: "밤티 거의 없음" },
  { max: 49, label: "살짝 밤티" },
  { max: 74, label: "꽤 밤티" },
  { max: 100, label: "밤티 그 자체" }
] as const;

export function scoreDescriptor(score: number) {
  return descriptors.find((item) => score <= item.max)?.label ?? descriptors[3].label;
}

type Dimension = { label: string; score: number; explanation?: string };

export function ScoreMeter({ score, dimensions = [] }: { score: number; dimensions?: Dimension[] }) {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  const descriptor = scoreDescriptor(normalizedScore);
  const labelId = `bomti-score-${normalizedScore}-label`;
  const descriptionId = `bomti-score-${normalizedScore}-description`;

  return (
    <section aria-labelledby={labelId}>
      <div className="bomti-meter__header">
        <div><span className="bomti-meter__score">{normalizedScore}<span className="bomti-meter__unit">/ 100</span></span></div>
        <div><span className="bomti-meter__descriptor" id={labelId}>{descriptor}</span><div id={descriptionId}>높을수록 맥락 불일치와 상투성 위험이 큽니다.</div></div>
      </div>
      <div
        className="bomti-meter__track"
        role="progressbar"
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalizedScore}
        aria-valuetext={`${normalizedScore}점, ${descriptor}`}
      >
        <div className="bomti-meter__fill" style={{ width: `${normalizedScore}%` }} />
        <span className="bomti-meter__marker" style={{ left: `${normalizedScore}%` }} aria-hidden="true" />
      </div>
      <div className="bomti-meter__ticks" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
      {dimensions.length ? (
        <ul className="bomti-dimensions" aria-label="위험 차원 점수">
          {dimensions.map((dimension) => <li className="bomti-dimension" key={dimension.label}><span>{dimension.label}</span><strong>{dimension.score}</strong>{dimension.explanation ? <p>{dimension.explanation}</p> : null}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

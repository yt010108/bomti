const steps = [
  { number: "STEP 01", title: "입력", body: "자기소개서와 면접 답변을 원문의 결을 유지한 채 차분히 살펴봅니다.", icon: "⌁" },
  { number: "STEP 02", title: "AI 진단", body: "맥락, 근거, 구체성과 표현의 흐름에서 비어 있는 지점을 찾습니다.", icon: "✦" },
  { number: "STEP 03", title: "개선 방향 확인", body: "다음 문장을 더 설득력 있게 만드는 실질적인 방향을 제안합니다.", icon: "✓" }
] as const;

export function LandingPage() {
  return (
    <main className="bomti-landing">
      <section className="bomti-landing-hero bomti-container">
        <div className="bomti-landing-hero__copy">
          <p className="bomti-editor-label"><span aria-hidden="true">✿</span> Career Editor</p>
          <h1>고치기 전에,<br />맥락과 근거부터 확인하세요</h1>
          <p className="bomti-landing-hero__lead">자기소개서에서 모호하거나 상투적인 표현, 근거가 부족한 문장을 찾아 더 구체적인 개선 방향을 제안합니다.</p>
          <div className="bomti-landing-hero__actions">
            <a className="bomti-button" href="/diagnosis">내 답변 진단하기 <span aria-hidden="true">→</span></a>
            <p className="bomti-landing-privacy"><span aria-hidden="true">♙</span><span>Privacy-first processing.<br />명시적 동의 없이는 학습에 사용하지 않습니다.</span></p>
          </div>
        </div>
        <div className="bomti-landing-visual" role="img" aria-label="노트북이 놓인 차분한 작업 공간과 답변 분석 진행 카드">
          <div className="bomti-diagnosis-progress">
            <div><span aria-hidden="true">▣</span><strong>AI DIAGNOSIS RUNNING</strong></div>
            <i><b /></i>
            <p><span>Scanning context...</span><span>67%</span></p>
          </div>
        </div>
      </section>

      <section className="bomti-landing-steps">
        <div className="bomti-container">
          <header><h2>How it works</h2><p>좋은 글을 대신 쓰지 않고, 더 설득력 있는 나의 이야기를 만들 수 있도록 돕습니다.</p></header>
          <ol>
            {steps.map((step) => <li key={step.number}><span className="bomti-step-icon" aria-hidden="true">{step.icon}</span><p>{step.number}</p><h3>{step.title}</h3><span>{step.body}</span></li>)}
          </ol>
        </div>
      </section>
    </main>
  );
}

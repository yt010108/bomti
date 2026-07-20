"use client";

import { Button, ConsentControl, EvidenceCard, FormField, ScoreMeter, StatusBanner } from "../../components/bomti";

const dimensions = [
  { label: "맥락 불일치", score: 72 },
  { label: "상투성", score: 64 },
  { label: "신뢰 위험", score: 51 },
  { label: "구체성 부족", score: 70 },
  { label: "문체·가독성", score: 39 }
];

export function Showcase({ fixture, state }: { fixture?: string; state?: string }) {
  if (fixture === "color-only-meter") {
    return (
      <main className="bomti-shell">
        <p className="bomti-kicker">의도된 실패 fixture</p>
        <h1 className="bomti-title">색상만 있는 이름 없는 meter</h1>
        <div className="bomti-panel" style={{ marginTop: 32 }}>
          <div className="bomti-broken-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={67} />
        </div>
      </main>
    );
  }

  const score = state?.startsWith("meter-") ? Number(state.slice(6)) : 67;
  return (
    <main className="bomti-shell">
      <header>
        <p className="bomti-kicker">Bomti · primitive showcase</p>
        <h1 className="bomti-title">답변을 고치기 전에, 위험부터 분명하게.</h1>
        <p className="bomti-lead">조용한 교정지를 닮은 화면에서 입력, 동의, 상태, 점수와 문장 근거를 확인합니다. 이 페이지의 내용은 모두 합성 fixture입니다.</p>
      </header>

      <div className="bomti-showcase-grid">
        <section className="bomti-panel bomti-stack">
          <h2>입력과 행동</h2>
          <FormField id="role" label="목표 직무" description="지원하는 직무를 적어 주세요." placeholder="예: 백엔드 개발자" />
          <FormField id="answer" label="자기소개서 답변" description="질문의 의도에 맞는 답변인지 평가합니다." multiline maxLength={1500} currentLength={38} defaultValue="협업을 통해 프로젝트의 문제를 해결한 경험이 있습니다." />
          <FormField id="error" label="회사·공고 맥락" multiline error="회사 또는 공고의 맥락을 입력해 주세요." aria-label="오류 예시 입력" />
          <div className="bomti-inline"><Button>평가하기</Button><Button variant="secondary">임시 내용 지우기</Button><Button loading>평가하기</Button><Button disabled>한도 소진</Button></div>
        </section>

        <section className="bomti-panel">
          <h2>명시적 동의</h2>
          <ConsentControl />
        </section>

        <section className="bomti-panel bomti-panel--wide">
          <h2>Bomti 지수</h2>
          <ScoreMeter score={Number.isFinite(score) ? score : 67} dimensions={dimensions} />
        </section>

        <section className="bomti-panel bomti-stack">
          <h2>처리 상태</h2>
          <StatusBanner tone="info" title="평가 준비">모든 필수 동의를 확인하면 평가를 시작할 수 있습니다.</StatusBanner>
          <StatusBanner tone="success" title="평가 완료">가명처리된 입력으로 결과를 만들었습니다.</StatusBanner>
          <StatusBanner tone="warning" title="현재 제공자 지연">자동 유료 대체 없이 잠시 후 다시 시도할 수 있습니다.</StatusBanner>
          <StatusBanner tone="error" title="평가할 수 없음">입력 오류를 확인해 주세요.</StatusBanner>
        </section>

        <section className="bomti-panel bomti-stack">
          <h2>문장 근거</h2>
          <EvidenceCard segmentId="s0002" quote="주어진 역할을 나누고 매주 진행 상황을 확인했습니다." reason="역할은 드러나지만 문제와 결과를 구체적으로 연결할 근거가 부족합니다." />
          <EvidenceCard segmentId="s0003" quote="긴문장fixture가레이아웃을밀어내지않는지확인하기위한합성문자열입니다abcdefghijklmnopqrstuvwxyz0123456789" reason="공백이 없는 긴 문자열도 카드 밖으로 넘치지 않아야 합니다." />
        </section>
      </div>
    </main>
  );
}

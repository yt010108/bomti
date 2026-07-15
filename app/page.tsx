export default function Home() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
      <h1>Bomti</h1>
      <p>AI 에이전트용 시험장, 채점기, 선호 데이터 저장소.</p>

      <section>
        <h2>첫 데모 흐름</h2>
        <ol>
          <li>Task 입력</li>
          <li>Agent 답변 후보 생성</li>
          <li>LLM judge 평가</li>
          <li>A/B 선호 선택</li>
          <li>JSONL 데이터셋 저장</li>
        </ol>
      </section>

      <section>
        <h2>초기 도메인</h2>
        <p>공공기관·IT·보안 취업 준비 업무를 수행하는 한국어 에이전트 평가.</p>
      </section>
    </main>
  );
}

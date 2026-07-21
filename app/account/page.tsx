"use client";

import { useState } from "react";

export default function AccountPage() {
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState("");

  async function removeAccount() {
    const response = await fetch("/api/account", { method: "DELETE", headers: { "x-bomti-confirm-delete": "true" } });
    setStatus(response.ok ? "계정 삭제 요청을 완료했습니다." : "최근 재인증이 필요하거나 삭제 요청을 완료하지 못했습니다.");
  }

  return (
    <main className="bomti-account-page">
      <header className="bomti-account-topbar"><a href="/history">← <span>돌아가기</span></a><h1>계정 설정</h1><span aria-hidden="true" /></header>
      <div className="bomti-account-content">
        <section className="bomti-panel bomti-account-profile bomti-stack">
          <div><h2>프로필</h2><p className="bomti-account-card__lead">현재 로그인된 계정 정보입니다.</p></div>
          <div className="bomti-account-identity"><span aria-hidden="true">G</span><div><p>Google 계정</p><strong>로그인 후 계정 정보를 표시합니다</strong><small>평가 이력은 로그인한 계정에만 연결됩니다.</small></div></div>
        </section>
        <section className="bomti-panel bomti-stack">
          <div><h2><span className="bomti-inline-icon" aria-hidden="true">♢</span> 데이터 보관 및 활용</h2><p className="bomti-account-card__lead">귀하의 진단 기록이 어떻게 관리되는지 투명하게 안내해 드립니다.</p></div>
          <div className="bomti-account-data-grid">
            <article><span aria-hidden="true">◴</span><h3>기록 저장</h3><p>완료된 평가 이력은 가명처리되어 저장되며, 사용자 본인만 열람할 수 있습니다.</p></article>
            <article><span aria-hidden="true">⌁</span><h3>맞춤형 분석</h3><p>저장된 데이터는 개인화된 피드백을 제공하는 데 필요한 범위에서만 사용됩니다.</p></article>
          </div>
        </section>
        <section className="bomti-panel bomti-danger-zone bomti-stack">
          <div><h2>⚠ 위험 구역</h2><p className="bomti-account-card__lead">계정을 삭제하면 연결 가능한 평가 기록과 설정이 영구적으로 삭제됩니다. 이 작업은 취소할 수 없습니다.</p></div>
          <ul className="bomti-danger-list"><li>모든 커리어 평가 및 진단 기록이 삭제됩니다.</li><li>Google 계정과의 연결이 해제됩니다.</li><li>복구 유예 기간 없이 즉시 파기 처리됩니다.</li></ul>
          <label className="bomti-account-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> <span>네, 계정 삭제 시 모든 데이터가 영구적으로 삭제되며 복구할 수 없음을 이해했습니다.</span></label>
          <div className="bomti-inline bomti-danger-zone__action"><button type="button" className="bomti-button bomti-button--danger" disabled={!confirmed} onClick={() => void removeAccount()}>계정 영구 삭제</button></div>
          {status ? <p className="bomti-empty" role="status">{status}</p> : null}
        </section>
      </div>
    </main>
  );
}

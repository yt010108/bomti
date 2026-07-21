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
    <main className="bomti-shell bomti-stack">
      <header className="bomti-page-header"><p className="bomti-kicker">Account & privacy</p><h1 className="bomti-title">내 데이터는<br />내가 정해요.</h1><p className="bomti-lead">봄티는 평가에 필요한 최소한의 정보만 다룹니다. 저장된 평가와 계정은 언제든 직접 삭제할 수 있습니다.</p></header>
      <div className="bomti-account-grid">
        <section className="bomti-panel bomti-stack">
          <div><p className="bomti-account-card__label">Account</p><h2>계정과 보관 정보</h2><p className="bomti-account-card__lead">로그인한 계정에만 삭제 가능한 평가 이력이 연결됩니다.</p></div>
          <ul className="bomti-account-facts">
            <li><span>로그인 방식</span><strong>Google 계정</strong></li>
            <li><span>평가 원문</span><strong>서버 로그에 저장하지 않음</strong></li>
            <li><span>저장 대상</span><strong>가명처리된 평가 이력</strong></li>
          </ul>
        </section>
        <aside className="bomti-panel bomti-stack">
          <div><p className="bomti-account-card__label">Your control</p><h2>평가 이력 관리</h2></div>
          <p className="bomti-account-card__lead">평가별로 삭제하거나, 계정과 연결 가능한 데이터를 한 번에 삭제할 수 있어요.</p>
          <a className="bomti-button bomti-button--secondary" href="/history">저장된 평가 보기</a>
        </aside>
      </div>
      <section className="bomti-panel bomti-danger-zone bomti-stack">
        <div><p className="bomti-account-card__label">Danger zone</p><h2>계정 삭제</h2><p className="bomti-account-card__lead">최근 10분 안에 재인증한 경우에만 계정과 연결 가능한 데이터를 삭제할 수 있습니다. 삭제는 되돌릴 수 없습니다.</p></div>
        <label className="bomti-account-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> <span>삭제 후에는 계정과 연결 가능한 평가 데이터를 복구할 수 없음을 이해했습니다.</span></label>
        <div className="bomti-inline"><button type="button" className="bomti-button bomti-button--danger" disabled={!confirmed} onClick={() => void removeAccount()}>계정 삭제 요청</button></div>
        {status ? <p className="bomti-empty" role="status">{status}</p> : null}
      </section>
    </main>
  );
}

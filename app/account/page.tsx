"use client";

import { useState } from "react";

export default function AccountPage() {
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState("");

  async function removeAccount() {
    const response = await fetch("/api/account", { method: "DELETE", headers: { "x-bomti-confirm-delete": "true" } });
    setStatus(response.ok ? "계정 삭제 요청을 완료했습니다." : "최근 재인증이 필요하거나 삭제 요청을 완료하지 못했습니다.");
  }

  return <main className="bomti-shell bomti-stack"><h1 className="bomti-title">계정 삭제</h1><p>최근 10분 안에 재인증한 경우에만 계정과 연결 가능한 데이터를 삭제할 수 있습니다.</p><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> 삭제 후 복구할 수 없음을 이해했습니다.</label><button type="button" className="bomti-button" disabled={!confirmed} onClick={() => void removeAccount()}>계정 삭제</button><p role="status">{status}</p></main>;
}

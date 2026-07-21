"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Evaluation = { id: string; createdAt: string; verdict: { finalIndex: number; descriptor: string } };
type HistoryResponse = { evaluations?: Evaluation[]; nextCursor?: string | null; error?: { code?: string } };
type UsageResponse = { allowance?: number; consumed?: number; remaining?: number };

export function HistoryClient() {
  const [history, setHistory] = useState<Evaluation[]>([]);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState("저장된 진단 기록을 불러오는 중입니다.");
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  async function load(cursor: string | null = null, append = false) {
    try {
      const historyUrl = new URL("/api/evaluations", window.location.origin);
      historyUrl.searchParams.set("limit", "20");
      if (cursor) historyUrl.searchParams.set("cursor", cursor);

      const [historyResponse, usageResponse] = await Promise.all([fetch(historyUrl), fetch("/api/usage")]);
      const historyBody = await historyResponse.json() as HistoryResponse;
      if (!historyResponse.ok) {
        const authRequired = historyBody.error?.code === "AUTH_REQUIRED";
        setRequiresLogin(authRequired);
        setLoadFailed(!authRequired);
        setStatus(authRequired ? "로그인하면 저장한 진단 기록을 다시 볼 수 있어요." : "진단 기록을 불러오지 못했습니다.");
        return;
      }

      const evaluations = historyBody.evaluations ?? [];
      setRequiresLogin(false);
      setLoadFailed(false);
      setHistory((current) => append ? [...current, ...evaluations] : evaluations);
      setNextCursor(historyBody.nextCursor ?? null);
      setUsage(usageResponse.ok ? await usageResponse.json() as UsageResponse : null);
      setStatus(evaluations.length ? "" : "저장된 진단 기록이 아직 없습니다.");
    } catch {
      setLoadFailed(true);
      setStatus("진단 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function remove(id: string) {
    if (!window.confirm("이 진단 기록을 삭제할까요? 삭제한 기록은 복구할 수 없습니다.")) return;
    const response = await fetch(`/api/evaluations/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-bomti-confirm-delete": "true" } });
    if (!response.ok) {
      setStatus("진단 기록을 삭제하지 못했습니다.");
      return;
    }
    await load();
  }

  return (
    <main className="bomti-shell bomti-history-page">
      <header className="bomti-history-page__intro">
        <p className="bomti-kicker">My history</p>
        <h1>내 기록</h1>
        <p>로그인한 계정의 진단 기록을 안전하게 보관하고, 필요할 때 다시 확인할 수 있어요.</p>
      </header>

      {usage ? <section className="bomti-history-summary" aria-label="이번 캠페인 사용량">
        <div><p>이번 캠페인에 남은 진단</p><strong>{usage.remaining}회</strong><span>총 {usage.allowance}회 중 {usage.consumed}회 사용</span></div>
        <div><p>저장된 진단</p><strong>{history.length}개</strong><span>완료한 진단만 표시됩니다.</span></div>
      </section> : null}

      {history.length ? <ul className="bomti-history-list" aria-label="평가 이력">
        {history.map((evaluation) => (
          <li key={evaluation.id}>
            <Link href={`/history/${encodeURIComponent(evaluation.id)}`}><span>{new Date(evaluation.createdAt).toLocaleDateString("ko-KR")}</span><span>{evaluation.verdict.descriptor} · {evaluation.verdict.finalIndex}점</span></Link>
            <button type="button" className="bomti-button bomti-button--secondary" onClick={() => void remove(evaluation.id)}>기록 삭제</button>
          </li>
        ))}
      </ul> : <section className="bomti-history-empty bomti-panel" aria-live="polite">
        <span aria-hidden="true">◌</span>
        <h2>{requiresLogin ? "내 기록을 보려면 로그인이 필요해요" : loadFailed ? "기록을 불러오지 못했어요" : "아직 저장된 진단이 없어요"}</h2>
        <p>{status}</p>
        {requiresLogin ? <a className="bomti-button" href="/account">로그인하기</a> : loadFailed ? <button type="button" className="bomti-button" onClick={() => void load()}>다시 시도하기</button> : <a className="bomti-button" href="/diagnosis">첫 답변 진단하기</a>}
      </section>}

      {history.length && status ? <p className="bomti-empty" role="status">{status}</p> : null}
      {nextCursor ? <button type="button" className="bomti-button bomti-button--secondary" onClick={() => void load(nextCursor, true)}>이력 더 보기</button> : null}
    </main>
  );
}

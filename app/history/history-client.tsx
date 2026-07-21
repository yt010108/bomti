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
  const [status, setStatus] = useState("이력을 불러오는 중입니다.");

  async function load(cursor: string | null = null, append = false) {
    const historyUrl = new URL("/api/evaluations", window.location.origin);
    historyUrl.searchParams.set("limit", "20");
    if (cursor) historyUrl.searchParams.set("cursor", cursor);
    const [historyResponse, usageResponse] = await Promise.all([fetch(historyUrl), fetch("/api/usage")]);
    const historyBody = await historyResponse.json() as HistoryResponse;
    if (!historyResponse.ok) {
      setStatus(historyBody.error?.code === "AUTH_REQUIRED" ? "로그인이 필요합니다." : "이력을 불러올 수 없습니다.");
      return;
    }
    setHistory((current) => append ? [...current, ...(historyBody.evaluations ?? [])] : historyBody.evaluations ?? []);
    setNextCursor(historyBody.nextCursor ?? null);
    setUsage(usageResponse.ok ? await usageResponse.json() as UsageResponse : null);
    setStatus(historyBody.evaluations?.length ? "" : "저장된 평가 이력이 없습니다.");
  }

  useEffect(() => { void load(); }, []);

  async function remove(id: string) {
    if (!window.confirm("이 평가를 삭제할까요? 삭제한 평가는 복구할 수 없습니다.")) return;
    const response = await fetch(`/api/evaluations/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-bomti-confirm-delete": "true" } });
    if (!response.ok) {
      setStatus("평가를 삭제하지 못했습니다.");
      return;
    }
    await load();
  }

  return (
    <main className="bomti-shell bomti-stack">
      <header className="bomti-page-header"><p className="bomti-kicker">이력</p><h1 className="bomti-title">저장된 평가</h1><p className="bomti-lead">완료된 인증 평가만 가명처리된 내용으로 보관합니다.</p></header>
      {usage ? <p className="bomti-mode">이번 캠페인 잔여 횟수: {usage.remaining} / {usage.allowance}</p> : null}
      <p role="status">{status}</p>
      <ul className="bomti-improvements" aria-label="평가 이력">
        {history.map((evaluation) => (
          <li key={evaluation.id}>
            <Link href={`/history/${encodeURIComponent(evaluation.id)}`}>{new Date(evaluation.createdAt).toLocaleDateString("ko-KR")} · {evaluation.verdict.finalIndex}점 · {evaluation.verdict.descriptor}</Link>
            <button type="button" className="bomti-button bomti-button--secondary" onClick={() => void remove(evaluation.id)}>평가 삭제</button>
          </li>
        ))}
      </ul>
      {nextCursor ? <button type="button" className="bomti-button bomti-button--secondary" onClick={() => void load(nextCursor, true)}>이력 더 보기</button> : null}
    </main>
  );
}

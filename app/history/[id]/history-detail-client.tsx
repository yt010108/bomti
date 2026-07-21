"use client";

import { useEffect, useState } from "react";

type Evaluation = { createdAt: string; verdict: { finalIndex: number; descriptor: string; explanation: string } };

export function HistoryDetailClient({ id }: { id: string }) {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [status, setStatus] = useState("평가를 불러오는 중입니다.");

  useEffect(() => {
    void fetch(`/api/evaluations/${encodeURIComponent(id)}`).then(async (response) => {
      if (!response.ok) {
        setStatus("평가를 찾을 수 없거나 접근 권한이 없습니다.");
        return;
      }
      setEvaluation(await response.json() as Evaluation);
      setStatus("");
    });
  }, [id]);

  return <main className="bomti-shell bomti-stack"><header className="bomti-page-header"><p className="bomti-kicker">Saved evaluation</p><h1 className="bomti-title">평가 상세</h1></header>{status ? <p className="bomti-empty" role="status">{status}</p> : null}{evaluation ? <section className="bomti-panel bomti-stack"><span className="bomti-mode">{new Date(evaluation.createdAt).toLocaleDateString("ko-KR")}</span><h2>{evaluation.verdict.descriptor} · {evaluation.verdict.finalIndex}점</h2><p className="bomti-result__explanation">{evaluation.verdict.explanation}</p></section> : null}</main>;
}

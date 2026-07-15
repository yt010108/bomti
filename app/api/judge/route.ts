import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();

  return NextResponse.json({
    task_id: body.task_id ?? "task_demo",
    score_total: 78,
    scores: {
      evidence_accuracy: 18,
      job_relevance: 17,
      experience_specificity: 15,
      practicality: 12,
      no_hallucination: 8,
      structure: 8
    },
    strengths: ["직무 연결성이 비교적 명확함", "면접 질문으로 확장 가능함"],
    weaknesses: ["근거 문서 인용이 부족함", "성과가 수치화되지 않음"],
    hallucination_flags: [],
    improvement_actions: ["공고 원문 근거 추가", "프로젝트 결과물 링크 추가", "STAR 구조로 재작성"],
    rationale: "초기 mock judge 결과입니다. 실제 LLM judge 연결 전까지 UI 검증용으로 사용합니다."
  });
}

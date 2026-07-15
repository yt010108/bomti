export const publicJobInterviewRubric = {
  id: "public_job_interview_v1",
  total: 100,
  criteria: [
    { key: "evidence_accuracy", label: "근거 정확성", maxScore: 25 },
    { key: "job_relevance", label: "직무 연결성", maxScore: 20 },
    { key: "experience_specificity", label: "경험 구체성", maxScore: 20 },
    { key: "practicality", label: "실전 활용성", maxScore: 15 },
    { key: "no_hallucination", label: "환각·과장 없음", maxScore: 10 },
    { key: "structure", label: "구조와 표현", maxScore: 10 }
  ]
} as const;

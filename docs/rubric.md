# 평가 루브릭

## 기본 평가표

| 평가 항목 | 점수 | 설명 |
| --- | ---: | --- |
| 근거 정확성 | 25 | 공고, 기관 자료, 직무 정보에 기반했는가 |
| 직무 연결성 | 20 | 지원 직무와 사용자의 경험을 설득력 있게 연결했는가 |
| 경험 구체성 | 20 | 역할, 문제, 행동, 결과가 구체적인가 |
| 실전 활용성 | 15 | 면접이나 자기소개서에서 실제로 사용할 수 있는가 |
| 환각·과장 없음 | 10 | 없는 사실을 만들거나 과장하지 않았는가 |
| 구조와 표현 | 10 | 읽기 쉽고 논리적으로 구성되어 있는가 |

## Judge 출력 형식

```json
{
  "score_total": 0,
  "scores": {
    "evidence_accuracy": 0,
    "job_relevance": 0,
    "experience_specificity": 0,
    "practicality": 0,
    "no_hallucination": 0,
    "structure": 0
  },
  "strengths": [],
  "weaknesses": [],
  "hallucination_flags": [],
  "improvement_actions": [],
  "rationale": ""
}
```

## 루브릭 버전

초기 루브릭명은 `public_job_interview_v1`로 둔다.

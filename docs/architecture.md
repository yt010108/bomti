# 구현 아키텍처

## 전체 구조

Bomti는 task 실행, agent 답변 생성, judge 평가, human preference, dataset 저장으로 구성한다.

## 모듈 구성

| 모듈 | 역할 |
| --- | --- |
| Task Builder | 평가 과제 생성 및 입력값 정리 |
| Agent Runner | 모델 또는 에이전트 답변 생성 |
| Judge Engine | 루브릭 기반 평가 수행 |
| Preference UI | 사용자가 A/B 답변 선택 |
| Dataset Store | task, answer, score, preference 저장 |
| Dashboard | 평가 결과와 데이터셋 상태 확인 |

## 추천 기술 스택

| 영역 | 추천 |
| --- | --- |
| Frontend | Next.js, React, Tailwind CSS |
| Backend | Next.js API routes |
| Database | SQLite 또는 Postgres |
| ORM | Prisma 또는 Drizzle |
| LLM API | OpenAI API 중심 |
| Export | JSONL, CSV |

## API 초안

| API | 역할 |
| --- | --- |
| POST /api/tasks | task 생성 |
| POST /api/tasks/:id/run | 답변 후보 생성 |
| POST /api/tasks/:id/judge | 답변 평가 |
| POST /api/preferences | A/B 선택 저장 |
| GET /api/datasets/export | JSONL 내보내기 |
| GET /api/dashboard | 평가 현황 조회 |

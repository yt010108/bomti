# 목표 아키텍처

이 문서는 승인된 목표 구조를 설명한다. Todo 1 단계에서 나열된 모든 모듈이 이미 가동 중이라는 뜻은 아니다.

## 경계

| 계층 | 책임 |
| --- | --- |
| 웹 | 단일 답변 입력, 명시적 동의, 접근 가능한 Bomti 결과, 인증 이력과 삭제 상태 |
| API | 검증 → 동의 → 쿼터/예산 예약 → 가명처리 → 제공자 호출 → 출력 PII 재검사 → 영속화 순서 보장 |
| Judge | DeepSeek 게스트 평가, Luna 차원 평가, Terra 전체 판단, 조건부 Sol adjudication을 `bomti_index_v1`으로 정규화 |
| Privacy | 입력·출력 PII 탐지, 안정된 placeholder 가명처리, 벤치마크 적격성의 fail-closed 판정 |
| Data | Supabase Postgres/Auth, RLS 소유권, 삭제 saga, unlinkable budget ledger와 benchmark 저장소 |
| Operations | 환경·모델·가격 사전점검, 격리된 검증 lane, 백업/복구, 배포 전 readiness |

## 목표 API

| API | 책임 |
| --- | --- |
| `POST /api/evaluations` | 한 번의 평가 요청을 검증하고 게스트 또는 인증 Judge 흐름을 시작 |
| `GET /api/evaluations`, `GET|DELETE /api/evaluations/[id]` | 소유자 이력 조회 및 삭제 |
| `POST /api/evaluations/[id]/feedback` | allowlist된 평점·이유 코드 저장 |
| `GET /api/usage`, `DELETE /api/account` | 남은 허용량과 계정 삭제 saga |
| `GET /api/health`, `/auth/callback` | readiness와 Google OAuth 콜백 |

기존 mock API는 호환 shim으로 유지하지 않고 승인된 API로 교체한다. 구체적인 라우트 계약은 [requirements.md](requirements.md)를 따른다.

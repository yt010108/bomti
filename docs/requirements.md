# Bomti 요구사항 원장

이 문서는 현재 구현과 검증의 정본 원장이다. 아래 활성 원장은 각 요구사항 ID를 정확히 한 번만 포함한다. 계획·인계 문서는 승인된 역사와 실행 제약을 보존하며, 제품 동작의 상세 정본은 승인 계획과 이 원장을 함께 따른다.

## 활성 요구사항 원장

| ID | 요구 결과 |
| --- | --- |
| BOM-001 | 공개 웹은 질문·답변·직무·회사/공고 맥락을 가진 자기소개서 답변 하나를 평가하며, 답변 쌍 비교는 내부 보정에만 사용한다. |
| BOM-002 | 질문, 답변, 목표 직무, 회사/공고 맥락은 공유 검증 계약으로 필수이며 경험 근거는 선택·길이 제한 항목이다. |
| BOM-003 | 결과는 높은 점수일수록 더 밤티인 0–100 지수, 네 구간 설명, 위험 차원, 문장 근거, 설명, 제한된 개선 예시를 제공하고 전체 재작성은 제공하지 않는다. |
| BOM-004 | 비로그인 사용자는 브라우저/IP 기준 하루 한 번, 최대 세 건의 비영속 DeepSeek 미리보기를 받고 전역 일일 한도와 유료 대체 금지의 적용을 받는다. |
| BOM-005 | Google 인증 사용자는 설정된 캠페인에서 초기화되지 않는 세 번의 상세 평가와 계정 귀속·삭제 가능한 이력을 가진다. |
| BOM-006 | 게스트 DeepSeek, 인증 Luna·Terra, 조건부 Sol은 같은 `bomti_index_v1` 계약으로 정규화되며 Sol은 결정적 불일치에만 개입한다. |
| BOM-007 | 평가 전 필수 동의는 기본 해제이며, 동의 후 세그먼트화·가명처리 후에만 모델 전송이 가능하고 원문은 로그나 영속 저장소에 남지 않는다. |
| BOM-008 | 개별 이력 및 계정 삭제는 모든 연결 가능한 기록을 제거하며, 되돌릴 수 없는 벤치마크 복사본에는 소유자나 재연결 키가 없다. |
| BOM-009 | 보수적 비식별 검사를 통과한 인증 평가만 내부 벤치마크에 들어가며, 내보내기는 브라우저 관리자 화면이 아닌 서버 전용 JSON/CSV CLI다. |
| BOM-010 | 쿼터·멱등성·타임아웃·Sol 및 월 예산 한도·환불·명시적 저하 상태가 비용과 실패를 제한하고, 유료 추론은 기본적으로 닫혀 있다. |
| BOM-011 | 절제된 Bomti UI는 지수 막대와 문장 근거를 핵심 시그니처로 사용하고 색상만으로 의미를 전달하거나 일반적인 AI 장식을 사용하지 않는다. |
| BOM-012 | 서비스는 Vercel과 Supabase Postgres/Auth에 배포 가능한 구조·마이그레이션·백업·롤백·사전점검을 제공하지만 실제 클라우드 활성화와 live smoke test는 운영자 승인 작업이다. |
| BOM-013 | 모든 기능은 자동 경계 검사, 정상·실패 표면 QA, 원문·비밀이 없는 SHA-bound 증거를 가지며 최종 검토가 같은 코드 SHA를 승인해야 한다. |
| BOM-014 | 보정 도구는 페어 일치도, 평가자 불일치, 구간 분포, escalation, 실패 범주, 유용성을 분자·분모·결측치와 함께 보고하고 고정 출시 기준은 선언하지 않는다. |
| BOM-015 | 저장소 문서, 프롬프트, 라우트, fixture는 승인된 단일 답변 심사와 내부 보정을 설명하며 답변 생성·공개 A/B·대시보드 계약을 남기지 않는다. |

## 입력 계약

모든 문자열은 NFC로 정규화하고 앞뒤 공백을 제거한 뒤 Unicode 코드 포인트로 길이를 잰다. 내부 줄바꿈은 보존하며 한국어와 영어를 지원한다. 공개 `INPUT_INVALID` 응답은 아래 필드 코드를 포함할 수 있다.

| 필드 | 필수 | 게스트 범위 | 인증 범위 | 안정적 필드 오류 코드 |
| --- | --- | --- | --- | --- |
| `question` | 예 | 1–1,200자 | 1–1,200자 | `QUESTION_TOO_SHORT`, `QUESTION_TOO_LONG` |
| `answer` | 예 | 1–1,500자 | 1–6,000자 | `ANSWER_TOO_SHORT`, `ANSWER_TOO_LONG` |
| `targetRole` | 예 | 1–120자 | 1–120자 | `TARGETROLE_TOO_SHORT`, `TARGETROLE_TOO_LONG` |
| `jobCompanyContext` | 예 | 1–5,000자 | 1–5,000자 | `JOBCOMPANYCONTEXT_TOO_SHORT`, `JOBCOMPANYCONTEXT_TOO_LONG` |
| `experienceEvidence` | 아니요 | 0–6,000자 | 0–6,000자 | `EXPERIENCEEVIDENCE_TOO_LONG` |

## 점수 계약

| 항목 | 고정 매핑 |
| --- | --- |
| `contractVersion` | `bomti_index_v1` |
| 점수 방향 | 0–100 정수이며 높을수록 밤티 위험이 높다. |
| 구간 | 0–24 `밤티 거의 없음`; 25–49 `살짝 밤티`; 50–74 `꽤 밤티`; 75–100 `밤티 그 자체` |
| 위험 차원 | `contextMismatch` 25%, `genericityCliche` 25%, `credibilityRisk` 20%, `specificityGap` 20%, `toneReadabilityRisk` 10% |
| 비상향 경로 | Luna 차원 가중 평균과 Terra 전체 점수의 평균을 반올림한다. |
| Sol 상향 경로 | 두 점수가 15점 이상 다르거나 `fabrication_or_unverifiable_claim` 플래그가 불일치할 때만 Sol의 완전한 검증 결과로 대체한다. |
| 세그먼트 근거 | 원문 답변을 결정적으로 `s0001…` 문장 세그먼트로 나눈 뒤 가명처리하고, 모델은 유효한 `segmentId`만 인용한다. |

## 성공 및 부분 verdict 규칙

| 결과 | HTTP 및 공개 계약 |
| --- | --- |
| `completed` | HTTP 200에서 스키마 검증과 출력 PII 재검사를 마친 완전한 verdict 하나를 반환한다. |
| 부분 verdict | 반환하지 않는다. Luna, Terra, Sol 또는 공급자 출력 중 일부만 유효한 경우에도 성공으로 승격하지 않는다. |
| 비완료 응답 | 안정적 `status`와 `code`만 반환하며 공급자 원문, 입력, 이전 verdict를 포함하지 않는다. |

## 터미널 상태 및 HTTP 매핑

| 상태 | 종결 여부 | HTTP | 공개 상태 | 안정적 오류 코드 | verdict | 재시도 |
| --- | --- | --- | --- | --- | --- | --- |
| `completed` | 종결 | 200 | `completed` | 없음 | 완전한 verdict | 불필요 |
| `in_flight_before_acceptance` | 비종결 | 202 | `in_flight` | `EVALUATION_IN_PROGRESS` | 없음 | 동일 본문·멱등성 키로 1초 뒤 가능 |
| `validation_failed` | 종결 | 400 | `terminal` | `INPUT_INVALID` | 없음 | 입력 수정 뒤 새 요청 |
| `consent_required` | 종결 | 428 | `terminal` | `CONSENT_REQUIRED` | 없음 | 최신 동의 뒤 새 요청 |
| `quota_exhausted` | 종결 | 429 | `terminal` | `GUEST_LIMIT`, `ACCOUNT_LIMIT`, `GLOBAL_LIMIT`, `SOL_LIMIT` | 없음 | 해당 버킷 또는 캠페인 정책 뒤 가능 |
| `budget_disabled` | 종결 | 503 | `terminal` | `PAID_EVALUATION_DISABLED` | 없음 | 운영자 설정 전 불가 |
| `provider_unavailable` | 종결 | 503 | `terminal` | `GUEST_PROVIDER_UNAVAILABLE`, `AUTH_PROVIDER_UNAVAILABLE` | 없음 | 새로운 멱등성 요청으로 나중에 가능 |
| `provider_output_invalid` | 종결 | 502 | `terminal` | `PROVIDER_OUTPUT_INVALID` | 없음 | 사용자 허용량 환불 뒤 새 요청 가능 |
| `cancelled_before_acceptance` | 종결 | 서버 상태 499, 클라이언트 응답 중단 | `terminal` | `REQUEST_CANCELLED` | 없음 | 새 요청 가능 |
| `failed_refunded` | 종결 | 503 | `terminal` | `EVALUATION_FAILED_REFUNDED` | 없음 | 환불 뒤 새 요청 가능 |
| `failed_needs_adjudication` | 종결 | 503 | `terminal` | `ADJUDICATION_REQUIRED` | 없음 | 계정 허용량 환불 뒤 나중에 가능 |

공급자가 수락했거나 수락 여부가 불명확해진 뒤의 게스트 중복 요청은 HTTP 409, `terminal`, `GUEST_ATTEMPT_ALREADY_USED`를 반환하며 이전 verdict를 재전송하지 않는다.

## 안정적 오류 코드 매핑

| 안정적 오류 코드 | HTTP | 상태·표면 | 공개 의미 |
| --- | --- | --- | --- |
| `EVALUATION_IN_PROGRESS` | 202 | `in_flight_before_acceptance` | 동일 게스트 요청이 아직 공급자 수락 전 처리 중 |
| `INPUT_INVALID` | 400 | `validation_failed` | 본문 형식 또는 필드 경계 위반 |
| `CONSENT_REQUIRED` | 428 | `consent_required` | 필수 동의 누락 또는 버전 만료 |
| `GUEST_LIMIT` | 429 | `quota_exhausted` | 게스트 IP 또는 브라우저 버킷 소진 |
| `ACCOUNT_LIMIT` | 429 | `quota_exhausted` | 계정 캠페인 허용량 소진 |
| `GLOBAL_LIMIT` | 429 | `quota_exhausted` | 게스트 전역 일일 한도 소진 |
| `SOL_LIMIT` | 429 | `quota_exhausted` | Sol 일일 한도 소진 |
| `PAID_EVALUATION_DISABLED` | 503 | `budget_disabled` | 유료 추론이 fail-closed 상태 |
| `GUEST_PROVIDER_UNAVAILABLE` | 503 | `provider_unavailable` | 무료 게스트 공급자 사용 불가 |
| `AUTH_PROVIDER_UNAVAILABLE` | 503 | `provider_unavailable` | 인증 평가 공급자 사용 불가 |
| `PROVIDER_OUTPUT_INVALID` | 502 | `provider_output_invalid` | 구조·범위·세그먼트·PII 검증 실패 |
| `REQUEST_CANCELLED` | 서버 상태 499 | `cancelled_before_acceptance` | 첫 수락 전에 취소됨 |
| `EVALUATION_FAILED_REFUNDED` | 503 | `failed_refunded` | 실패했고 사용자 허용량을 환불함 |
| `ADJUDICATION_REQUIRED` | 503 | `failed_needs_adjudication` | Sol 판정 없이는 완전한 verdict를 만들 수 없음 |
| `GUEST_ATTEMPT_ALREADY_USED` | 409 | 게스트 중복 종결 표면 | 수락 가능성 이후 anti-abuse 표식으로 재사용 차단 |
| `AUTH_STATE_INVALID` | 400 | OAuth 콜백 | PKCE state 또는 verifier 불일치 |
| `AUTH_CODE_EXCHANGE_FAILED` | 502 | OAuth 콜백 | 허용된 코드 교환 실패 |
| `AUTH_EMAIL_MISSING` | 403 | OAuth 콜백 | 인증 ID에 필수 이메일 없음 |
| `AUTH_SESSION_EXPIRED` | 401 | OAuth 콜백·재인증 | 세션 또는 재인증 시간 만료 |
| `AUTH_REDIRECT_DENIED` | 400 | OAuth 콜백 | redirect allowlist 불일치 |

## 재시도 및 환불 매핑

| 경로 | 사용자 허용량 | Sol 허용량 | 예산·비용 | 재시도 및 중복 규칙 |
| --- | --- | --- | --- | --- |
| 게스트 `completed` | IP·쿠키·전역 각 1회 소비 | 해당 없음 | 수락된 게스트 비용 유지 | 같은 멱등성 키로 verdict 재전송 금지 |
| Sol 없는 인증 `completed` | 계정 1회 소비 | 해당 없음 | Luna·Terra 수락 비용 유지 | 종결 요청 재실행 금지 |
| Sol 있는 인증 `completed` | 계정 1회 소비 | 수락 뒤 1회 소비 | 모든 수락 비용 유지 | 종결 요청 재실행 금지 |
| 검증·동의·쿼터·예산 거절 또는 수락 전 취소 | 소비 없음 | 소비 없음 | 모든 예약 해제 | 조건 수정 뒤 새 요청 가능 |
| 공급자 수락 전 거절이 증명됨 | 게스트·계정·전역 환불 | 예약 해제 | 미수락 예약 해제 | 새 요청 가능 |
| 수락 불명확·출력 무효·수락 뒤 timeout/취소 | 사용자 허용량 환불, 게스트 anti-abuse 표식 유지 | 수락이 알려졌을 때만 소비, 아니면 reconciliation까지 보류 | 최악 비용 예약을 유지한 뒤 확인된 비용만 정산 | 자동 재시도·자동 예약 해제 금지 |
| Sol 필요하지만 capped 또는 unavailable | 계정 허용량 환불 | 소비 없음 | Luna·Terra 비용 유지, Sol 예약 해제 | 부분 verdict 없이 나중에 새 요청 가능 |
| 만료된 수락 전 예약 | 허용량 해제 | 허용량 해제 | 나중에 수락이 확인되지 않으면 예약 해제 | 게스트 멱등성 anti-abuse 표식은 유지 |

## 화면·라우트 매트릭스

아래는 승인된 목표 표면이다. Todo 1 단계에서 아직 구현되지 않은 경로를 이미 운영 중인 기능으로 해석하지 않는다.

| 표면 | 목적 | 요구사항 |
| --- | --- | --- |
| `/` | 동의된 단일 답변 입력, 게스트/인증 분기, 결과 상태 | BOM-001, BOM-002, BOM-004, BOM-005, BOM-007, BOM-011 |
| `/history`, `/history/[id]` | 인증 평가 이력, 피드백, 개별 삭제 | BOM-005, BOM-008 |
| `/auth/callback` | Google OAuth PKCE 콜백과 허용된 오류 처리 | BOM-005, BOM-008, BOM-012 |
| `POST /api/evaluations` | 검증 → 동의 → 예약 → 가명처리 → 심사 순서를 보장하는 평가 생성 | BOM-001, BOM-002, BOM-004, BOM-005, BOM-006, BOM-007, BOM-010 |
| `GET /api/evaluations`, `GET|DELETE /api/evaluations/[id]` | 소유자 이력 조회·삭제 | BOM-005, BOM-008 |
| `POST /api/evaluations/[id]/feedback`, `GET /api/usage`, `DELETE /api/account` | 제한된 피드백, 사용량, 계정 삭제 | BOM-005, BOM-008, BOM-010 |
| `GET /api/health` | 비밀 없이 readiness를 노출하는 로컬·운영 점검 표면 | BOM-012, BOM-013 |
| 서버 전용 `benchmark:*` CLI | 익명 벤치마크 검증·페어링·가져오기·내보내기·보고 | BOM-009, BOM-014 |

## 제외 범위

- 완성 자기소개서 생성, 전체 재작성, 합격/불합격 판정
- 공개 답변 비교, 공개 벤치마크 편집, 관리자 웹 대시보드
- 결제, 자동 지원, 크롤링, 채용 매칭, RL 학습
- 사용자 ChatGPT/Codex 구독 또는 OAuth를 Bomti 모델 비용으로 전용하는 방식
- 사용자 승인 없는 배포, 외부 서비스 변경, 유료 호출, Git push, PR, 외부 데이터 import

## 증거 매핑 규칙

1. 구현 파일, 자동 assertion, 정상 시나리오, 실패 시나리오, 증거 위치는 하나 이상의 BOM ID를 공유해야 한다.
2. 증거는 주장한 커밋 SHA의 깨끗한 detached worktree에서 실행하며 checkout 바깥의 `<attemptDir>/bomti/<BOM-ID>/<scenario>/`에 저장한다.
3. wrapper와 payload는 서로 다른 `result.json`을 만들고, 명령·시각·SHA·프로필·테스트 URL·redaction 선언을 기록한다.
4. 원문, 식별자, API 키, OAuth 토큰, 제공자 응답의 PII는 증거를 무효화한다.
5. `operator_not_authorized` 및 `operator_not_supplied`는 허가가 필요한 외부 작업의 정직한 상태이며 로컬 기술 검증 실패로 위장하지 않는다.

## 검증 runner 상태 계약

| 상태 | 안정적 코드 | 계약 |
| --- | --- | --- |
| 현재 toolchain 계약 | 없음 | `--profile=toolchain-fixture-contract`는 runner의 인자·SHA-bound receipt 계약만 검증하고 제품 기능을 대신 통과시키지 않는다. |
| 아직 구현 순서에 도달하지 않은 제품 profile | `dependency_not_ready` | `blocked` receipt를 쓰며 PASS나 APPROVE로 해석하지 않는다. |
| 운영자 입력 없음 | `operator_not_supplied` | `blocked` receipt를 쓰며 입력이나 검토를 만들지 않는다. |
| 외부 작업 권한 없음 | `operator_not_authorized` | `skipped` receipt를 쓰며 외부 서비스나 유료 모델을 호출하지 않는다. |

`qa:final --profile=final-product`는 격리 Supabase·결정적 provider/auth 설정과 전체 제품 E2E 의존성이 모두 준비된 경우에만 reset → build → start → `/api/health` readiness → Playwright 접근성 시나리오 → trap cleanup을 실행한다. `verify:independent-review --profile=readonly-final`은 같은 SHA의 redacted 보안 receipt와 명시적 enable이 있을 때만 환경·키 경로를 제외한 exact-SHA snapshot을 읽기 전용으로 만들고, 사용자 설정을 무시한 read-only Codex 검토를 실행한다.

## 계획 잠금 검증

- 외부 작업 기록의 `APPROVED_PLAN_SHA256`는 `db8e5cf15c77e766b7f45a8a695a99012bab62dba2c278c803e9092860a0a75f`와 같아야 한다.
- 외부 작업 기록의 `PLANNING_BASE_SHA`는 계획 잠금 커밋의 SHA이며 최종 SHA의 조상이어야 한다.
- `Handoff.md`, `.omo/plans/bomti-product-goal-and-scaffolding.md`, `.omo/drafts/bomti-product-goal-and-scaffolding.md`는 계획 잠금 뒤 수정할 수 없다.
- 최종 F1은 외부 값과 커밋된 값의 일치, 조상 관계, 세 계획 산출물의 무변경을 다시 검사한다.

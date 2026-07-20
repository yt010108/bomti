# Bomti Implementation Handoff

Approved plan SHA-256: db8e5cf15c77e766b7f45a8a695a99012bab62dba2c278c803e9092860a0a75f

## 새 구현 세션이 가장 먼저 할 일

1. 이 파일, `.omo/plans/bomti-product-goal-and-scaffolding.md`, `.omo/drafts/bomti-product-goal-and-scaffolding.md`, 새 세션에 주입된 workspace instructions를 처음부터 끝까지 읽는다. 실제 `AGENTS.md`가 발견될 때만 해당 범위의 추가 지침으로 읽으며, 현재 루트에는 그 파일이 없다고 가정한다.
2. `shasum -a 256 .omo/plans/bomti-product-goal-and-scaffolding.md` 결과가 위 승인 해시와 같은지 확인한다. 다르면 구현하지 말고 계획 변조 또는 인계 불일치로 보고한다.
3. 초안의 `High-accuracy review state`에서 같은 계획 해시에 대한 Momus와 독립 검토가 모두 `approved`인지 확인한다. 하나라도 아니면 구현을 시작하지 않는다.
4. 인터뷰를 다시 하거나 제품을 재기획하지 않는다. 충돌이 발견되지 않는 한 `omo:start-work` 또는 `$start-work` 절차로 승인 계획을 그대로 실행한다.
5. 제품 구현 전에 planning-lock bootstrap을 먼저 수행한다. 이 파일, 승인 계획, 역사 구분이 끝난 초안만 `chore(plan): lock approved Bomti implementation handoff`로 커밋하고 그 SHA를 저장소 밖 작업 기록에 `PLANNING_BASE_SHA`로 남긴다. 깨끗한 상태가 된 뒤 Todo 2 → Todo 1 → Todos 3-5 순서로 진행한다.

새 세션용 시작 문장:

> `Handoff.md`와 승인 계획을 완전히 읽고 해시 및 이중 승인 상태를 검증한 뒤 `$start-work`로 실행해줘. 재기획하지 말고 계획의 의존성, 격리 증거, 사용자 승인 경계를 그대로 지켜줘.

## 현재 상태

- 이 세션에서는 제품 구현을 시작하지 않았다.
- 현재 제품 코드는 기존 정적 Next.js 모형과 mock API 상태다.
- 새로 생긴 기획 산출물은 `Handoff.md`와 `.omo/` 아래 계획·초안뿐이며 아직 커밋되지 않았다.
- 배포, Supabase 프로젝트 변경, OAuth 설정, 유료 모델 호출, push/PR은 하지 않았다.
- 구현의 유일한 정본은 `.omo/plans/bomti-product-goal-and-scaffolding.md`다. 이 파일과 요약이 충돌하면 승인 계획이 우선한다.

## 제품 목표

취업 준비생이 자기소개서 문항, 답변, 목표 직무, 회사·공고 맥락을 입력하면 완성 답변을 대신 써주는 것이 아니라 그 산출물이 얼마나 맥락에 안 맞고 상투적이며 과장되고 신뢰를 해치는지 0-100 밤티 지수와 근거 문장, 설명, 개선 방향으로 판단하는 웹 서비스다.

공개 서비스는 답변 하나를 평가한다. 두 답변 비교는 운영자가 사람 취향과 Judge AI를 교정하는 내부 벤치마크에만 사용한다.

## 고정된 제품 결정

- 점수가 높을수록 더 밤티다. 구간은 `밤티 거의 없음 → 살짝 밤티 → 꽤 밤티 → 밤티 그 자체`다.
- 결과의 중심은 큰 숫자와 0-100 가로 막대, 다섯 위험 차원, 문장 세그먼트 근거, 설명, 제한된 개선 예시다. 합격/실패 판정이나 전체 재작성은 없다.
- 비로그인은 브라우저/IP 기준 하루 한 번 DeepSeek 미리보기를 받고 결과와 원문을 저장하지 않는다. 중복 요청은 이전 결과를 재전송하지 않는다.
- Google 로그인 사용자는 캠페인당 총 세 번의 상세 평가와 삭제 가능한 비식별 이력을 받는다.
- 인증 평가는 Luna와 Terra가 독립 판단하고 15점 이상 차이 또는 핵심 허위 주장 플래그 불일치가 있을 때만 Sol이 판정한다.
- 모델 ID, 가격, 예산은 운영자가 명시적으로 설정하고 사전 점검하기 전까지 유료 추론은 닫혀 있다. 자동 유료 대체는 없다.
- 모든 동의 항목과 `모두 동의`는 처음에 체크 해제되어 있다. 동의 → 세그먼트화·가명처리 → 모델 전송 순서를 바꾸지 않는다.
- 원문은 로그·DB·증거에 남지 않는다. 모델 출력도 응답 전에 다시 PII 검사한다.
- 인증 이력은 사용자가 개별 삭제하거나 계정을 삭제할 때 제거한다. 운영 비용은 사용자와 연결되지 않는 합계만 남긴다.
- 벤치마크에는 보수적 비식별 검사를 통과한 별도 복사본만 들어간다. 불확실하면 자동 제외하며 계정·평가 ID나 문맥 해시를 갖지 않는다.
- 로컬 완료 기준은 결정적 provider/auth fixture와 격리된 Supabase/Vercel 호환 검증이다. 실제 클라우드 활성화는 별도 사용자 승인 작업이다.
- 시각 방향은 절제된 제품 UI다. 밤티 지수 막대와 문장 근거만 강한 시그니처로 사용하며 흔한 보라색 AI 그라데이션, 글래스 카드, 반짝이, 종이 질감, 손글씨, 장식 모션을 쓰지 않는다.

## 구현 범위 밖

- 완성 자기소개서 생성 또는 전체 재작성
- 공개 A/B 비교와 공개 벤치마크 편집
- 관리자 웹 대시보드
- 결제, 자동 지원, 크롤링, 채용 매칭, RL 학습
- 사용자 ChatGPT/Codex 구독이나 OAuth를 Bomti 모델 비용에 사용하는 방식
- 허가 없는 배포·외부 서비스 변경·유료 호출·Git push

## 실행 규칙

- 계획의 15개 Todo를 의존성 순서로 실행하고 한 번에 하나만 `in_progress`로 둔다.
- 각 Todo는 코드만 작성해서 끝내지 않는다. 승인 계획에 적힌 자동 경계 검사, happy/failure 시나리오, 실제 표면 QA, 비밀·원문이 없는 증거가 모두 필요하다.
- 모든 증거는 주장한 커밋 SHA의 격리된 detached worktree에서 실행하고 체크아웃 바깥에 저장한다. 실행 전후 tracked/untracked 변경이 없어야 한다.
- 번호가 매겨진 Todo보다 먼저 수행하는 planning-lock bootstrap이 만든 `PLANNING_BASE_SHA`와 위 `APPROVED_PLAN_SHA256`는 저장소 내용만 다시 계산해 신뢰하지 말고 구현 세션의 외부 작업 기록에도 보관한다. Todo 1은 이 SHA를 만들지 않는다.
- 최종 검증은 같은 최종 코드 SHA에서 F1 → F2 → F3 → F4 순서로 각각 새 격리 환경에서 실행한다.
- 계획·이 파일·역사 표시를 끝낸 초안은 `PLANNING_BASE_SHA` 이후 바꾸지 않는다.
- 기존 사용자 변경을 되돌리지 않는다. 계획 밖 기능이나 호환용 mock shim을 추가하지 않는다.

## 운영자 입력과 승인 경계

로컬 구현은 결정적 fixture로 먼저 완성할 수 있다. 다음 값과 외부 작업은 구현자가 임의로 만들거나 실행하면 안 된다.

- Supabase/Vercel 프로젝트와 실제 URL
- Google OAuth client 및 redirect 설정
- OpenCode/OpenAI API 키와 정확한 모델 ID
- 모델별 가격 버전, 월 예산, Sol 한도, 유료 추론 활성화
- 실제 preview/production 배포와 live smoke test
- Git push, PR, 외부 데이터 import

값이 없으면 fail-closed 또는 `operator_not_authorized`/`operator_not_supplied` 증거로 남기고 로컬 기술 검증을 계속한다. 외부 상태를 바꿔야 할 때만 사용자에게 별도 승인을 요청한다.

## 완료 판정

- BOM-001부터 BOM-015까지 구현 경로, 자동 assertion, happy/failure 시나리오, SHA-bound 증거가 모두 연결되어야 한다.
- 개인정보, 소유권/RLS, 사용량 동시성, 부분 모델 호출 비용, 환불, 삭제 saga, 벤치마크 unlinkability를 실패 주입으로 검증한다.
- 375/768/1280 화면, 키보드, 포커스, reduced motion, axe/ARIA, grayscale, 긴 한글/XSS 상태를 실제 브라우저에서 확인한다.
- F1-F4가 같은 최종 코드 SHA와 이 승인 계획 해시를 승인해야 한다.
- 사람의 20-30개 페어 큐레이션과 실제 클라우드 가동은 기술 완료를 가장하지 않는 별도 운영 활동이다.

## 참고 경로

- 구현 정본: `.omo/plans/bomti-product-goal-and-scaffolding.md`
- 인터뷰 결정과 검토 영수증: `.omo/drafts/bomti-product-goal-and-scaffolding.md`
- 현재 코드 안내: `README.md`
- 기존 제품 문서: `docs/`

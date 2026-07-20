const inputMappings = [
  ["question", "input.question", ["question", "예", "1–1,200자", "1–1,200자", "QUESTION_TOO_SHORT, QUESTION_TOO_LONG"]],
  ["answer", "input.answer", ["answer", "예", "1–1,500자", "1–6,000자", "ANSWER_TOO_SHORT, ANSWER_TOO_LONG"]],
  ["targetRole", "input.targetRole", ["targetRole", "예", "1–120자", "1–120자", "TARGETROLE_TOO_SHORT, TARGETROLE_TOO_LONG"]],
  [
    "jobCompanyContext",
    "input.jobCompanyContext",
    ["jobCompanyContext", "예", "1–5,000자", "1–5,000자", "JOBCOMPANYCONTEXT_TOO_SHORT, JOBCOMPANYCONTEXT_TOO_LONG"]
  ],
  ["experienceEvidence", "input.experienceEvidence", ["experienceEvidence", "아니요", "0–6,000자", "0–6,000자", "EXPERIENCEEVIDENCE_TOO_LONG"]]
];

const scoreMappings = [
  ["contractVersion", "score.contract-version", ["contractVersion", "bomti_index_v1"]],
  ["점수 방향", "score.direction", ["점수 방향", "0–100 정수이며 높을수록 밤티 위험이 높다."]],
  ["구간", "score.descriptors", ["구간", "0–24 밤티 거의 없음; 25–49 살짝 밤티; 50–74 꽤 밤티; 75–100 밤티 그 자체"]],
  [
    "위험 차원",
    "score.dimensions",
    ["위험 차원", "contextMismatch 25%, genericityCliche 25%, credibilityRisk 20%, specificityGap 20%, toneReadabilityRisk 10%"]
  ],
  ["비상향 경로", "score.hybrid", ["비상향 경로", "Luna 차원 가중 평균과 Terra 전체 점수의 평균을 반올림한다."]],
  [
    "Sol 상향 경로",
    "score.sol",
    ["Sol 상향 경로", "두 점수가 15점 이상 다르거나 fabrication_or_unverifiable_claim 플래그가 불일치할 때만 Sol의 완전한 검증 결과로 대체한다."]
  ],
  [
    "세그먼트 근거",
    "score.segment",
    ["세그먼트 근거", "원문 답변을 결정적으로 s0001… 문장 세그먼트로 나눈 뒤 가명처리하고, 모델은 유효한 segmentId만 인용한다."]
  ]
];

const successMappings = [
  ["completed", "success.completed", ["completed", "HTTP 200에서 스키마 검증과 출력 PII 재검사를 마친 완전한 verdict 하나를 반환한다."]],
  [
    "부분 verdict",
    "success.partial-verdict",
    ["부분 verdict", "반환하지 않는다. Luna, Terra, Sol 또는 공급자 출력 중 일부만 유효한 경우에도 성공으로 승격하지 않는다."]
  ],
  [
    "비완료 응답",
    "success.non-completed",
    ["비완료 응답", "안정적 status와 code만 반환하며 공급자 원문, 입력, 이전 verdict를 포함하지 않는다."]
  ]
];

const terminalMappings = [
  ["completed", "terminal.completed", ["completed", "종결", "200", "completed", "없음", "완전한 verdict", "불필요"]],
  [
    "in_flight_before_acceptance",
    "terminal.in_flight_before_acceptance",
    ["in_flight_before_acceptance", "비종결", "202", "in_flight", "EVALUATION_IN_PROGRESS", "없음", "동일 본문·멱등성 키로 1초 뒤 가능"]
  ],
  ["validation_failed", "terminal.validation_failed", ["validation_failed", "종결", "400", "terminal", "INPUT_INVALID", "없음", "입력 수정 뒤 새 요청"]],
  ["consent_required", "terminal.consent_required", ["consent_required", "종결", "428", "terminal", "CONSENT_REQUIRED", "없음", "최신 동의 뒤 새 요청"]],
  [
    "quota_exhausted",
    "terminal.quota_exhausted",
    ["quota_exhausted", "종결", "429", "terminal", "GUEST_LIMIT, ACCOUNT_LIMIT, GLOBAL_LIMIT, SOL_LIMIT", "없음", "해당 버킷 또는 캠페인 정책 뒤 가능"]
  ],
  ["budget_disabled", "terminal.budget_disabled", ["budget_disabled", "종결", "503", "terminal", "PAID_EVALUATION_DISABLED", "없음", "운영자 설정 전 불가"]],
  [
    "provider_unavailable",
    "terminal.provider_unavailable",
    ["provider_unavailable", "종결", "503", "terminal", "GUEST_PROVIDER_UNAVAILABLE, AUTH_PROVIDER_UNAVAILABLE", "없음", "새로운 멱등성 요청으로 나중에 가능"]
  ],
  [
    "provider_output_invalid",
    "terminal.provider_output_invalid",
    ["provider_output_invalid", "종결", "502", "terminal", "PROVIDER_OUTPUT_INVALID", "없음", "사용자 허용량 환불 뒤 새 요청 가능"]
  ],
  [
    "cancelled_before_acceptance",
    "terminal.cancelled_before_acceptance",
    ["cancelled_before_acceptance", "종결", "서버 상태 499, 클라이언트 응답 중단", "terminal", "REQUEST_CANCELLED", "없음", "새 요청 가능"]
  ],
  ["failed_refunded", "terminal.failed_refunded", ["failed_refunded", "종결", "503", "terminal", "EVALUATION_FAILED_REFUNDED", "없음", "환불 뒤 새 요청 가능"]],
  [
    "failed_needs_adjudication",
    "terminal.failed_needs_adjudication",
    ["failed_needs_adjudication", "종결", "503", "terminal", "ADJUDICATION_REQUIRED", "없음", "계정 허용량 환불 뒤 나중에 가능"]
  ]
];

const errorMappings = [
  ["EVALUATION_IN_PROGRESS", "error.EVALUATION_IN_PROGRESS", ["EVALUATION_IN_PROGRESS", "202", "in_flight_before_acceptance", "동일 게스트 요청이 아직 공급자 수락 전 처리 중"]],
  ["INPUT_INVALID", "error.INPUT_INVALID", ["INPUT_INVALID", "400", "validation_failed", "본문 형식 또는 필드 경계 위반"]],
  ["CONSENT_REQUIRED", "error.CONSENT_REQUIRED", ["CONSENT_REQUIRED", "428", "consent_required", "필수 동의 누락 또는 버전 만료"]],
  ["GUEST_LIMIT", "error.GUEST_LIMIT", ["GUEST_LIMIT", "429", "quota_exhausted", "게스트 IP 또는 브라우저 버킷 소진"]],
  ["ACCOUNT_LIMIT", "error.ACCOUNT_LIMIT", ["ACCOUNT_LIMIT", "429", "quota_exhausted", "계정 캠페인 허용량 소진"]],
  ["GLOBAL_LIMIT", "error.GLOBAL_LIMIT", ["GLOBAL_LIMIT", "429", "quota_exhausted", "게스트 전역 일일 한도 소진"]],
  ["SOL_LIMIT", "error.SOL_LIMIT", ["SOL_LIMIT", "429", "quota_exhausted", "Sol 일일 한도 소진"]],
  ["PAID_EVALUATION_DISABLED", "error.PAID_EVALUATION_DISABLED", ["PAID_EVALUATION_DISABLED", "503", "budget_disabled", "유료 추론이 fail-closed 상태"]],
  ["GUEST_PROVIDER_UNAVAILABLE", "error.GUEST_PROVIDER_UNAVAILABLE", ["GUEST_PROVIDER_UNAVAILABLE", "503", "provider_unavailable", "무료 게스트 공급자 사용 불가"]],
  ["AUTH_PROVIDER_UNAVAILABLE", "error.AUTH_PROVIDER_UNAVAILABLE", ["AUTH_PROVIDER_UNAVAILABLE", "503", "provider_unavailable", "인증 평가 공급자 사용 불가"]],
  ["PROVIDER_OUTPUT_INVALID", "error.PROVIDER_OUTPUT_INVALID", ["PROVIDER_OUTPUT_INVALID", "502", "provider_output_invalid", "구조·범위·세그먼트·PII 검증 실패"]],
  ["REQUEST_CANCELLED", "error.REQUEST_CANCELLED", ["REQUEST_CANCELLED", "서버 상태 499", "cancelled_before_acceptance", "첫 수락 전에 취소됨"]],
  ["EVALUATION_FAILED_REFUNDED", "error.EVALUATION_FAILED_REFUNDED", ["EVALUATION_FAILED_REFUNDED", "503", "failed_refunded", "실패했고 사용자 허용량을 환불함"]],
  ["ADJUDICATION_REQUIRED", "error.ADJUDICATION_REQUIRED", ["ADJUDICATION_REQUIRED", "503", "failed_needs_adjudication", "Sol 판정 없이는 완전한 verdict를 만들 수 없음"]],
  ["GUEST_ATTEMPT_ALREADY_USED", "error.GUEST_ATTEMPT_ALREADY_USED", ["GUEST_ATTEMPT_ALREADY_USED", "409", "게스트 중복 종결 표면", "수락 가능성 이후 anti-abuse 표식으로 재사용 차단"]],
  ["AUTH_STATE_INVALID", "error.AUTH_STATE_INVALID", ["AUTH_STATE_INVALID", "400", "OAuth 콜백", "PKCE state 또는 verifier 불일치"]],
  ["AUTH_CODE_EXCHANGE_FAILED", "error.AUTH_CODE_EXCHANGE_FAILED", ["AUTH_CODE_EXCHANGE_FAILED", "502", "OAuth 콜백", "허용된 코드 교환 실패"]],
  ["AUTH_EMAIL_MISSING", "error.AUTH_EMAIL_MISSING", ["AUTH_EMAIL_MISSING", "403", "OAuth 콜백", "인증 ID에 필수 이메일 없음"]],
  ["AUTH_SESSION_EXPIRED", "error.AUTH_SESSION_EXPIRED", ["AUTH_SESSION_EXPIRED", "401", "OAuth 콜백·재인증", "세션 또는 재인증 시간 만료"]],
  ["AUTH_REDIRECT_DENIED", "error.AUTH_REDIRECT_DENIED", ["AUTH_REDIRECT_DENIED", "400", "OAuth 콜백", "redirect allowlist 불일치"]]
];

const retryMappings = [
  ["게스트 completed", "retry.completed-guest", ["게스트 completed", "IP·쿠키·전역 각 1회 소비", "해당 없음", "수락된 게스트 비용 유지", "같은 멱등성 키로 verdict 재전송 금지"]],
  ["Sol 없는 인증 completed", "retry.completed-auth", ["Sol 없는 인증 completed", "계정 1회 소비", "해당 없음", "Luna·Terra 수락 비용 유지", "종결 요청 재실행 금지"]],
  ["Sol 있는 인증 completed", "retry.completed-sol", ["Sol 있는 인증 completed", "계정 1회 소비", "수락 뒤 1회 소비", "모든 수락 비용 유지", "종결 요청 재실행 금지"]],
  [
    "검증·동의·쿼터·예산 거절 또는 수락 전 취소",
    "retry.pre-acceptance",
    ["검증·동의·쿼터·예산 거절 또는 수락 전 취소", "소비 없음", "소비 없음", "모든 예약 해제", "조건 수정 뒤 새 요청 가능"]
  ],
  ["공급자 수락 전 거절이 증명됨", "retry.proven-rejection", ["공급자 수락 전 거절이 증명됨", "게스트·계정·전역 환불", "예약 해제", "미수락 예약 해제", "새 요청 가능"]],
  [
    "수락 불명확·출력 무효·수락 뒤 timeout/취소",
    "retry.ambiguous",
    [
      "수락 불명확·출력 무효·수락 뒤 timeout/취소",
      "사용자 허용량 환불, 게스트 anti-abuse 표식 유지",
      "수락이 알려졌을 때만 소비, 아니면 reconciliation까지 보류",
      "최악 비용 예약을 유지한 뒤 확인된 비용만 정산",
      "자동 재시도·자동 예약 해제 금지"
    ]
  ],
  [
    "Sol 필요하지만 capped 또는 unavailable",
    "retry.sol-unavailable",
    ["Sol 필요하지만 capped 또는 unavailable", "계정 허용량 환불", "소비 없음", "Luna·Terra 비용 유지, Sol 예약 해제", "부분 verdict 없이 나중에 새 요청 가능"]
  ],
  [
    "만료된 수락 전 예약",
    "retry.expired",
    ["만료된 수락 전 예약", "허용량 해제", "허용량 해제", "나중에 수락이 확인되지 않으면 예약 해제", "게스트 멱등성 anti-abuse 표식은 유지"]
  ]
];

export const requiredTables = [
  { heading: "입력 계약", headers: ["필드", "필수", "게스트 범위", "인증 범위", "안정적 필드 오류 코드"], mappings: inputMappings },
  { heading: "점수 계약", headers: ["항목", "고정 매핑"], mappings: scoreMappings },
  { heading: "성공 및 부분 verdict 규칙", headers: ["결과", "HTTP 및 공개 계약"], mappings: successMappings },
  {
    heading: "터미널 상태 및 HTTP 매핑",
    headers: ["상태", "종결 여부", "HTTP", "공개 상태", "안정적 오류 코드", "verdict", "재시도"],
    mappings: terminalMappings
  },
  { heading: "안정적 오류 코드 매핑", headers: ["안정적 오류 코드", "HTTP", "상태·표면", "공개 의미"], mappings: errorMappings },
  { heading: "재시도 및 환불 매핑", headers: ["경로", "사용자 허용량", "Sol 허용량", "예산·비용", "재시도 및 중복 규칙"], mappings: retryMappings }
];

const inputMappings = [
  [
    "question",
    "input.question",
    [
      ["필수", "예"],
      ["게스트 범위", "1–1,200자"],
      ["인증 범위", "1–1,200자"],
      ["안정적 필드 오류 코드", "QUESTION_TOO_SHORT", "QUESTION_TOO_LONG"]
    ]
  ],
  [
    "answer",
    "input.answer",
    [
      ["필수", "예"],
      ["게스트 범위", "1–1,500자"],
      ["인증 범위", "1–6,000자"],
      ["안정적 필드 오류 코드", "ANSWER_TOO_SHORT", "ANSWER_TOO_LONG"]
    ]
  ],
  [
    "targetRole",
    "input.targetRole",
    [
      ["필수", "예"],
      ["게스트 범위", "1–120자"],
      ["인증 범위", "1–120자"],
      ["안정적 필드 오류 코드", "TARGETROLE_TOO_SHORT", "TARGETROLE_TOO_LONG"]
    ]
  ],
  [
    "jobCompanyContext",
    "input.jobCompanyContext",
    [
      ["필수", "예"],
      ["게스트 범위", "1–5,000자"],
      ["인증 범위", "1–5,000자"],
      ["안정적 필드 오류 코드", "JOBCOMPANYCONTEXT_TOO_SHORT", "JOBCOMPANYCONTEXT_TOO_LONG"]
    ]
  ],
  [
    "experienceEvidence",
    "input.experienceEvidence",
    [
      ["필수", "아니요"],
      ["게스트 범위", "0–6,000자"],
      ["인증 범위", "0–6,000자"],
      ["안정적 필드 오류 코드", "EXPERIENCEEVIDENCE_TOO_LONG"]
    ]
  ]
];

const scoreMappings = [
  ["contractVersion", "score.contract-version", [["고정 매핑", "bomti_index_v1"]]],
  ["점수 방향", "score.direction", [["고정 매핑", "0–100", "높을수록"]]],
  ["구간", "score.descriptors", [["고정 매핑", "0–24", "25–49", "50–74", "75–100"]]],
  [
    "위험 차원",
    "score.dimensions",
    [["고정 매핑", "contextMismatch", "genericityCliche", "credibilityRisk", "specificityGap", "toneReadabilityRisk"]]
  ],
  ["비상향 경로", "score.hybrid", [["고정 매핑", "Luna", "Terra", "반올림"]]],
  ["Sol 상향 경로", "score.sol", [["고정 매핑", "15점", "fabrication_or_unverifiable_claim", "Sol"]]],
  ["세그먼트 근거", "score.segment", [["고정 매핑", "s0001", "segmentId"]]]
];

const successMappings = [
  ["completed", "success.completed", [["HTTP 및 공개 계약", "HTTP 200", "완전한 verdict"]]],
  ["부분 verdict", "success.partial-verdict", [["HTTP 및 공개 계약", "반환하지 않는다", "성공으로 승격하지 않는다"]]],
  ["비완료 응답", "success.non-completed", [["HTTP 및 공개 계약", "status", "code", "이전 verdict"]]]
];

const terminalMappings = [
  [
    "completed",
    "terminal.completed",
    [["종결 여부", "종결"], ["HTTP", "200"], ["공개 상태", "completed"], ["안정적 오류 코드", "없음"], ["verdict", "완전한 verdict"]]
  ],
  [
    "in_flight_before_acceptance",
    "terminal.in_flight_before_acceptance",
    [["종결 여부", "비종결"], ["HTTP", "202"], ["공개 상태", "in_flight"], ["안정적 오류 코드", "EVALUATION_IN_PROGRESS"], ["verdict", "없음"], ["재시도", "1초"]]
  ],
  ["validation_failed", "terminal.validation_failed", [["HTTP", "400"], ["공개 상태", "terminal"], ["안정적 오류 코드", "INPUT_INVALID"], ["verdict", "없음"]]],
  ["consent_required", "terminal.consent_required", [["HTTP", "428"], ["공개 상태", "terminal"], ["안정적 오류 코드", "CONSENT_REQUIRED"], ["verdict", "없음"]]],
  [
    "quota_exhausted",
    "terminal.quota_exhausted",
    [["HTTP", "429"], ["공개 상태", "terminal"], ["안정적 오류 코드", "GUEST_LIMIT", "ACCOUNT_LIMIT", "GLOBAL_LIMIT", "SOL_LIMIT"], ["verdict", "없음"]]
  ],
  ["budget_disabled", "terminal.budget_disabled", [["HTTP", "503"], ["공개 상태", "terminal"], ["안정적 오류 코드", "PAID_EVALUATION_DISABLED"], ["verdict", "없음"]]],
  [
    "provider_unavailable",
    "terminal.provider_unavailable",
    [["HTTP", "503"], ["공개 상태", "terminal"], ["안정적 오류 코드", "GUEST_PROVIDER_UNAVAILABLE", "AUTH_PROVIDER_UNAVAILABLE"], ["verdict", "없음"]]
  ],
  ["provider_output_invalid", "terminal.provider_output_invalid", [["HTTP", "502"], ["공개 상태", "terminal"], ["안정적 오류 코드", "PROVIDER_OUTPUT_INVALID"], ["verdict", "없음"]]],
  ["cancelled_before_acceptance", "terminal.cancelled_before_acceptance", [["HTTP", "499"], ["공개 상태", "terminal"], ["안정적 오류 코드", "REQUEST_CANCELLED"], ["verdict", "없음"]]],
  ["failed_refunded", "terminal.failed_refunded", [["HTTP", "503"], ["공개 상태", "terminal"], ["안정적 오류 코드", "EVALUATION_FAILED_REFUNDED"], ["verdict", "없음"]]],
  [
    "failed_needs_adjudication",
    "terminal.failed_needs_adjudication",
    [["HTTP", "503"], ["공개 상태", "terminal"], ["안정적 오류 코드", "ADJUDICATION_REQUIRED"], ["verdict", "없음"], ["재시도", "환불"]]
  ]
];

const errorMappings = [
  ["EVALUATION_IN_PROGRESS", "202", "in_flight_before_acceptance"],
  ["INPUT_INVALID", "400", "validation_failed"],
  ["CONSENT_REQUIRED", "428", "consent_required"],
  ["GUEST_LIMIT", "429", "quota_exhausted"],
  ["ACCOUNT_LIMIT", "429", "quota_exhausted"],
  ["GLOBAL_LIMIT", "429", "quota_exhausted"],
  ["SOL_LIMIT", "429", "quota_exhausted"],
  ["PAID_EVALUATION_DISABLED", "503", "budget_disabled"],
  ["GUEST_PROVIDER_UNAVAILABLE", "503", "provider_unavailable"],
  ["AUTH_PROVIDER_UNAVAILABLE", "503", "provider_unavailable"],
  ["PROVIDER_OUTPUT_INVALID", "502", "provider_output_invalid"],
  ["REQUEST_CANCELLED", "499", "cancelled_before_acceptance"],
  ["EVALUATION_FAILED_REFUNDED", "503", "failed_refunded"],
  ["ADJUDICATION_REQUIRED", "503", "failed_needs_adjudication"],
  ["GUEST_ATTEMPT_ALREADY_USED", "409", "게스트 중복 종결 표면"],
  ["AUTH_STATE_INVALID", "400", "OAuth 콜백"],
  ["AUTH_CODE_EXCHANGE_FAILED", "502", "OAuth 콜백"],
  ["AUTH_EMAIL_MISSING", "403", "OAuth 콜백"],
  ["AUTH_SESSION_EXPIRED", "401", "OAuth 콜백·재인증"],
  ["AUTH_REDIRECT_DENIED", "400", "OAuth 콜백"]
].map(([key, http, surface]) => [key, `error.${key}`, [["HTTP", http], ["상태·표면", surface]]]);

const retryMappings = [
  ["게스트 completed", "retry.completed-guest", [["사용자 허용량", "각 1회 소비"], ["예산·비용", "수락된 게스트 비용 유지"], ["재시도 및 중복 규칙", "재전송 금지"]]],
  ["Sol 없는 인증 completed", "retry.completed-auth", [["사용자 허용량", "계정 1회 소비"], ["예산·비용", "Luna·Terra"], ["재시도 및 중복 규칙", "재실행 금지"]]],
  ["Sol 있는 인증 completed", "retry.completed-sol", [["Sol 허용량", "수락 뒤 1회 소비"], ["예산·비용", "모든 수락 비용 유지"], ["재시도 및 중복 규칙", "재실행 금지"]]],
  [
    "검증·동의·쿼터·예산 거절 또는 수락 전 취소",
    "retry.pre-acceptance",
    [["사용자 허용량", "소비 없음"], ["Sol 허용량", "소비 없음"], ["예산·비용", "모든 예약 해제"], ["재시도 및 중복 규칙", "새 요청 가능"]]
  ],
  ["공급자 수락 전 거절이 증명됨", "retry.proven-rejection", [["사용자 허용량", "환불"], ["예산·비용", "미수락 예약 해제"], ["재시도 및 중복 규칙", "새 요청 가능"]]],
  [
    "수락 불명확·출력 무효·수락 뒤 timeout/취소",
    "retry.ambiguous",
    [["사용자 허용량", "사용자 허용량 환불", "anti-abuse"], ["예산·비용", "최악 비용 예약"], ["재시도 및 중복 규칙", "자동 재시도", "자동 예약 해제 금지"]]
  ],
  ["Sol 필요하지만 capped 또는 unavailable", "retry.sol-unavailable", [["사용자 허용량", "계정 허용량 환불"], ["예산·비용", "Luna·Terra 비용 유지"], ["재시도 및 중복 규칙", "부분 verdict 없이"]]],
  ["만료된 수락 전 예약", "retry.expired", [["사용자 허용량", "허용량 해제"], ["Sol 허용량", "허용량 해제"], ["예산·비용", "예약 해제"], ["재시도 및 중복 규칙", "anti-abuse 표식은 유지"]]]
];

export const requiredTables = [
  {
    heading: "입력 계약",
    headers: ["필드", "필수", "게스트 범위", "인증 범위", "안정적 필드 오류 코드"],
    mappings: inputMappings
  },
  { heading: "점수 계약", headers: ["항목", "고정 매핑"], mappings: scoreMappings },
  { heading: "성공 및 부분 verdict 규칙", headers: ["결과", "HTTP 및 공개 계약"], mappings: successMappings },
  {
    heading: "터미널 상태 및 HTTP 매핑",
    headers: ["상태", "종결 여부", "HTTP", "공개 상태", "안정적 오류 코드", "verdict", "재시도"],
    mappings: terminalMappings
  },
  {
    heading: "안정적 오류 코드 매핑",
    headers: ["안정적 오류 코드", "HTTP", "상태·표면", "공개 의미"],
    mappings: errorMappings
  },
  {
    heading: "재시도 및 환불 매핑",
    headers: ["경로", "사용자 허용량", "Sol 허용량", "예산·비용", "재시도 및 중복 규칙"],
    mappings: retryMappings
  }
];

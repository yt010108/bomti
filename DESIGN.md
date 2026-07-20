# Bomti 디자인 시스템

## 방향과 근거

Bomti는 답변을 대신 써 주는 생성 도구가 아니라, 사용자가 자기 글을 차분히 검토하도록 돕는 평가 도구다. 화면은 채용 서류를 검토하는 종이와 교정 메모에서 출발한다. 시선을 끄는 AI 장식보다 질문, 점수, 문장 근거의 위계를 명확하게 만든다.

2026-07-21 운영자 결정에 따라 승인 계획의 `omo:frontend` 실행 요구는 `EXECUTION_POLICY.md`의 Codex-only 규칙으로 대체했다. LazyCodex/OMO는 사용하지 않았으며, 이 결정은 디자인 실행 수단만 바꾸고 BOM-011의 범위와 검증 기준은 바꾸지 않는다.

## 선택한 시각 개념

- 이름: 조용한 교정지
- 기본 배경은 따뜻한 종이색, 본문은 잉크에 가까운 남색이다.
- 포인트 밤색은 선택·진행·강조에만 제한적으로 쓴다.
- 점수 meter는 숫자, 구간 이름, 눈금, marker를 함께 제공한다.
- 문장 근거는 인용문과 근거 ID를 분리해 스캔하기 쉽게 만든다.
- 그림자, 유리 효과, 장식적 gradient, 의미 없는 아이콘은 사용하지 않는다.

## 토큰

| 역할 | 값 | 용도 |
| --- | --- | --- |
| `--paper` | `#f5f1e8` | 페이지 배경 |
| `--surface` | `#fffdf8` | 카드와 입력 배경 |
| `--ink` | `#18252b` | 본문과 핵심 수치 |
| `--muted` | `#5f6b6e` | 보조 설명 |
| `--line` | `#c8c1b3` | 구획과 입력 테두리 |
| `--accent` | `#7b3f2b` | 선택, marker, CTA |
| `--accent-soft` | `#ead9cf` | 강조 배경 |
| `--success` | `#245f47` | 성공 상태 |
| `--warning` | `#8a570f` | 주의 상태 |
| `--danger` | `#9b2f2f` | 오류 상태 |

간격은 4px 기준의 `4, 8, 12, 16, 24, 32, 48, 64` 체계를 사용한다. 모서리는 입력 8px, 카드 12px로 제한한다. 테두리와 여백을 우선하고 그림자는 사용하지 않는다.

## 한국어 타이포그래피

시스템 산세리프인 `Pretendard`, `Apple SD Gothic Neo`, `Noto Sans KR`, `sans-serif` 순서로 사용한다. 본문 행간은 1.65, 긴 평가 근거는 1.75다. 숫자는 `font-variant-numeric: tabular-nums`로 정렬한다. 본문 최소 크기는 16px이며 보조 문구도 14px 아래로 내리지 않는다.

## 컴포넌트 해부

- `Button`: 주 행동, 보조 행동, 위험 행동을 텍스트와 테두리 형태로 구분한다.
- `FormField`: label, 필수/선택 상태, 설명, counter, 오류를 하나의 접근성 관계로 묶는다.
- `ConsentControl`: 전체 동의와 개별 동의를 모두 보이며 숨김·사전 선택을 금지한다.
- `StatusBanner`: 상태 이름과 설명을 함께 제공하고 `status` 또는 `alert` 역할을 사용한다.
- `ScoreMeter`: 0–100 숫자, 정확한 구간명, 눈금, marker, 다섯 위험 차원을 제공한다.
- `EvidenceCard`: 검증된 segment ID와 문장, 설명을 안전한 텍스트로만 렌더링한다.

## 반응형

- 375px: 단일 열, 버튼은 필요한 경우 전체 너비, meter label은 두 줄을 허용한다.
- 768px: 입력과 상태 표면은 여전히 단일 읽기 흐름을 유지한다.
- 1280px: 최대 1120px 컨테이너 안에서 showcase를 두 열로 배치한다.
- 긴 한국어와 공백 없는 문자열은 `overflow-wrap: anywhere`로 잘림을 막는다.

## 모션

상태 전환은 opacity와 4px 이하 이동으로 160ms 안에 끝낸다. 점수 marker는 처음 렌더링할 때 이동하지 않는다. `prefers-reduced-motion: reduce`에서는 transition과 animation을 제거한다.

## 접근성

- 모든 입력은 보이는 label과 programmatic association을 가진다.
- focus는 3px 외곽선과 3px offset으로 표시한다.
- 오류는 색뿐 아니라 `오류` 텍스트와 `aria-invalid`, `aria-describedby`로 전달한다.
- meter는 `role=progressbar`, 이름, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, 구간 설명을 가진다.
- 상태는 아이콘 문자, 제목, 설명을 함께 사용한다.
- 최소 44px 포인터 목표와 충분한 명도 대비를 유지한다.

## 상태

primitive는 default, hover, focus-visible, disabled, loading, error, success, warning, score 0/67/100, reduced-motion을 지원한다. showcase의 실패 fixture는 접근 가능한 이름이 없는 meter를 의도적으로 렌더링하며 정상 제품 코드에서는 사용하지 않는다.

## 개발 전용 showcase

`/_showcase`는 개발 환경에서만 primitive와 상태를 확인하기 위한 표면이다. production에서는 `notFound()`로 닫히며 운영 탐색이나 사용자 기능으로 노출하지 않는다. fixture 문자열은 합성 데이터만 사용한다.

## 기술 부채

- 실제 공개 입력·결과 화면은 Todo 11·12에서 이 primitive를 조합한다.
- Google 인증과 이력 화면은 Todo 13에서 상태·탐색 패턴을 확장한다.
- production 빌드에서 showcase 모듈 자체를 물리적으로 제거하는 별도 번들 플러그인은 도입하지 않았다. 대신 production 요청을 정적 404로 닫고 실제 기능 번들과 연결하지 않는다.

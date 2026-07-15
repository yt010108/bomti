# 데모 시나리오

## 데모 제목

공공기관 정보보호 면접 준비 에이전트 평가

## 데모 입력 예시

| 항목 | 값 |
| --- | --- |
| 목표 기관 | 한국인터넷진흥원 |
| 목표 직무 | 정보보호 |
| 출력 유형 | 면접 준비 리포트 |
| 프로젝트 | 보안 취약점 분석, SBOM, 공공기관 NCS MCP |
| 요구사항 | 직무 적합도, 예상 질문, 자기소개서 연결 포인트 |

## 데모 흐름

1. 사용자가 목표 기관과 직무를 입력한다.
2. 프로젝트 설명과 자기소개서 초안을 붙여 넣는다.
3. Bomti가 두 개의 답변 후보를 생성한다.
4. Judge가 각 답변을 100점 기준으로 평가한다.
5. 화면에 항목별 점수와 평가 이유가 표시된다.
6. 사용자가 더 좋은 답변을 선택한다.
7. 선택 결과가 preference 데이터로 저장된다.
8. JSONL export 화면에서 학습 데이터로 변환된 결과를 확인한다.

## 해커톤용 설명 문장

Bomti is a Korean work-agent evaluation platform that turns real task outputs into human preference data for training better AI agents.

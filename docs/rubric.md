# Bomti 점수 계약

루브릭 버전은 `bomti_index_v1`이다. 점수는 답변의 품질을 보상하는 점수가 아니라 맥락에 맞지 않거나 상투적·과장된 표현의 위험 지수다. 따라서 점수가 높을수록 더 밤티다.

## 위험 차원

| 차원 | 가중치 | 의미 |
| --- | ---: | --- |
| `contextMismatch` | 25% | 질문·직무·회사/공고 맥락과의 불일치 |
| `genericityCliche` | 25% | 누구에게나 적용되는 상투적 문구와 클리셰 |
| `credibilityRisk` | 20% | 검증하기 어렵거나 과장된 주장 |
| `specificityGap` | 20% | 행동·근거·성과의 부족 |
| `toneReadabilityRisk` | 10% | 읽기 어려움이나 부적절한 어조 |

Luna의 가중 차원 점수와 Terra의 전체 판단을 결합한다. 두 결과가 15점 이상 다르거나 `fabrication_or_unverifiable_claim` 플래그가 다르면 Sol이 정해진 필드만 adjudicate한다. Sol을 사용할 수 없으면 부분 성공을 반환하지 않고 retry-later 상태가 된다.

## 표현 규칙

근거는 검증된 문장 `segmentId`를 사용한다. 설명과 개선 방향은 사용자 텍스트를 재작성하지 않으며, 짧은 예시도 전체 완성 답변을 제공하지 않는다. 자세한 schema와 terminal error는 [requirements.md](requirements.md)를 따른다.

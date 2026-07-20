# 구현 순서

이 순서는 승인 계획의 의존성을 요약한 것이다. 세부 acceptance와 SHA-bound 증거 명령은 승인 계획을 우선한다.

1. 재현 가능한 도구체인과 증거 lane을 고정한다.
2. 요구사항 원장을 정본으로 만들고 점수·입력 계약, Supabase/RLS, 디자인 primitives를 구축한다.
3. privacy, 쿼터/예산, provider adapter, Judge orchestration, 평가 API를 의존성 순서로 구현한다.
4. 공개 입력/결과, Google 인증·이력·삭제, 내부 benchmark CLI, 운영 preflight를 완성한다.
5. 같은 최종 SHA에서 F1 계획 준수, F2 보안/독립 검토, F3 브라우저 QA, F4 범위 충실도를 순서대로 승인받는다.

실제 Supabase/Vercel/OAuth/유료 모델 활성화, live smoke test, Git push/PR, 외부 데이터 import는 이 로컬 순서에 포함되지 않으며 별도의 운영자 승인 경계다.

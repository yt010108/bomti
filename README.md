# Bomti

Bomti is a Korean work-agent evaluation platform that turns real task outputs into human preference data for training better AI agents.

## 한 줄 정의

AI 에이전트용 시험장, 채점기, 선호 데이터 저장소.

## 문제 정의

AI 에이전트는 답변을 생성할 수 있지만, 실제 업무에서 얼마나 정확하고 실용적인지 검증하기 어렵다.  
특히 한국어 업무형 리서치, 공공기관 취업 준비, 보안 리포트, 자기소개서 피드백처럼 근거와 맥락이 중요한 작업은 단순 정답 채점보다 루브릭 기반 평가가 필요하다.

## 초기 도메인

첫 버전은 공공기관·IT·보안 취업 준비 업무를 수행하는 에이전트를 평가하는 데 집중한다.

예시 task:

- KISA 정보보호 직무 면접 준비 리포트 작성
- 채용공고에서 자격요건, 우대사항, NCS 추출
- 프로젝트 경험을 자기소개서 STAR 소재로 변환
- 기관 이슈 기반 예상 면접 질문 생성
- 보안 리포트의 기술 정확성 평가

## 핵심 흐름

1. 사용자가 목표 기관, 목표 직무, 공고, 프로젝트 설명, 자기소개서 초안을 입력한다.
2. 에이전트가 답변 후보를 생성한다.
3. LLM judge가 루브릭 기준으로 답변을 평가한다.
4. 사용자가 A/B 선택으로 더 좋은 답변을 고른다.
5. 선택 결과와 평가 이유가 preference dataset으로 저장된다.
6. 저장된 데이터는 향후 judge 개선, prompt 개선, 에이전트 학습 데이터로 활용된다.

## 핵심 기능

- Task 입력
- Agent answer generation
- Rubric-based LLM judge
- Human A/B preference
- Preference dataset 저장
- JSONL export
- 간단한 평가 대시보드

## 첫 개발 우선순위

1. Task 입력 폼
2. 답변 후보 2개 생성
3. judge 평가 JSON 생성
4. A/B 선택 UI
5. SQLite/Prisma 저장
6. JSONL export
7. 데모 task 20개 작성

## 폴더 구조

```text
bomti/
  README.md
  docs/
    product-plan.md
    architecture.md
    rubric.md
    roadmap.md
    demo-scenario.md
  app/
    api/
      tasks/
      judge/
      preferences/
  components/
  lib/
    agent/
    judge/
    dataset/
  prisma/
    schema.prisma
  prompts/
    agent-v1.md
    judge-v1.md
  data/
    seed-tasks.json
    exports/
```

## 로컬 실행 예정

```bash
npm install
npm run dev
```

## GitHub 생성 후 push

```bash
git init
git branch -M main
git remote add origin https://github.com/yt010108/bomti.git
git add .
git commit -m "Initial Bomti project setup"
git push -u origin main
```

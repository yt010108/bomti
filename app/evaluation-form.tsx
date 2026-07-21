"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Button, ConsentControl, emptyConsentValue, EvaluationResult, FormField, StatusBanner, type ConsentValue } from "../components/bomti";
import { EvaluationInputError, validateEvaluationInput } from "../lib/contracts/evaluation";
import { codePointLength } from "../lib/contracts/text";

type Audience = "guest" | "authenticated";
type FormStatus = "idle" | "validating" | "submitting" | "cancelled" | "success" | "network" | "provider" | "budget" | "quota" | "invalid";
type FormValues = Record<"question" | "answer" | "targetRole" | "jobCompanyContext" | "experienceEvidence", string>;
type CompletedResult = { audience: Audience; verdict: Parameters<typeof EvaluationResult>[0]["verdict"]; segments: readonly { segmentId: string; text: string }[] };

const blankValues: FormValues = {
  question: "",
  answer: "",
  targetRole: "",
  jobCompanyContext: "",
  experienceEvidence: ""
};

const limits = {
  question: 1200,
  answer: { guest: 1500, authenticated: 6000 },
  targetRole: 120,
  jobCompanyContext: 5000,
  experienceEvidence: 6000
} as const;

const errorMessages: Record<string, string> = {
  INPUT_INVALID: "입력 형식을 확인해 주세요.",
  QUESTION_TOO_SHORT: "질문을 입력해 주세요.",
  QUESTION_TOO_LONG: "질문은 1,200자 이하로 입력해 주세요.",
  ANSWER_TOO_SHORT: "자기소개서 답변을 입력해 주세요.",
  ANSWER_TOO_LONG: "답변 글자 수 제한을 확인해 주세요.",
  TARGETROLE_TOO_SHORT: "지원 직무를 입력해 주세요.",
  TARGETROLE_TOO_LONG: "지원 직무는 120자 이하로 입력해 주세요.",
  JOBCOMPANYCONTEXT_TOO_SHORT: "회사 또는 공고 맥락을 입력해 주세요.",
  JOBCOMPANYCONTEXT_TOO_LONG: "회사·공고 맥락은 5,000자 이하로 입력해 주세요.",
  EXPERIENCEEVIDENCE_TOO_LONG: "경험 근거는 6,000자 이하로 입력해 주세요."
};

function fixtureResult(score: number): CompletedResult {
  const dimensions = { contextMismatch: score, genericityCliche: score, credibilityRisk: score, specificityGap: score, toneReadabilityRisk: score };
  return {
    audience: "guest",
    segments: [],
    verdict: {
      finalIndex: score,
      dimensions,
      explanation: "합성 fixture 결과입니다.",
      evidence: [{ segmentId: "s0001", dimension: "genericityCliche", summary: "검증된 문장 근거입니다.", severity: score }],
      improvements: [{ dimension: "genericityCliche", direction: "행동과 결과를 함께 제시해 주세요.", example: "상황, 행동, 결과를 연결합니다." }]
    }
  };
}

function errorFor(code: string): Partial<Record<keyof FormValues, string>> {
  if (code.startsWith("QUESTION_")) return { question: errorMessages[code] };
  if (code.startsWith("ANSWER_")) return { answer: errorMessages[code] };
  if (code.startsWith("TARGETROLE_")) return { targetRole: errorMessages[code] };
  if (code.startsWith("JOBCOMPANYCONTEXT_")) return { jobCompanyContext: errorMessages[code] };
  if (code.startsWith("EXPERIENCEEVIDENCE_")) return { experienceEvidence: errorMessages[code] };
  return { question: errorMessages[code] ?? errorMessages.INPUT_INVALID };
}

function allConsented(consent: ConsentValue) {
  return Object.values(consent).every(Boolean);
}

function statusMessage(status: FormStatus, audience: Audience) {
  const quota = audience === "guest" ? "오늘 브라우저당 1회" : "이번 캠페인에서 3회";
  switch (status) {
    case "validating": return { tone: "info" as const, title: "입력을 확인하고 있습니다", description: "글자 수와 필수 항목을 확인합니다." };
    case "submitting": return { tone: "info" as const, title: "평가를 요청하고 있습니다", description: "가명처리된 입력만 전달하며 언제든 요청을 취소할 수 있습니다." };
    case "cancelled": return { tone: "warning" as const, title: "평가 요청을 취소했습니다", description: "제출한 원문은 브라우저 밖에 저장하지 않았습니다." };
    case "success": return { tone: "success" as const, title: "평가 요청을 마쳤습니다", description: audience === "guest" ? "미리보기 결과는 저장하지 않습니다." : "인증 평가 결과는 삭제 가능한 이력으로 표시됩니다." };
    case "network": return { tone: "error" as const, title: "네트워크 연결을 확인해 주세요", description: "요청을 완료하지 못했습니다. 자동 재시도나 유료 대체는 하지 않았습니다." };
    case "provider": return { tone: "warning" as const, title: "현재 제공자를 사용할 수 없습니다", description: "다른 모델로 자동 전환하지 않았습니다. 잠시 후 다시 시도해 주세요." };
    case "budget": return { tone: "warning" as const, title: "평가 예산이 비활성화되었습니다", description: "설정되지 않은 유료 평가를 대신 실행하지 않습니다." };
    case "quota": return { tone: "warning" as const, title: "평가 한도를 모두 사용했습니다", description: `${quota} 한도를 확인해 주세요.` };
    case "invalid": return { tone: "error" as const, title: "입력을 확인해 주세요", description: "오류가 표시된 항목을 수정한 뒤 다시 시도해 주세요." };
    default: return { tone: "info" as const, title: "평가 준비", description: `현재 한도는 ${quota}입니다. 모든 필수 동의를 확인하면 평가할 수 있습니다.` };
  }
}

export function EvaluationForm({
  fixtureEnabled,
  fixtureAudience,
  fixtureScenario,
  fixtureResultScore
}: {
  fixtureEnabled: boolean;
  fixtureAudience: Audience;
  fixtureScenario?: string;
  fixtureResultScore?: number;
}) {
  const [values, setValues] = useState<FormValues>(blankValues);
  const [consent, setConsent] = useState<ConsentValue>(emptyConsentValue);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [status, setStatus] = useState<FormStatus>(fixtureScenario === "budget-disabled" ? "budget" : "idle");
  const [completedResult, setCompletedResult] = useState<CompletedResult | null>(() => fixtureResultScore === undefined ? null : fixtureResult(fixtureResultScore));
  const abortRef = useRef<AbortController | null>(null);
  const fixtureGuestId = useRef<string | null>(null);
  if (fixtureGuestId.current === null) fixtureGuestId.current = crypto.randomUUID();
  const answerLimit = limits.answer[fixtureAudience];
  const canSubmit = allConsented(consent) && status !== "submitting" && status !== "budget";
  const message = useMemo(() => statusMessage(status, fixtureAudience), [status, fixtureAudience]);

  function setValue(name: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    if (["invalid", "network", "provider", "quota", "cancelled"].includes(status)) setStatus("idle");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("validating");
    try {
      validateEvaluationInput(values, fixtureAudience);
    } catch (error) {
      const code = error instanceof EvaluationInputError ? error.code : "INPUT_INVALID";
      setErrors(errorFor(code));
      setStatus("invalid");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("submitting");
    try {
      if (fixtureScenario === "network") throw new TypeError("NETWORK_FAILURE");
      if (fixtureScenario === "slow") {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, 1_200);
          controller.signal.addEventListener("abort", () => {
            window.clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        });
      }
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID()
      };
      if (fixtureEnabled) {
        if (fixtureAudience === "authenticated") headers["x-bomti-test-user"] = "fixture-user";
        else headers["x-bomti-guest-id"] = `fixture-guest-${fixtureGuestId.current}`;
        if (fixtureScenario === "provider-unavailable") headers["x-bomti-test-provider"] = "unavailable";
      }
      const response = await fetch("/api/evaluations", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          ...values,
          consent: {
            version: "bomti_consent_v1",
            providerDisclosure: consent.providerDisclosure,
            pseudonymization: consent.pseudonymization,
            retention: consent.retention
          }
        })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
        const code = body?.error?.code;
        if (code === "GUEST_PROVIDER_UNAVAILABLE" || code === "AUTH_PROVIDER_UNAVAILABLE") setStatus("provider");
        else if (code === "GUEST_LIMIT" || code === "ACCOUNT_LIMIT") setStatus("quota");
        else if (code?.includes("BUDGET") || code === "PAID_INFERENCE_DISABLED") setStatus("budget");
        else if (code?.endsWith("TOO_SHORT") || code?.endsWith("TOO_LONG") || code === "INPUT_INVALID") {
          setErrors(errorFor(code));
          setStatus("invalid");
        } else setStatus("network");
        return;
      }
      const payload = await response.json() as { audience: Audience; verdict?: CompletedResult["verdict"]; evaluation?: { verdict: CompletedResult["verdict"]; input: { answerSegments: CompletedResult["segments"] } } };
      if (payload.audience === "guest" && payload.verdict) setCompletedResult({ audience: "guest", verdict: payload.verdict, segments: [] });
      if (payload.audience === "authenticated" && payload.evaluation) setCompletedResult({ audience: "authenticated", verdict: payload.evaluation.verdict, segments: payload.evaluation.input.answerSegments });
      setStatus("success");
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "network");
    } finally {
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function returnToDraft() {
    setCompletedResult(null);
    setStatus("idle");
  }

  if (completedResult) {
    return (
      <main className="bomti-result-page">
        <section className="bomti-container bomti-result-page__shell">
          <header className="bomti-result-page__intro"><p className="bomti-kicker">◉ 진단 완료</p><h1>자기소개서 답변 분석 결과</h1><p>점수는 합격이나 불합격을 뜻하지 않습니다. 발견된 위험 신호와 개선 방향을 확인해 주세요.</p></header>
          <EvaluationResult audience={completedResult.audience} verdict={completedResult.verdict} segments={completedResult.segments} />
          <div className="bomti-result-page__actions">
            {completedResult.audience === "authenticated" ? <a className="bomti-button bomti-button--secondary" href="/history">저장된 결과 보기</a> : <p className="bomti-empty">게스트 미리보기 결과는 저장되지 않습니다.</p>}
            <Button type="button" onClick={returnToDraft}>수정한 답변 다시 진단하기</Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="bomti-diagnosis-page">
      <section className="bomti-container bomti-diagnosis-shell">
        <header className="bomti-diagnosis-intro"><h1>답변 진단하기</h1><p>지원하고자 하는 직무와 경험을 바탕으로 질문과 답변을 작성해주세요.</p></header>
        <div className="bomti-diagnosis-layout">
          <div className="bomti-diagnosis-main">
            <form id="diagnosis-form" className="bomti-form-card bomti-stack" onSubmit={submit} noValidate aria-describedby="evaluation-status">
              <FormField id="question" label="자기소개서·면접 질문" placeholder="예: 본인의 가장 큰 장점과 단점은 무엇인가요?" value={values.question} onChange={(event) => setValue("question", event.target.value)} error={errors.question} maxLength={limits.question} currentLength={codePointLength(values.question)} />
              <FormField id="answer" label="나의 답변" placeholder="자신의 경험을 바탕으로 구체적으로 작성해주세요." description={fixtureAudience === "guest" ? "비로그인 미리보기는 최대 1,500자입니다." : "인증 사용자는 최대 6,000자까지 평가할 수 있습니다."} value={values.answer} onChange={(event) => setValue("answer", event.target.value)} error={errors.answer} multiline rows={6} maxLength={answerLimit} currentLength={codePointLength(values.answer)} />
              <div className="bomti-form-row">
                <FormField id="target-role" label="지원 직무" placeholder="예: 프론트엔드 개발자" value={values.targetRole} onChange={(event) => setValue("targetRole", event.target.value)} error={errors.targetRole} maxLength={limits.targetRole} currentLength={codePointLength(values.targetRole)} />
                <FormField id="job-company-context" label="회사·공고 맥락" placeholder="예: 스타트업, 3년차 이상" value={values.jobCompanyContext} onChange={(event) => setValue("jobCompanyContext", event.target.value)} error={errors.jobCompanyContext} maxLength={limits.jobCompanyContext} currentLength={codePointLength(values.jobCompanyContext)} />
              </div>
              <FormField id="experience-evidence" label="경험 근거" placeholder="답변을 뒷받침할 수 있는 구체적인 프로젝트나 경험을 요약해주세요." description="선택 항목입니다." value={values.experienceEvidence} onChange={(event) => setValue("experienceEvidence", event.target.value)} error={errors.experienceEvidence} multiline rows={3} optional maxLength={limits.experienceEvidence} currentLength={codePointLength(values.experienceEvidence)} />
            </form>
            <section className="bomti-consent-card bomti-stack"><ConsentControl value={consent} onChange={setConsent} disabled={status === "submitting"} /><div className="bomti-inline bomti-form-actions"><Button form="diagnosis-form" type="submit" disabled={!canSubmit} loading={status === "submitting"} className="bomti-diagnosis-submit">▣ 답변 진단하기</Button>{status === "submitting" ? <Button type="button" variant="secondary" onClick={cancel}>요청 취소</Button> : null}</div></section>
          </div>
          <aside className="bomti-guide-panel" aria-label="진단 가이드">
            <h2><span aria-hidden="true">ⓘ</span> 진단 가이드</h2>
            <dl>
              <div><dt><span aria-hidden="true">◉</span> 분석 기준</dt><dd>직무 적합성, 논리적 흐름, 구체성, 그리고 표현의 명확성을 기준으로 분석합니다.</dd></div>
              <div><dt><span aria-hidden="true">◎</span> 현재 평가 모델</dt><dd>{fixtureEnabled ? "결정적 로컬 fixture" : fixtureAudience === "guest" ? "OpenCode Zen의 설정된 무료 guest 모델" : "OpenAI Luna·Terra, 필요한 경우 Sol"}</dd></div>
              <div><dt><span aria-hidden="true">⌛</span> 평가 한도</dt><dd>{fixtureAudience === "guest" ? "비로그인은 오늘 브라우저·IP 기준 각각 1회 미리보기를 이용할 수 있습니다." : "인증 사용자는 이번 캠페인에서 3회 평가하고 이력을 관리할 수 있습니다."}</dd></div>
              {fixtureAudience === "guest" ? <div><dt><span aria-hidden="true">△</span> 무료 모델 데이터 이용</dt><dd>무료 모델은 가명처리된 요청을 모델 개선에 사용할 수 있으므로 개인·기밀정보를 입력하지 마세요.</dd></div> : null}
              <div><dt><span aria-hidden="true">♢</span> 프라이버시 FAQ</dt><dd>입력하신 데이터는 가명처리되어 분석되며 원문을 서버 로그에 저장하지 않습니다.</dd></div>
            </dl>
            <section id="evaluation-status" aria-live="polite"><StatusBanner tone={message.tone} title={message.title}>{message.description}</StatusBanner></section>
          </aside>
        </div>
      </section>
    </main>
  );
}

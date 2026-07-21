"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Button, ConsentControl, emptyConsentValue, FormField, StatusBanner, type ConsentValue } from "../components/bomti";
import { EvaluationInputError, validateEvaluationInput } from "../lib/contracts/evaluation";
import { codePointLength } from "../lib/contracts/text";

type Audience = "guest" | "authenticated";
type FormStatus = "idle" | "validating" | "submitting" | "cancelled" | "success" | "network" | "provider" | "budget" | "quota" | "invalid";
type FormValues = Record<"question" | "answer" | "targetRole" | "jobCompanyContext" | "experienceEvidence", string>;

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
  fixtureScenario
}: {
  fixtureEnabled: boolean;
  fixtureAudience: Audience;
  fixtureScenario?: string;
}) {
  const [values, setValues] = useState<FormValues>(blankValues);
  const [consent, setConsent] = useState<ConsentValue>(emptyConsentValue);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [status, setStatus] = useState<FormStatus>(fixtureScenario === "budget-disabled" ? "budget" : "idle");
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

  return (
    <main className="bomti-shell">
      <header className="bomti-page-header">
        <p className="bomti-kicker">Bomti · 한 답변 평가</p>
        <h1 className="bomti-title">고쳐 쓰기 전에, 맥락과 근거부터 확인하세요.</h1>
        <p className="bomti-lead">밤티는 자기소개서 답변을 대신 작성하지 않습니다. 질문과 맥락에 비해 상투적이거나 검증하기 어려운 표현을 짚어 개선 방향을 제안합니다.</p>
      </header>

      <div className="bomti-evaluation-layout">
        <form className="bomti-panel bomti-stack" onSubmit={submit} noValidate aria-describedby="evaluation-status">
          <div className="bomti-section-heading">
            <div><p className="bomti-kicker">입력</p><h2>평가할 답변을 알려 주세요</h2></div>
            <span className="bomti-mode">{fixtureAudience === "guest" ? "비로그인 미리보기" : "인증 사용자 fixture"}</span>
          </div>
          <FormField id="question" label="자기소개서 질문" description="지원서 문항의 의도를 그대로 적어 주세요." value={values.question} onChange={(event) => setValue("question", event.target.value)} error={errors.question} multiline maxLength={limits.question} currentLength={codePointLength(values.question)} />
          <FormField id="answer" label="자기소개서 답변" description={fixtureAudience === "guest" ? "비로그인 미리보기는 최대 1,500자입니다." : "인증 사용자는 최대 6,000자까지 평가할 수 있습니다."} value={values.answer} onChange={(event) => setValue("answer", event.target.value)} error={errors.answer} multiline maxLength={answerLimit} currentLength={codePointLength(values.answer)} />
          <FormField id="target-role" label="지원 직무" description="예: 백엔드 개발자, 정보보호 담당자" value={values.targetRole} onChange={(event) => setValue("targetRole", event.target.value)} error={errors.targetRole} maxLength={limits.targetRole} currentLength={codePointLength(values.targetRole)} />
          <FormField id="job-company-context" label="회사·공고 맥락" description="조직, 공고, 역할에서 특히 중요한 조건을 적어 주세요." value={values.jobCompanyContext} onChange={(event) => setValue("jobCompanyContext", event.target.value)} error={errors.jobCompanyContext} multiline maxLength={limits.jobCompanyContext} currentLength={codePointLength(values.jobCompanyContext)} />
          <FormField id="experience-evidence" label="경험 근거" description="선택 항목입니다. 숫자, 역할, 결과처럼 검증 가능한 근거를 적을 수 있습니다." value={values.experienceEvidence} onChange={(event) => setValue("experienceEvidence", event.target.value)} error={errors.experienceEvidence} multiline optional maxLength={limits.experienceEvidence} currentLength={codePointLength(values.experienceEvidence)} />

          <div className="bomti-stack"><h3 className="bomti-subheading">명시적 동의</h3><ConsentControl value={consent} onChange={setConsent} disabled={status === "submitting"} /></div>
          <div className="bomti-inline bomti-form-actions">
            <Button type="submit" disabled={!canSubmit} loading={status === "submitting"}>평가하기</Button>
            {status === "submitting" ? <Button type="button" variant="secondary" onClick={cancel}>요청 취소</Button> : null}
          </div>
        </form>

        <aside className="bomti-side-stack" aria-label="평가 전 안내">
          <section className="bomti-panel bomti-stack">
            <h2>평가 전 확인</h2>
            <dl className="bomti-facts">
              <div><dt>현재 제공자</dt><dd>{fixtureEnabled ? "결정적 로컬 fixture" : fixtureAudience === "guest" ? "무료 guest provider 설정 필요" : "인증 provider 설정 필요"}</dd></div>
              <div><dt>무료 모델 데이터 이용</dt><dd>가명처리된 입력만 전송하며 원문을 서버 로그나 평가 이력에 저장하지 않습니다.</dd></div>
              <div><dt>보존·삭제</dt><dd>guest 결과는 저장하지 않습니다. 인증 완료 평가만 삭제 가능한 이력이 될 수 있습니다.</dd></div>
              <div><dt>benchmark</dt><dd>보수적 비식별 검토를 통과한 인증 평가만 소유자와 연결할 수 없는 내부 보정에 사용할 수 있습니다.</dd></div>
            </dl>
          </section>
          <section id="evaluation-status" aria-live="polite"><StatusBanner tone={message.tone} title={message.title}>{message.description}</StatusBanner></section>
        </aside>
      </div>
    </main>
  );
}

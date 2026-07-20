import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { EvaluationInput } from "../lib/contracts/evaluation";
import {
  assertForbiddenStringsAbsent,
  createPrivacyLogger,
  detectSensitiveText,
  PrivacyBoundaryError,
  pseudonymizeEvaluation,
  sanitizeOutbound,
  toBenchmarkCopy,
  toHistoryRecord,
  toProviderPayload
} from "../lib/privacy";

const cleanInput: EvaluationInput = {
  question: "협업 과정에서 생긴 문제를 어떻게 해결했나요?",
  answer: "역할을 나누고 매주 진행 상황을 확인했습니다. 지연 원인을 기록하고 다음 주 계획을 조정했습니다.",
  targetRole: "백엔드 개발자",
  jobCompanyContext: "안정적인 서비스 운영과 협업 역량을 중요하게 보는 채용 공고",
  experienceEvidence: "배포 실패율을 줄인 회고 기록"
};

const directInput: EvaluationInput = {
  ...cleanInput,
  answer: "이름: 김민수. 연락처는 010-1234-5678이고 minsu.fixture@example.com으로 결과를 공유했습니다."
};

const distinctiveInput: EvaluationInput = {
  ...cleanInput,
  answer: "KISA 협업에서 2026-07-21 공개된 SBOM 사건을 단독으로 처리했습니다."
};

describe("privacy detector and pseudonymization", () => {
  it("finds Korean and English direct and quasi identifiers", () => {
    const findings = detectSensitiveText("이름: 김민수, 010-1234-5678, minsu.fixture@example.com, KISA, 2026-07-21 SBOM");
    expect(new Set(findings.map((finding) => finding.kind))).toEqual(new Set([
      "person_name", "phone", "email", "organization", "exact_date", "distinctive_context"
    ]));
  });

  it("uses stable typed placeholders and never exposes original segment text", () => {
    const result = pseudonymizeEvaluation(directInput, "authenticated");
    expect(result.answer).toContain("[PERSON_1]");
    expect(result.answer).toContain("[PHONE_1]");
    expect(result.answer).toContain("[EMAIL_1]");
    expect(result.answerSegments.every((segment) => "text" in segment && !("originalText" in segment))).toBe(true);
    expect(result.riskState).toBe("excluded_direct_identifier");
    assertForbiddenStringsAbsent(result, ["김민수", "010-1234-5678", "minsu.fixture@example.com"]);
  });

  it("keeps clean text meaning-preserving and permits only clean authenticated benchmark copies", () => {
    const authenticated = pseudonymizeEvaluation(cleanInput, "authenticated");
    expect(authenticated.answer).toBe(cleanInput.answer);
    expect(authenticated.riskState).toBe("eligible");
    expect(toBenchmarkCopy(authenticated)).not.toBeNull();
    expect(toBenchmarkCopy(pseudonymizeEvaluation(cleanInput, "guest"))).toBeNull();
    expect(toBenchmarkCopy(pseudonymizeEvaluation(directInput, "authenticated"))).toBeNull();
  });

  it("excludes rare narrative combinations and uncertainty conservatively", () => {
    expect(pseudonymizeEvaluation(distinctiveInput, "authenticated").riskState).toBe("excluded_distinctive_context");
    expect(pseudonymizeEvaluation({ ...cleanInput, answer: "사번: DEV-2048로 기록된 업무를 수행했습니다." }, "authenticated").riskState)
      .toBe("excluded_uncertain");
  });

  it("is deterministic across generated Korean identity fixtures", () => {
    for (let index = 0; index < 64; index += 1) {
      const suffix = String(1000 + index);
      const input = { ...cleanInput, answer: `이름: 김민수. 연락처 010-5555-${suffix}로 협업 일정을 공유했습니다.` };
      expect(pseudonymizeEvaluation(input, "authenticated")).toEqual(pseudonymizeEvaluation(input, "authenticated"));
    }
  });
});

describe("privacy output, persistence, benchmark, and logging boundaries", () => {
  it("redacts provider-hallucinated identifiers in every nested output field", () => {
    const result = sanitizeOutbound({
      explanation: "담당자 이름: 이서준에게 연락하세요.",
      evidence: [{ fragment: "전화 02-123-4567", reason: "메일 helper@example.org 확인" }],
      improvements: ["192.168.0.4 기록 제거"]
    });
    const serialized = JSON.stringify(result.value);
    expect(serialized).not.toContain("이서준");
    expect(serialized).not.toContain("02-123-4567");
    expect(serialized).not.toContain("helper@example.org");
    expect(serialized).not.toContain("192.168.0.4");
    expect(result.redactedKinds).toEqual(expect.arrayContaining(["person_name", "phone", "email", "ip_address"]));
  });

  it("fails closed when a sensitive value reaches a structural field", () => {
    expect(() => sanitizeOutbound({ segmentId: "helper@example.org", explanation: "안전한 설명" }))
      .toThrowError(new PrivacyBoundaryError("PRIVACY_OUTPUT_REJECTED"));
  });

  it("allows provider provenance but rejects nested raw boundary payloads", () => {
    expect(sanitizeOutbound({ provenance: { provider: "luna" }, explanation: "안전한 설명" }).value)
      .toEqual({ provenance: { provider: "luna" }, explanation: "안전한 설명" });
    expect(() => sanitizeOutbound({ metadata: { providerBody: "원문" } }))
      .toThrowError("PRIVACY_FORBIDDEN_FIELD");
  });

  it("serializes only pseudonymized provider and history records", () => {
    const safe = pseudonymizeEvaluation(directInput, "authenticated");
    const provider = toProviderPayload(safe);
    const history = toHistoryRecord(safe);
    assertForbiddenStringsAbsent([provider, history], ["김민수", "010-1234-5678", "minsu.fixture@example.com"]);
    expect(JSON.stringify(provider)).not.toContain("originalText");
    expect(JSON.stringify(history)).not.toContain("originalText");
  });

  it("rejects forged safe-looking values and every guest persistence attempt", () => {
    const issued = pseudonymizeEvaluation(cleanInput, "authenticated");
    const forged = { ...issued };
    expect(() => toProviderPayload(forged)).toThrowError("PRIVACY_OUTPUT_REJECTED");
    expect(() => toHistoryRecord(pseudonymizeEvaluation(cleanInput, "guest")))
      .toThrowError("GUEST_PERSISTENCE_FORBIDDEN");
  });

  it("forbids request and provider body logging and redacts safe event metadata", () => {
    const entries: unknown[] = [];
    const log = createPrivacyLogger((entry) => entries.push(entry));
    log("evaluation_failed", { message: "연락처 010-9999-8888 제거", code: "PROVIDER_OUTPUT_INVALID" });
    expect(JSON.stringify(entries)).not.toContain("010-9999-8888");
    expect(() => log("bad", { providerBody: { answer: "원문" } })).toThrowError("PRIVACY_FORBIDDEN_FIELD");
    expect(() => log("bad", { requestPayload: "원문" })).toThrowError("PRIVACY_FORBIDDEN_FIELD");
  });

  it("creates benchmark copies without owner or relink fields", () => {
    const copy = toBenchmarkCopy(pseudonymizeEvaluation(cleanInput, "authenticated"));
    expect(copy).not.toBeNull();
    expect(Object.keys(copy ?? {})).not.toEqual(expect.arrayContaining([
      "ownerId", "userId", "evaluationId", "contextHash", "sourceId"
    ]));
  });
});

async function writeProfileCapture() {
  const output = process.env.BOMTI_PRIVACY_CAPTURE_OUT;
  const profile = process.env.BOMTI_PRIVACY_PROFILE;
  if (!output || !profile) return;
  await mkdir(output, { recursive: true });

  if (profile === "korean-pii-clean-context") {
    const safe = pseudonymizeEvaluation(directInput, "authenticated");
    const snapshot = { riskState: safe.riskState, provider: toProviderPayload(safe), history: toHistoryRecord(safe) };
    assertForbiddenStringsAbsent(snapshot, ["김민수", "010-1234-5678", "minsu.fixture@example.com"]);
    await writeFile(path.join(output, "privacy-snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return;
  }

  if (profile === "kisa-sbom-date-phone-email") {
    const safe = pseudonymizeEvaluation(distinctiveInput, "authenticated");
    expect(safe.riskState).toBe("excluded_distinctive_context");
    const outbound = sanitizeOutbound({
      explanation: "KISA 담당자 이름: 박서연, 010-2468-1357, privacy.fixture@example.net",
      evidence: [{ segmentId: "s0001", fragment: "2026-07-21 SBOM 대응" }],
      improvement: "기관과 날짜를 일반화하세요."
    });
    const snapshot = { riskState: safe.riskState, provider: toProviderPayload(safe), outbound: outbound.value };
    assertForbiddenStringsAbsent(snapshot, ["박서연", "010-2468-1357", "privacy.fixture@example.net", "KISA", "2026-07-21", "SBOM"]);
    await writeFile(path.join(output, "privacy-snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }
}

it("writes only sanitized profile evidence when invoked by the privacy runner", async () => {
  await writeProfileCapture();
});

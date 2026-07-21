import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DELETE as deleteAccount } from "../app/api/account/route";
import { GET as authCallback } from "../app/auth/callback/route";
import { POST as feedback } from "../app/api/evaluations/[id]/feedback/route";
import { DELETE as removeEvaluation, GET as getEvaluation } from "../app/api/evaluations/[id]/route";
import { GET as listEvaluations, POST as createEvaluation } from "../app/api/evaluations/route";
import { GET as health } from "../app/api/health/route";
import { GET as usage } from "../app/api/usage/route";
import { evaluationApiService } from "../lib/api/service";

process.env.BOMTI_API_TEST_MODE = "true";

const origin = "https://bomti.test";
let sequence = 0;

function id(prefix: string) {
  sequence += 1;
  return `${prefix}-${String(sequence).padStart(4, "0")}-contract-key`;
}

function request(url: string, init: RequestInit & { user?: string; guest?: string; key?: string; provider?: string; fresh?: boolean } = {}) {
  const headers = new Headers(init.headers);
  headers.set("origin", origin);
  if (init.user) headers.set("x-bomti-test-user", init.user);
  if (init.guest) headers.set("x-bomti-guest-id", init.guest);
  if (init.key) headers.set("idempotency-key", init.key);
  if (init.provider) headers.set("x-bomti-test-provider", init.provider);
  if (init.fresh) headers.set("x-bomti-fresh-session", "true");
  return new Request(`${origin}${url}`, { ...init, headers });
}

function payload() {
  return {
    question: "지원 동기를 설명해 주세요.",
    answer: "person@example.com에게 공유한 프로젝트 결과를 바탕으로 개선했습니다.",
    targetRole: "보안 엔지니어",
    jobCompanyContext: "공공 보안 서비스를 운영하는 조직",
    consent: {
      version: "bomti_consent_v1",
      providerDisclosure: true,
      pseudonymization: true,
      retention: true
    }
  };
}

async function body(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json() as Promise<Record<string, unknown>>;
}

async function createAuthenticated(user: string, key = id("auth")) {
  const response = await createEvaluation(request("/api/evaluations", {
    method: "POST",
    user,
    key,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload())
  }));
  expect(response.status).toBe(201);
  return body(response);
}

describe("validated evaluation API", () => {
  it("returns a guest projection without persisting or re-exposing a guest verdict", async () => {
    const guest = id("guest");
    const key = id("guest-key");
    const response = await createEvaluation(request("/api/evaluations", {
      method: "POST",
      guest,
      key,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload())
    }));
    expect(response.status).toBe(201);
    const value = await body(response);
    expect(value).toMatchObject({ audience: "guest", terminal: "completed" });
    expect(JSON.stringify(value)).not.toContain("person@example.com");
    const replay = await createEvaluation(request("/api/evaluations", {
      method: "POST", guest, key, headers: { "content-type": "application/json" }, body: JSON.stringify(payload())
    }));
    expect(await body(replay)).toEqual({ error: { code: "GUEST_ATTEMPT_ALREADY_USED" } });
  });

  it("persists only authenticated pseudonymized history, enforces ownership, pagination, feedback, and deletion", async () => {
    const userA = id("owner-a");
    const userB = id("owner-b");
    const first = await createAuthenticated(userA);
    const second = await createAuthenticated(userA);
    const idA = (first.evaluation as { id: string }).id;
    const idSecond = (second.evaluation as { id: string }).id;
    await createAuthenticated(userB);

    const page = await listEvaluations(request("/api/evaluations?limit=1", { user: userA }));
    expect(page.status).toBe(200);
    const listed = await body(page);
    expect(listed).toMatchObject({ evaluations: [expect.objectContaining({ id: idSecond })], nextCursor: expect.any(String) });
    expect(JSON.stringify(listed)).not.toContain("person@example.com");

    const crossOwner = await getEvaluation(request(`/api/evaluations/${idA}`, { user: userB }), { params: Promise.resolve({ id: idA }) });
    expect(crossOwner.status).toBe(404);
    expect(await body(crossOwner)).toEqual({ error: { code: "EVALUATION_NOT_FOUND" } });

    const feedbackResult = await feedback(request(`/api/evaluations/${idA}/feedback`, {
      method: "POST", user: userA, headers: { "content-type": "application/json" }, body: JSON.stringify({ usefulness: 5, reasonCode: "helpful" })
    }), { params: Promise.resolve({ id: idA }) });
    expect(feedbackResult.status).toBe(201);

    const deleted = await removeEvaluation(request(`/api/evaluations/${idA}`, { method: "DELETE", user: userA }), { params: Promise.resolve({ id: idA }) });
    expect(deleted.status).toBe(204);
    const absent = await getEvaluation(request(`/api/evaluations/${idA}`, { user: userA }), { params: Promise.resolve({ id: idA }) });
    expect(absent.status).toBe(404);
  });

  it("rejects malformed body, oversized input, missing consent, origin, idempotency, quota, and provider failures without overcalling", async () => {
    const user = id("fail-user");
    const malformed = await createEvaluation(request("/api/evaluations", { method: "POST", user, key: id("malformed"), headers: { "content-type": "application/json" }, body: "{" }));
    expect(await body(malformed)).toEqual({ error: { code: "MALFORMED_JSON" } });
    const wrongType = await createEvaluation(new Request(`${origin}/api/evaluations`, { method: "POST", headers: { origin, "x-bomti-test-user": user }, body: "plain" }));
    expect((await body(wrongType)).error).toEqual({ code: "CONTENT_TYPE_REQUIRED" });
    const missingConsent = await createEvaluation(request("/api/evaluations", { method: "POST", user, key: id("consent"), headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload(), consent: { ...payload().consent, version: "old" } }) }));
    expect((await body(missingConsent)).error).toEqual({ code: "CONSENT_VERSION_INVALID" });
    const noIdempotency = await createEvaluation(request("/api/evaluations", { method: "POST", user, headers: { "content-type": "application/json" }, body: JSON.stringify(payload()) }));
    expect((await body(noIdempotency)).error).toEqual({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    const oversized = await createEvaluation(request("/api/evaluations", { method: "POST", user, key: id("oversized"), headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload(), answer: "a".repeat(25_000) }) }));
    expect((await body(oversized)).error).toEqual({ code: "BODY_TOO_LARGE" });
    const noOrigin = await createEvaluation(new Request(`${origin}/api/evaluations`, { method: "POST", headers: { "content-type": "application/json", "x-bomti-test-user": user, "idempotency-key": id("origin") }, body: JSON.stringify(payload()) }));
    expect((await body(noOrigin)).error).toEqual({ code: "ORIGIN_FORBIDDEN" });
    const callsBeforeUnavailable = evaluationApiService().diagnostics().providerCalls;
    const unavailable = await createEvaluation(request("/api/evaluations", { method: "POST", user, key: id("provider"), provider: "unavailable", headers: { "content-type": "application/json" }, body: JSON.stringify(payload()) }));
    expect((await body(unavailable)).error).toEqual({ code: "AUTH_PROVIDER_UNAVAILABLE" });
    expect(evaluationApiService().diagnostics().providerCalls).toBe(callsBeforeUnavailable);

    await createAuthenticated(user);
    await createAuthenticated(user);
    await createAuthenticated(user);
    const quota = await createEvaluation(request("/api/evaluations", { method: "POST", user, key: id("quota"), headers: { "content-type": "application/json" }, body: JSON.stringify(payload()) }));
    expect((await body(quota)).error).toEqual({ code: "ACCOUNT_LIMIT" });
  });

  it("uses stable health, usage, account, callback, and removed-mock contracts", async () => {
    const user = id("account");
    await createAuthenticated(user);
    const remaining = await usage(request("/api/usage", { user }));
    expect(await body(remaining)).toEqual({ allowance: 3, consumed: 1, remaining: 2 });
    const stale = await deleteAccount(request("/api/account", { method: "DELETE", user }));
    expect((await body(stale)).error).toEqual({ code: "FRESH_SESSION_REQUIRED" });
    const removed = await deleteAccount(request("/api/account", { method: "DELETE", user, fresh: true }));
    expect(await body(removed)).toEqual({ terminal: "account_deleted" });
    expect(await body(health())).toMatchObject({ status: "ok", auth: "fixture" });
    expect((await body(authCallback(new Request(`${origin}/auth/callback?state=only-state`)))).terminal).toBe("auth_failed");
    for (const route of ["tasks", "judge", "preferences"]) {
      expect(existsSync(path.join(process.cwd(), "app", "api", route, "route.ts"))).toBe(false);
    }
  });

  it("never leaves raw input in the API persistence diagnostics", () => {
    const diagnostics = JSON.stringify(evaluationApiService().diagnostics());
    expect(diagnostics).not.toContain("person@example.com");
    expect(diagnostics).not.toContain("person@example.com에게 공유한 프로젝트 결과를 바탕으로 개선했습니다");
  });
});

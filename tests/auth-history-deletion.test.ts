import { describe, expect, it } from "vitest";
import { DELETE as deleteAccount } from "../app/api/account/route";
import { POST as cancelAuthorization } from "../app/api/auth/cancel/route";
import { POST as refresh } from "../app/api/auth/refresh/route";
import { GET as signIn } from "../app/api/auth/sign-in/route";
import { POST as signOut } from "../app/api/auth/sign-out/route";
import { GET as authCallback } from "../app/auth/callback/route";
import { GET as getEvaluation, DELETE as removeEvaluation } from "../app/api/evaluations/[id]/route";
import { GET as listEvaluations, POST as createEvaluation } from "../app/api/evaluations/route";
import { advanceFixtureDeletion, fixtureAuthDiagnostics, FRESH_SESSION_TTL_MS } from "../lib/auth/fixture-auth";

process.env.BOMTI_API_TEST_MODE = "true";

const origin = "https://bomti.test";
let sequence = 0;

function subject(prefix: string) {
  sequence += 1;
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

function request(path: string, init: RequestInit = {}, extra: Record<string, string> = {}) {
  const headers = new Headers(init.headers);
  headers.set("origin", origin);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Request(`${origin}${path}`, { ...init, headers });
}

function cookie(header: string | null, name: string) {
  const value = new RegExp(`${name}=([^;]+)`).exec(header ?? "")?.[1];
  if (!value) throw new Error(`COOKIE_MISSING:${name}`);
  return `${name}=${value}`;
}

function payload() {
  return {
    question: "What makes this answer relevant to the role?",
    answer: "I reduced the security review time and documented a measurable result for the team.",
    targetRole: "Security engineer",
    jobCompanyContext: "The team needs evidence-based communication and clear ownership.",
    consent: { version: "bomti_consent_v1", providerDisclosure: true, pseudonymization: true, retention: true }
  };
}

async function sessionFor(user: string) {
  const started = await signIn(request("/api/auth/sign-in?returnTo=/history"));
  expect(started.status).toBe(200);
  const startedBody = await started.json() as { scope: string; authorizeUrl: string };
  expect(startedBody.scope).toBe("openid email profile");
  const authorization = new URL(startedBody.authorizeUrl);
  expect(authorization.searchParams.get("scope")).toBe("openid email profile");
  const callback = await authCallback(request(`/auth/callback?code=fixture-code&state=${authorization.searchParams.get("state")}`, {}, {
    cookie: cookie(started.headers.get("set-cookie"), "bomti_pkce"),
    "x-bomti-test-user": user
  }));
  expect(callback.status).toBe(302);
  expect(callback.headers.get("location")).toBe("/history");
  return cookie(callback.headers.get("set-cookie"), "bomti_session");
}

describe("fixture OAuth, history, and deletion lifecycle", () => {
  it("uses the exact Google scope, an opaque one-use PKCE cookie, and rotating sessions without provider token storage", async () => {
    const user = subject("auth-user");
    const started = await signIn(request("/api/auth/sign-in?returnTo=/history"));
    const startedBody = await started.json() as { authorizeUrl: string; scope: string };
    const pkceCookie = cookie(started.headers.get("set-cookie"), "bomti_pkce");
    expect(started.headers.get("set-cookie")).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(startedBody.scope).toBe("openid email profile");
    expect(new URL(startedBody.authorizeUrl).searchParams.get("scope")).toBe("openid email profile");
    const forbiddenRedirect = await signIn(request("/api/auth/sign-in?returnTo=https://attacker.test"));
    expect(await forbiddenRedirect.json()).toEqual({ error: { code: "REDIRECT_FORBIDDEN" } });

    const state = new URL(startedBody.authorizeUrl).searchParams.get("state");
    const callback = await authCallback(request(`/auth/callback?code=fixture-code&state=${state}`, {}, { cookie: pkceCookie, "x-bomti-test-user": user }));
    const firstSession = cookie(callback.headers.get("set-cookie"), "bomti_session");
    const replay = await authCallback(request(`/auth/callback?code=fixture-code&state=${state}`, {}, { cookie: pkceCookie, "x-bomti-test-user": user }));
    expect(await replay.json()).toEqual({ terminal: "auth_failed", code: "state_invalid" });
    for (const code of ["access_denied", "state_invalid", "provider_unavailable", "session_exchange_failed", "reauth_required"]) {
      const failure = await authCallback(request(`/auth/callback?error=${code}`));
      expect(await failure.json()).toEqual({ terminal: "auth_failed", code });
    }

    const rotated = await refresh(request("/api/auth/refresh", { method: "POST" }, { cookie: firstSession }));
    expect(await rotated.json()).toEqual({ terminal: "session_refreshed" });
    const secondSession = cookie(rotated.headers.get("set-cookie"), "bomti_session");
    expect(secondSession).not.toBe(firstSession);
    const stale = await listEvaluations(request("/api/evaluations", {}, { cookie: firstSession }));
    expect(await stale.json()).toEqual({ error: { code: "SESSION_REVOKED" } });
    const signedOut = await signOut(request("/api/auth/sign-out", { method: "POST" }, { cookie: secondSession }));
    expect(await signedOut.json()).toEqual({ terminal: "signed_out" });
    const cancelled = await cancelAuthorization(request("/api/auth/cancel", { method: "POST" }));
    expect(await cancelled.json()).toEqual({ terminal: "authorization_cancelled" });
    expect(FRESH_SESSION_TTL_MS).toBe(10 * 60 * 1_000);
    expect(fixtureAuthDiagnostics()).toMatchObject({ providerTokenStored: false, pkceCount: 0 });
  });

  it("shows only owned authenticated history, requires delete confirmation, and never puts an owner in the history URL", async () => {
    const ownerA = subject("history-a");
    const ownerB = subject("history-b");
    const sessionA = await sessionFor(ownerA);
    const sessionB = await sessionFor(ownerB);
    const created = await createEvaluation(request("/api/evaluations", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `history-key-${"x".repeat(32)}` },
      body: JSON.stringify(payload())
    }, { cookie: sessionA }));
    const createdBody = await created.json() as { evaluation: { id: string } };
    const id = createdBody.evaluation.id;
    const owned = await listEvaluations(request("/api/evaluations?limit=20", {}, { cookie: sessionA }));
    expect((await owned.json() as { evaluations: unknown[] }).evaluations).toHaveLength(1);
    const crossOwner = await getEvaluation(request(`/api/evaluations/${id}`, {}, { cookie: sessionB }), { params: Promise.resolve({ id }) });
    expect(await crossOwner.json()).toEqual({ error: { code: "EVALUATION_NOT_FOUND" } });
    expect(`/history/${encodeURIComponent(id)}`).not.toContain(ownerA);
    const unconfirmed = await removeEvaluation(request(`/api/evaluations/${id}`, { method: "DELETE" }, { cookie: sessionA }), { params: Promise.resolve({ id }) });
    expect(await unconfirmed.json()).toEqual({ error: { code: "DELETE_CONFIRMATION_REQUIRED" } });
    const deleted = await removeEvaluation(request(`/api/evaluations/${id}`, { method: "DELETE", headers: { "x-bomti-confirm-delete": "true" } }, { cookie: sessionA }), { params: Promise.resolve({ id }) });
    expect(deleted.status).toBe(204);
  });

  it("rejects stale sessions immediately after deletion starts and retries each deterministic saga state idempotently", async () => {
    const user = subject("deletion-user");
    const staleSession = await sessionFor(user);
    const purges: string[] = [];
    expect(() => advanceFixtureDeletion(user, { failAfter: "sessions_revoked", purgeAppData: () => purges.push("purge") })).toThrow("DELETION_RETRY_REQUIRED");
    const stale = await listEvaluations(request("/api/evaluations", {}, { cookie: staleSession }));
    expect(await stale.json()).toEqual({ error: { code: "SESSION_REVOKED" } });
    expect(() => advanceFixtureDeletion(user, { failAfter: "app_data_deleted", purgeAppData: () => purges.push("purge") })).toThrow("DELETION_RETRY_REQUIRED");
    expect(() => advanceFixtureDeletion(user, { failAfter: "auth_user_deleted", purgeAppData: () => purges.push("purge") })).toThrow("DELETION_RETRY_REQUIRED");
    expect(() => advanceFixtureDeletion(user, { failAfter: "complete", purgeAppData: () => purges.push("purge") })).toThrow("DELETION_RETRY_REQUIRED");
    expect(advanceFixtureDeletion(user, { purgeAppData: () => purges.push("purge") })).toMatchObject({ terminal: "account_deleted", state: "complete" });
    expect(purges).toEqual(["purge"]);
    expect(fixtureAuthDiagnostics().deletionStates.at(-1)).toEqual({ state: "complete", attempts: 5 });
  });

  it("requires a fresh session for the account endpoint and clears the browser session after completion", async () => {
    const user = subject("account-user");
    const session = await sessionFor(user);
    const deleted = await deleteAccount(request("/api/account", { method: "DELETE" }, { cookie: session }));
    expect(await deleted.json()).toMatchObject({ terminal: "account_deleted", state: "complete" });
    expect(deleted.headers.get("set-cookie")).toMatch(/bomti_session=;.*Max-Age=0/);
    const stale = await listEvaluations(request("/api/evaluations", {}, { cookie: session }));
    expect(await stale.json()).toEqual({ error: { code: "SESSION_REVOKED" } });
  });
});

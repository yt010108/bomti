import { createHash, randomBytes, randomUUID } from "node:crypto";

export const GOOGLE_OAUTH_SCOPE = "openid email profile" as const;
export const PKCE_COOKIE = "bomti_pkce";
export const SESSION_COOKIE = "bomti_session";
export const AUTH_CALLBACK_CODES = ["access_denied", "state_invalid", "provider_unavailable", "session_exchange_failed", "reauth_required"] as const;

type PkceRecord = Readonly<{ state: string; verifier: string; returnTo: string; expiresAt: number }>;
type SessionRecord = Readonly<{ subject: string; expiresAt: number; freshUntil: number }>;
type DeletionState = "requested" | "sessions_revoked" | "app_data_deleted" | "auth_user_deleted" | "complete";
type DeletionRecord = { state: DeletionState; attempts: number };

const allowedReturnTo = new Set(["/", "/history", "/account"]);
const pkceRecords = new Map<string, PkceRecord>();
const sessions = new Map<string, SessionRecord>();
const deletionJobs = new Map<string, DeletionRecord>();
const blockedSubjects = new Set<string>();
const SESSION_TTL_MS = 60 * 60 * 1_000;
export const FRESH_SESSION_TTL_MS = 10 * 60 * 1_000;

export class FixtureAuthError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function opaqueId() {
  return randomBytes(32).toString("base64url");
}

function cookieValue(header: string | null, name: string) {
  if (!header) return null;
  for (const item of header.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function serializeCookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function noIdentifierReturnTo(value: string | null) {
  if (!value || !allowedReturnTo.has(value)) throw new FixtureAuthError("REDIRECT_FORBIDDEN");
  return value;
}

export function testFixtureSubject(request: Request) {
  const subject = request.headers.get("x-bomti-test-user")?.trim();
  if (!subject || !/^[a-z0-9][a-z0-9_-]{2,63}$/i.test(subject)) return null;
  return subject;
}

export function assertSubjectActive(subject: string) {
  if (blockedSubjects.has(subject)) throw new FixtureAuthError("SESSION_REVOKED");
}

export function beginFixtureAuthorization(returnTo: string | null) {
  const safeReturnTo = noIdentifierReturnTo(returnTo);
  const cookieId = opaqueId();
  const state = opaqueId();
  const verifier = opaqueId();
  pkceRecords.set(cookieId, { state, verifier, returnTo: safeReturnTo, expiresAt: Date.now() + FRESH_SESSION_TTL_MS });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  return {
    state,
    authorizeUrl: url.toString(),
    cookie: serializeCookie(PKCE_COOKIE, cookieId, Math.floor(FRESH_SESSION_TTL_MS / 1_000))
  };
}

function issueSession(subject: string, now = Date.now()) {
  assertSubjectActive(subject);
  const id = randomUUID();
  sessions.set(id, { subject, expiresAt: now + SESSION_TTL_MS, freshUntil: now + FRESH_SESSION_TTL_MS });
  return { subject, cookie: serializeCookie(SESSION_COOKIE, id, Math.floor(SESSION_TTL_MS / 1_000)) };
}

export function completeFixtureAuthorization(request: Request, state: string | null) {
  const cookieId = cookieValue(request.headers.get("cookie"), PKCE_COOKIE);
  const record = cookieId ? pkceRecords.get(cookieId) : undefined;
  if (cookieId) pkceRecords.delete(cookieId);
  if (!record || !state || state !== record.state || record.expiresAt < Date.now()) throw new FixtureAuthError("state_invalid");
  const subject = testFixtureSubject(request);
  if (!subject) throw new FixtureAuthError("session_exchange_failed");
  const session = issueSession(subject);
  return { ...session, returnTo: record.returnTo, clearPkceCookie: serializeCookie(PKCE_COOKIE, "", 0) };
}

export function fixtureSession(request: Request) {
  const id = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!id) return null;
  const record = sessions.get(id);
  if (!record || record.expiresAt < Date.now()) throw new FixtureAuthError("SESSION_REVOKED");
  assertSubjectActive(record.subject);
  return { id, ...record };
}

export function rotateFixtureSession(request: Request) {
  const current = fixtureSession(request);
  if (!current) throw new FixtureAuthError("AUTH_REQUIRED");
  sessions.delete(current.id);
  return issueSession(current.subject);
}

export function revokeFixtureSession(request: Request) {
  const current = fixtureSession(request);
  if (current) sessions.delete(current.id);
  return clearFixtureSessionCookie();
}

export function clearFixtureSessionCookie() {
  return serializeCookie(SESSION_COOKIE, "", 0);
}

export function requireFreshFixtureSession(request: Request) {
  const session = fixtureSession(request);
  if (session && session.freshUntil >= Date.now()) return session.subject;
  const directFixtureSubject = testFixtureSubject(request);
  if (directFixtureSubject && request.headers.get("x-bomti-fresh-session") === "true") {
    const deletion = deletionJobs.get(directFixtureSubject);
    if (blockedSubjects.has(directFixtureSubject) && (!deletion || deletion.state === "auth_user_deleted" || deletion.state === "complete")) {
      throw new FixtureAuthError("SESSION_REVOKED");
    }
    return directFixtureSubject;
  }
  throw new FixtureAuthError("FRESH_SESSION_REQUIRED");
}

function injectAfter(state: DeletionState, requested: string | null) {
  if (requested === state) throw new FixtureAuthError("DELETION_RETRY_REQUIRED");
}

export function advanceFixtureDeletion(subject: string, options: { failAfter?: string | null; purgeAppData: () => void }) {
  const job = deletionJobs.get(subject) ?? { state: "requested" as const, attempts: 0 };
  job.attempts += 1;
  deletionJobs.set(subject, job);

  if (job.state === "requested") {
    blockedSubjects.add(subject);
    job.state = "sessions_revoked";
    injectAfter(job.state, options.failAfter ?? null);
  }
  if (job.state === "sessions_revoked") {
    options.purgeAppData();
    job.state = "app_data_deleted";
    injectAfter(job.state, options.failAfter ?? null);
  }
  if (job.state === "app_data_deleted") {
    job.state = "auth_user_deleted";
    injectAfter(job.state, options.failAfter ?? null);
  }
  if (job.state === "auth_user_deleted") {
    job.state = "complete";
    injectAfter(job.state, options.failAfter ?? null);
  }
  return { terminal: "account_deleted" as const, state: job.state, attempts: job.attempts };
}

export function fixtureAuthDiagnostics() {
  return {
    providerTokenStored: false,
    sessionCount: sessions.size,
    pkceCount: pkceRecords.size,
    deletionStates: [...deletionJobs.values()].map((job) => ({ state: job.state, attempts: job.attempts }))
  };
}

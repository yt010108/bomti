import { createHash } from "node:crypto";
import { z } from "zod";
import { assertSubjectActive, FixtureAuthError, fixtureSession, testFixtureSubject } from "../auth/fixture-auth";

export const API_CONSENT_VERSION = "bomti_consent_v1" as const;
export const MAX_EVALUATION_BODY_BYTES = 20_000;

const consentSchema = z
  .object({
    version: z.literal(API_CONSENT_VERSION),
    providerDisclosure: z.literal(true),
    pseudonymization: z.literal(true),
    retention: z.literal(true)
  })
  .strict();

export const evaluationRequestSchema = z
  .object({
    question: z.string(),
    answer: z.string(),
    targetRole: z.string(),
    jobCompanyContext: z.string(),
    experienceEvidence: z.string().optional(),
    consent: consentSchema
  })
  .strict();

export type EvaluationRequest = z.infer<typeof evaluationRequestSchema>;
export type ApiAudience = "guest" | "authenticated";

export class ApiError extends Error {
  readonly name = "ApiError";

  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>
  ) {
    super(code);
  }
}

export function apiErrorResponse(error: unknown): Response {
  const known = error instanceof ApiError
    ? error
    : error instanceof Error && /^[A-Z][A-Z0-9_]*$/.test(error.message)
      ? new ApiError(422, error.message)
      : new ApiError(500, "INTERNAL_ERROR");
  return Response.json(
    { error: { code: known.code, ...(known.details ? { details: known.details } : {}) } },
    { status: known.status, headers: noStoreHeaders() }
  );
}

export function noStoreHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("Vary", "Origin, Cookie, Authorization");
  return headers;
}

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: noStoreHeaders(headers) });
}

export async function readJson(request: Request, limit = MAX_EVALUATION_BODY_BYTES): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLocaleLowerCase("en-US") ?? "";
  if (!contentType.startsWith("application/json")) throw new ApiError(415, "CONTENT_TYPE_REQUIRED");
  const length = request.headers.get("content-length");
  if (length && (!Number.isSafeInteger(Number(length)) || Number(length) > limit)) {
    throw new ApiError(413, "BODY_TOO_LARGE");
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > limit) throw new ApiError(413, "BODY_TOO_LARGE");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "MALFORMED_JSON");
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url);
  const localHarnessOrigin = testMode()
    && origin === `http://127.0.0.1:${expected.port}`
    && expected.hostname === "localhost";
  if (!origin || (origin !== expected.origin && !localHarnessOrigin)) throw new ApiError(403, "ORIGIN_FORBIDDEN");
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length < 16 || key.length > 200) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED");
  return key;
}

export function testMode(): boolean {
  return process.env.BOMTI_API_TEST_MODE === "true";
}

export function authenticatedSubject(request: Request): string | null {
  if (!testMode()) return null;
  const directFixtureSubject = testFixtureSubject(request);
  try {
    if (directFixtureSubject) {
      assertSubjectActive(directFixtureSubject);
      return directFixtureSubject;
    }
    return fixtureSession(request)?.subject ?? null;
  } catch (error) {
    if (error instanceof FixtureAuthError) throw new ApiError(401, error.code);
    throw error;
  }
}

export function audienceFor(request: Request): { audience: ApiAudience; subject: string } {
  const authenticated = authenticatedSubject(request);
  if (authenticated) return { audience: "authenticated", subject: authenticated };
  const guest = request.headers.get("x-bomti-guest-id")?.trim();
  if (testMode() && guest && /^[a-z0-9][a-z0-9_-]{2,63}$/i.test(guest)) {
    return { audience: "guest", subject: `guest:${guest}` };
  }
  if (testMode()) throw new ApiError(400, "GUEST_ID_REQUIRED");
  throw new ApiError(503, "AUTH_PERSISTENCE_NOT_READY");
}

export function requireAuthenticated(request: Request): string {
  const subject = authenticatedSubject(request);
  if (!subject) throw new ApiError(testMode() ? 401 : 503, testMode() ? "AUTH_REQUIRED" : "AUTH_PERSISTENCE_NOT_READY");
  return subject;
}

export function requestFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function idempotencyFingerprint(subject: string, key: string): string {
  return createHash("sha256").update(`${subject}\u0000${key}`).digest("hex");
}

export function parseLimit(value: string | null): number {
  if (!value) return 20;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) throw new ApiError(400, "PAGINATION_INVALID");
  return parsed;
}

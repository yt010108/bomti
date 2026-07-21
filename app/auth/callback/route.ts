import { completeFixtureAuthorization, FixtureAuthError } from "../../../lib/auth/fixture-auth";
import { ApiError, apiErrorResponse, jsonResponse, noStoreHeaders, testMode } from "../../../lib/api/contract";

export const dynamic = "force-dynamic";

const allowedCallbackCodes = new Set(["access_denied", "state_invalid", "provider_unavailable", "session_exchange_failed", "reauth_required"]);

export function GET(request: Request) {
  const url = new URL(request.url);
  const failure = url.searchParams.get("error");
  if (failure) {
    const code = allowedCallbackCodes.has(failure) ? failure : "provider_unavailable";
    return jsonResponse({ terminal: "auth_failed", code }, 400);
  }
  if (!url.searchParams.get("state")) return jsonResponse({ terminal: "auth_failed", code: "state_invalid" }, 400);
  if (!url.searchParams.get("code")) return jsonResponse({ terminal: "auth_failed", code: "session_exchange_failed" }, 400);
  if (!testMode()) return jsonResponse({ terminal: "auth_failed", code: "provider_unavailable" }, 503);
  try {
    const session = completeFixtureAuthorization(request, url.searchParams.get("state"));
    const headers = noStoreHeaders({ Location: session.returnTo });
    headers.append("Set-Cookie", session.cookie);
    headers.append("Set-Cookie", session.clearPkceCookie);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    if (error instanceof FixtureAuthError) {
      const code = allowedCallbackCodes.has(error.code as typeof allowedCallbackCodes extends Set<infer Value> ? Value : never)
        ? error.code
        : "session_exchange_failed";
      return jsonResponse({ terminal: "auth_failed", code }, 400);
    }
    return apiErrorResponse(new ApiError(500, "session_exchange_failed"));
  }
}

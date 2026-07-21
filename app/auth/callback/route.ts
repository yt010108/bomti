import { jsonResponse, noStoreHeaders, testMode } from "../../../lib/api/contract";

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
  return new Response(null, { status: 302, headers: noStoreHeaders({ Location: "/" }) });
}

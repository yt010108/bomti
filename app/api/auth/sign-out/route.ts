import { clearFixtureSessionCookie, FixtureAuthError, revokeFixtureSession } from "../../../../lib/auth/fixture-auth";
import { ApiError, apiErrorResponse, jsonResponse, requireSameOrigin, testMode } from "../../../../lib/api/contract";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!testMode()) throw new ApiError(503, "AUTH_PERSISTENCE_NOT_READY");
    const cookie = revokeFixtureSession(request);
    return jsonResponse({ terminal: "signed_out" }, 200, { "Set-Cookie": cookie });
  } catch (error) {
    if (error instanceof FixtureAuthError && error.code === "SESSION_REVOKED") {
      return jsonResponse({ terminal: "signed_out" }, 200, { "Set-Cookie": clearFixtureSessionCookie() });
    }
    return apiErrorResponse(error);
  }
}

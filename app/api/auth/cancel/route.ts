import { clearFixtureSessionCookie } from "../../../../lib/auth/fixture-auth";
import { ApiError, apiErrorResponse, jsonResponse, requireSameOrigin, testMode } from "../../../../lib/api/contract";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!testMode()) throw new ApiError(503, "AUTH_PERSISTENCE_NOT_READY");
    return jsonResponse({ terminal: "authorization_cancelled" }, 200, { "Set-Cookie": clearFixtureSessionCookie() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

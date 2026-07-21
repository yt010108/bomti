import { FixtureAuthError, rotateFixtureSession } from "../../../../lib/auth/fixture-auth";
import { ApiError, apiErrorResponse, jsonResponse, requireSameOrigin, testMode } from "../../../../lib/api/contract";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!testMode()) throw new ApiError(503, "AUTH_PERSISTENCE_NOT_READY");
    const session = rotateFixtureSession(request);
    return jsonResponse({ terminal: "session_refreshed" }, 200, { "Set-Cookie": session.cookie });
  } catch (error) {
    if (error instanceof FixtureAuthError) return apiErrorResponse(new ApiError(401, error.code));
    return apiErrorResponse(error);
  }
}

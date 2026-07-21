import { beginFixtureAuthorization, FixtureAuthError, GOOGLE_OAUTH_SCOPE } from "../../../../lib/auth/fixture-auth";
import { ApiError, apiErrorResponse, jsonResponse, testMode } from "../../../../lib/api/contract";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    if (!testMode()) throw new ApiError(503, "AUTH_PERSISTENCE_NOT_READY");
    const authorization = beginFixtureAuthorization(new URL(request.url).searchParams.get("returnTo"));
    return jsonResponse({ terminal: "authorization_started", provider: "google", scope: GOOGLE_OAUTH_SCOPE, authorizeUrl: authorization.authorizeUrl }, 200, {
      "Set-Cookie": authorization.cookie
    });
  } catch (error) {
    if (error instanceof FixtureAuthError) return apiErrorResponse(new ApiError(400, error.code));
    return apiErrorResponse(error);
  }
}

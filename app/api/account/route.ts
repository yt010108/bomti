import { advanceFixtureDeletion, clearFixtureSessionCookie, FixtureAuthError, requireFreshFixtureSession } from "../../../lib/auth/fixture-auth";
import { ApiError, apiErrorResponse, jsonResponse, requireSameOrigin, testMode } from "../../../lib/api/contract";
import { evaluationApiService } from "../../../lib/api/service";

export const dynamic = "force-dynamic";

export function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    if (!testMode()) throw new ApiError(503, "AUTH_PERSISTENCE_NOT_READY");
    const subject = requireFreshFixtureSession(request);
    const failure = request.headers.get("x-bomti-test-delete-failure");
    if (failure && !["sessions_revoked", "app_data_deleted", "auth_user_deleted", "complete"].includes(failure)) {
      throw new ApiError(400, "DELETION_FAILURE_POINT_INVALID");
    }
    const outcome = advanceFixtureDeletion(subject, {
      failAfter: failure,
      purgeAppData: () => evaluationApiService().deleteAccount(subject)
    });
    return jsonResponse(outcome, 200, { "Set-Cookie": clearFixtureSessionCookie() });
  } catch (error) {
    if (error instanceof FixtureAuthError) {
      return apiErrorResponse(new ApiError(error.code === "DELETION_RETRY_REQUIRED" ? 503 : 401, error.code));
    }
    return apiErrorResponse(error);
  }
}

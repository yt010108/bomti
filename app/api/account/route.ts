import { ApiError, apiErrorResponse, jsonResponse, requireAuthenticated, requireSameOrigin } from "../../../lib/api/contract";
import { evaluationApiService } from "../../../lib/api/service";

export const dynamic = "force-dynamic";

export function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    if (request.headers.get("x-bomti-fresh-session") !== "true") return apiErrorResponse(new ApiError(401, "FRESH_SESSION_REQUIRED"));
    evaluationApiService().deleteAccount(requireAuthenticated(request));
    return jsonResponse({ terminal: "account_deleted" });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

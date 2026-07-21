import { apiErrorResponse, jsonResponse, requireAuthenticated } from "../../../lib/api/contract";
import { evaluationApiService } from "../../../lib/api/service";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    return jsonResponse(evaluationApiService().usage(requireAuthenticated(request)));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

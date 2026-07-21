import { apiErrorResponse, jsonResponse, readJson, requireAuthenticated, requireSameOrigin } from "../../../../../lib/api/contract";
import { evaluationApiService } from "../../../../../lib/api/service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    return jsonResponse(evaluationApiService().feedback(requireAuthenticated(request), (await context.params).id, await readJson(request, 2_000)), 201);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

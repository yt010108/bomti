import { apiErrorResponse, jsonResponse, requireAuthenticated, requireSameOrigin } from "../../../../lib/api/contract";
import { evaluationApiService } from "../../../../lib/api/service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    return jsonResponse(evaluationApiService().get(requireAuthenticated(request), (await context.params).id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    evaluationApiService().remove(requireAuthenticated(request), (await context.params).id);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", Vary: "Origin, Cookie, Authorization" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

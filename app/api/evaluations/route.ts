import {
  apiErrorResponse,
  ApiError,
  audienceFor,
  evaluationRequestSchema,
  jsonResponse,
  parseLimit,
  readJson,
  requireAuthenticated,
  requireIdempotencyKey,
  requireSameOrigin
} from "../../../lib/api/contract";
import { evaluationApiService } from "../../../lib/api/service";
import { validateEvaluationInput } from "../../../lib/contracts/evaluation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const raw = await readJson(request);
    const body = evaluationRequestSchema.safeParse(raw);
    if (!body.success) {
      const consent = raw && typeof raw === "object" ? (raw as { consent?: unknown }).consent : undefined;
      if (!consent || typeof consent !== "object") return apiErrorResponse(new ApiError(409, "CONSENT_REQUIRED"));
      return apiErrorResponse(new ApiError(409, "CONSENT_VERSION_INVALID"));
    }
    const identity = audienceFor(request);
    const { consent, ...rawInput } = body.data;
    const validatedInput = validateEvaluationInput(rawInput, identity.audience);
    const { answerSegments: _answerSegments, ...normalizedInput } = validatedInput;
    const result = await evaluationApiService().create(
      { ...normalizedInput, consent },
      identity.audience,
      identity.subject,
      requireIdempotencyKey(request),
      request.headers.get("x-bomti-test-provider")
    );
    return jsonResponse(result, 201);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return jsonResponse(evaluationApiService().list(requireAuthenticated(request), url.searchParams.get("cursor"), parseLimit(url.searchParams.get("limit"))));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

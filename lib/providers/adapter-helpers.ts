import { z } from "zod";
import { validateProviderEvidence } from "../contracts/verdict-validation";
import type { DeepSeekCandidate, LunaCandidate, TerraCandidate } from "../contracts/verdict-candidates";
import type { ProviderRequest } from "../contracts/verdict-shared";
import type { SolCandidate, SolRequest } from "../contracts/verdict-sol";
import { ProviderError, ProviderTransportError, unavailableCode } from "./errors";
import type { ProviderRole } from "./types";

export function mapProviderFailure(error: unknown, role: ProviderRole): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof ProviderTransportError) {
    if (error.kind === "cancelled" && error.acceptance === "not_accepted") {
      return new ProviderError("REQUEST_CANCELLED", role, "not_accepted", false, error.providerRequestId);
    }
    if (error.acceptance === "possibly_accepted") {
      return new ProviderError("ADJUDICATION_REQUIRED", role, "possibly_accepted", false, error.providerRequestId);
    }
    return new ProviderError(unavailableCode(role), role, "not_accepted", false, error.providerRequestId);
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError || (error instanceof Error && error.message === "PROVIDER_OUTPUT_INVALID")) {
    return new ProviderError("PROVIDER_OUTPUT_INVALID", role, "accepted", false);
  }
  return new ProviderError(unavailableCode(role), role, "not_accepted", false);
}

export function assertInputTokenCeiling(body: unknown, limit: number, role: ProviderRole): void {
  // UTF-8 bytes are a conservative upper bound for BPE tokens, so this never dispatches
  // a request that can exceed the configured input-token reservation.
  const conservativeTokenUpperBound = new TextEncoder().encode(JSON.stringify(body)).length;
  if (conservativeTokenUpperBound > limit) {
    throw new ProviderError("PROVIDER_INPUT_LIMIT_EXCEEDED", role, "not_accepted", false);
  }
}

export function validateCandidateEvidence(
  candidate: DeepSeekCandidate | LunaCandidate | TerraCandidate | SolCandidate,
  input: ProviderRequest | SolRequest
): void {
  const request = "request" in input ? input.request : input;
  const segmentIds = request.segments.map((segment) => segment.segmentId);
  if ("decisions" in candidate) {
    const valid = new Set(segmentIds);
    if (candidate.evidence.some((item) => !valid.has(item.segmentId))) throw new Error("PROVIDER_OUTPUT_INVALID");
  } else {
    validateProviderEvidence(candidate, segmentIds);
  }
  if ("decisions" in candidate && "disagreements" in input) {
    const expected = input.disagreements.map((item) => item.fieldPath).sort();
    const actual = candidate.decisions.map((item) => item.fieldPath).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("PROVIDER_OUTPUT_INVALID");
  }
}

import type { AcceptanceState, ProviderRole } from "./types";

export type ProviderErrorCode =
  | "GUEST_PROVIDER_UNAVAILABLE"
  | "AUTH_PROVIDER_UNAVAILABLE"
  | "PROVIDER_INPUT_INVALID"
  | "PROVIDER_INPUT_LIMIT_EXCEEDED"
  | "PROVIDER_OUTPUT_INVALID"
  | "REQUEST_CANCELLED"
  | "ADJUDICATION_REQUIRED";

export class ProviderError extends Error {
  readonly name = "ProviderError";

  constructor(
    readonly code: ProviderErrorCode,
    readonly role: ProviderRole,
    readonly acceptance: AcceptanceState,
    readonly retryable: boolean,
    readonly providerRequestId: string | null = null
  ) {
    super(code);
  }
}

export class ProviderTransportError extends Error {
  readonly name = "ProviderTransportError";

  constructor(
    readonly kind: "cancelled" | "timeout" | "disconnect" | "connection_refused",
    readonly acceptance: Exclude<AcceptanceState, "accepted">,
    readonly providerRequestId: string | null = null
  ) {
    super(kind);
  }
}

export function unavailableCode(role: ProviderRole): ProviderErrorCode {
  return role === "guest" ? "GUEST_PROVIDER_UNAVAILABLE" : "AUTH_PROVIDER_UNAVAILABLE";
}

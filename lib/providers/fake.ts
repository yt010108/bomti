import "./server-only";
import { ProviderTransportError } from "./errors";
import type { ProviderTransport, TransportRequest, TransportResponse } from "./transport";

export type DeterministicTransportStep =
  | { readonly kind: "response"; readonly response: TransportResponse }
  | {
      readonly kind: "error";
      readonly error: {
        readonly kind: "cancelled" | "timeout" | "disconnect" | "connection_refused";
        readonly acceptance: "not_accepted" | "possibly_accepted";
        readonly providerRequestId?: string | null;
      };
    };

export class DeterministicProviderTransport implements ProviderTransport {
  readonly requests: TransportRequest[] = [];

  constructor(private readonly steps: DeterministicTransportStep[]) {}

  async dispatch(request: TransportRequest): Promise<TransportResponse> {
    this.requests.push(structuredClone({ ...request, signal: undefined }));
    const step = this.steps.shift();
    if (!step) throw new Error("DETERMINISTIC_TRANSPORT_EXHAUSTED");
    if (step.kind === "error") {
      throw new ProviderTransportError(
        step.error.kind,
        step.error.acceptance,
        step.error.providerRequestId ?? null
      );
    }
    return structuredClone(step.response);
  }
}

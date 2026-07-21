import "./server-only";
import { ProviderTransportError } from "./errors";

export type TransportRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
};

export type TransportResponse = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
};

export type ProviderTransport = {
  dispatch(request: TransportRequest): Promise<TransportResponse>;
};

export class FetchProviderTransport implements ProviderTransport {
  async dispatch(request: TransportRequest): Promise<TransportResponse> {
    if (request.signal?.aborted) {
      throw new ProviderTransportError("cancelled", "not_accepted");
    }
    const controller = new AbortController();
    let dispatched = false;
    const timeout = setTimeout(() => controller.abort("timeout"), request.timeoutMs);
    const abort = () => controller.abort("cancelled");
    request.signal?.addEventListener("abort", abort, { once: true });
    try {
      dispatched = true;
      const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal
      });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return {
        status: response.status,
        headers: {
          "x-request-id": response.headers.get("x-request-id") ?? undefined,
          "retry-after": response.headers.get("retry-after") ?? undefined
        },
        body
      };
    } catch (error) {
      const reason = controller.signal.reason;
      if (reason === "cancelled") {
        throw new ProviderTransportError("cancelled", dispatched ? "possibly_accepted" : "not_accepted");
      }
      if (reason === "timeout") throw new ProviderTransportError("timeout", "possibly_accepted");
      throw new ProviderTransportError("disconnect", dispatched ? "possibly_accepted" : "not_accepted");
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abort);
    }
  }
}

export async function dispatchWithSafeRetry(
  transport: ProviderTransport,
  request: TransportRequest
): Promise<TransportResponse> {
  try {
    return await transport.dispatch(request);
  } catch (error) {
    if (
      !(error instanceof ProviderTransportError)
      || error.acceptance !== "not_accepted"
      || error.kind === "cancelled"
    ) throw error;
    return transport.dispatch(request);
  }
}

import "./server-only";
import { providerRequestSchema } from "../contracts/verdict-shared";
import type { DeepSeekCandidate } from "../contracts/verdict-candidates";
import { assertInputTokenCeiling, mapProviderFailure, validateCandidateEvidence } from "./adapter-helpers";
import { providerCostMetadata } from "./cost";
import { ProviderError, unavailableCode } from "./errors";
import { providerInputJson, providerInstruction } from "./prompt";
import { outputSchemaFor, outputSchemaName } from "./schemas";
import { dispatchWithSafeRetry, FetchProviderTransport, type ProviderTransport } from "./transport";
import type { ProviderAdapter, ProviderCallOptions, ProviderCallResult, ProviderRoleConfiguration } from "./types";
import { parseOpenCodeResponse } from "./wire";

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

export class OpenCodeGuestAdapter implements ProviderAdapter<ReturnType<typeof providerRequestSchema.parse>, DeepSeekCandidate> {
  readonly role = "guest" as const;
  readonly modelId: string;

  constructor(
    private readonly configuration: ProviderRoleConfiguration,
    private readonly transport: ProviderTransport = new FetchProviderTransport()
  ) {
    if (configuration.role !== "guest" || configuration.providerId !== "opencode") {
      throw new Error("OPENCODE_GUEST_CONFIGURATION_REQUIRED");
    }
    this.modelId = configuration.modelId;
  }

  async evaluate(
    source: ReturnType<typeof providerRequestSchema.parse>,
    options: ProviderCallOptions
  ): Promise<ProviderCallResult<DeepSeekCandidate>> {
    const parsedInput = providerRequestSchema.safeParse(source);
    if (!parsedInput.success) {
      throw new ProviderError("PROVIDER_INPUT_INVALID", "guest", "not_accepted", false);
    }
    try {
      const input = parsedInput.data;
      const body = {
        model: this.configuration.modelId,
        messages: [
          { role: "system", content: providerInstruction("guest") },
          { role: "user", content: providerInputJson(input) }
        ],
        max_tokens: this.configuration.limits.outputTokens,
        stream: false,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: outputSchemaName("guest"),
            strict: true,
            schema: outputSchemaFor("guest")
          }
        }
      };
      assertInputTokenCeiling(body, this.configuration.limits.inputTokens, "guest");
      const response = await dispatchWithSafeRetry(this.transport, {
        url: endpoint(this.configuration.apiBaseUrl),
        timeoutMs: this.configuration.limits.timeoutMs,
        signal: options.signal,
        headers: {
          authorization: `Bearer ${this.configuration.apiKey}`,
          "content-type": "application/json",
          "x-client-correlation-id": options.clientCorrelationId,
          "x-idempotency-key": options.clientCorrelationId
        },
        body
      });
      if (response.status < 200 || response.status >= 300) {
        throw new ProviderError(unavailableCode("guest"), "guest", "not_accepted", false);
      }
      const parsed = parseOpenCodeResponse(response.body, "guest");
      validateCandidateEvidence(parsed.candidate as DeepSeekCandidate, input);
      return {
        role: "guest",
        providerId: "opencode",
        configuredModelId: this.configuration.modelId,
        resolvedModelId: parsed.resolvedModelId,
        providerRequestId: parsed.providerRequestId ?? response.headers["x-request-id"] ?? null,
        clientCorrelationId: options.clientCorrelationId,
        acceptance: "accepted",
        candidate: parsed.candidate as DeepSeekCandidate,
        cost: providerCostMetadata(parsed.usage, this.configuration)
      };
    } catch (error) {
      throw mapProviderFailure(error, "guest");
    }
  }
}

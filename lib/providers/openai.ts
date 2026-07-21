import "./server-only";
import { lunaCandidateSchema, terraCandidateSchema, type LunaCandidate, type TerraCandidate } from "../contracts/verdict-candidates";
import { providerRequestSchema, type ProviderRequest } from "../contracts/verdict-shared";
import { solCandidateSchema, solRequestSchema, type SolCandidate, type SolRequest } from "../contracts/verdict-sol";
import { assertInputTokenCeiling, mapProviderFailure, validateCandidateEvidence } from "./adapter-helpers";
import { providerCostMetadata } from "./cost";
import { ProviderError, unavailableCode } from "./errors";
import { providerInputJson, providerInstruction } from "./prompt";
import { outputSchemaFor, outputSchemaName } from "./schemas";
import { dispatchWithSafeRetry, FetchProviderTransport, type ProviderTransport } from "./transport";
import type {
  PaidProviderRole,
  ProviderAdapter,
  ProviderCallOptions,
  ProviderCallResult,
  ProviderRoleConfiguration
} from "./types";
import { parseOpenAiResponse } from "./wire";

type PaidInput<Role extends PaidProviderRole> = Role extends "sol" ? SolRequest : ProviderRequest;
type PaidCandidate<Role extends PaidProviderRole> = Role extends "luna"
  ? LunaCandidate
  : Role extends "terra"
    ? TerraCandidate
    : SolCandidate;

function inputForRole<Role extends PaidProviderRole>(role: Role, source: PaidInput<Role>): PaidInput<Role> | null {
  const parsed = (role === "sol" ? solRequestSchema : providerRequestSchema).safeParse(source);
  return parsed.success ? parsed.data as PaidInput<Role> : null;
}

function candidateForRole<Role extends PaidProviderRole>(role: Role, source: unknown): PaidCandidate<Role> {
  const schema = role === "luna" ? lunaCandidateSchema : role === "terra" ? terraCandidateSchema : solCandidateSchema;
  return schema.parse(source) as PaidCandidate<Role>;
}

export class OpenAIResponsesAdapter<Role extends PaidProviderRole>
  implements ProviderAdapter<PaidInput<Role>, PaidCandidate<Role>> {
  readonly modelId: string;

  constructor(
    readonly role: Role,
    private readonly configuration: ProviderRoleConfiguration,
    private readonly transport: ProviderTransport = new FetchProviderTransport()
  ) {
    if (configuration.role !== role || configuration.providerId !== "openai") {
      throw new Error("OPENAI_ROLE_CONFIGURATION_MISMATCH");
    }
    this.modelId = configuration.modelId;
  }

  async evaluate(source: PaidInput<Role>, options: ProviderCallOptions): Promise<ProviderCallResult<PaidCandidate<Role>>> {
    const parsedInput = inputForRole(this.role, source);
    if (!parsedInput) {
      throw new ProviderError("PROVIDER_INPUT_INVALID", this.role, "not_accepted", false);
    }
    try {
      const input = parsedInput;
      const body = {
        model: this.configuration.modelId,
        instructions: providerInstruction(this.role),
        input: [{ role: "user", content: [{ type: "input_text", text: providerInputJson(input) }] }],
        max_output_tokens: this.configuration.limits.outputTokens,
        reasoning: { effort: this.configuration.limits.reasoningEffort },
        text: {
          format: {
            type: "json_schema",
            name: outputSchemaName(this.role),
            strict: true,
            schema: outputSchemaFor(this.role)
          }
        },
        metadata: { client_correlation_id: options.clientCorrelationId },
        store: false
      };
      assertInputTokenCeiling(body, this.configuration.limits.inputTokens, this.role);
      const response = await dispatchWithSafeRetry(this.transport, {
        url: `${this.configuration.apiBaseUrl.replace(/\/$/, "")}/responses`,
        timeoutMs: this.configuration.limits.timeoutMs,
        signal: options.signal,
        headers: {
          authorization: `Bearer ${this.configuration.apiKey}`,
          "content-type": "application/json",
          "x-client-correlation-id": options.clientCorrelationId,
          "idempotency-key": options.clientCorrelationId
        },
        body
      });
      if (response.status < 200 || response.status >= 300) {
        throw new ProviderError(unavailableCode(this.role), this.role, "not_accepted", false);
      }
      const parsed = parseOpenAiResponse(response.body, this.role);
      const candidate = candidateForRole(this.role, parsed.candidate);
      validateCandidateEvidence(candidate, input);
      return {
        role: this.role,
        providerId: "openai",
        configuredModelId: this.configuration.modelId,
        resolvedModelId: parsed.resolvedModelId,
        providerRequestId: parsed.providerRequestId ?? response.headers["x-request-id"] ?? null,
        clientCorrelationId: options.clientCorrelationId,
        acceptance: "accepted",
        candidate,
        cost: providerCostMetadata(parsed.usage, this.configuration)
      };
    } catch (error) {
      throw mapProviderFailure(error, this.role);
    }
  }
}

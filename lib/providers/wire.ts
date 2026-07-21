import { z } from "zod";
import { deepSeekCandidateSchema, lunaCandidateSchema, terraCandidateSchema } from "../contracts/verdict-candidates";
import { solCandidateSchema } from "../contracts/verdict-sol";
import type { ProviderCandidate, ProviderRole, ProviderTokenUsage } from "./types";

const tokenUsageSchema = z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() });

const openCodeResponseSchema = z
  .object({
    id: z.string().min(1).optional(),
    model: z.string().min(1),
    choices: z.array(z.object({ message: z.object({ content: z.string() }).passthrough() }).passthrough()).min(1),
    usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative() })
  })
  .passthrough();

const openAiResponseSchema = z
  .object({
    id: z.string().min(1).optional(),
    model: z.string().min(1),
    output: z.array(
      z.object({
        type: z.string(),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).optional()
      }).passthrough()
    ),
    usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() })
  })
  .passthrough();

function parseJson(text: string): unknown {
  return JSON.parse(text);
}

export function parseCandidate(role: ProviderRole, source: unknown): ProviderCandidate {
  switch (role) {
    case "guest": return deepSeekCandidateSchema.parse(source);
    case "luna": return lunaCandidateSchema.parse(source);
    case "terra": return terraCandidateSchema.parse(source);
    case "sol": return solCandidateSchema.parse(source);
  }
}

export function parseOpenCodeResponse(source: unknown, role: "guest") {
  const response = openCodeResponseSchema.parse(source);
  return {
    candidate: parseCandidate(role, parseJson(response.choices[0].message.content)),
    resolvedModelId: response.model,
    providerRequestId: response.id ?? null,
    usage: tokenUsageSchema.parse({ inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens })
  };
}

export function parseOpenAiResponse(source: unknown, role: Exclude<ProviderRole, "guest">) {
  const response = openAiResponseSchema.parse(source);
  const outputText = response.output
    .flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text" && typeof item.text === "string")?.text;
  if (!outputText) throw new Error("PROVIDER_OUTPUT_INVALID");
  return {
    candidate: parseCandidate(role, parseJson(outputText)),
    resolvedModelId: response.model,
    providerRequestId: response.id ?? null,
    usage: tokenUsageSchema.parse({ inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }) as ProviderTokenUsage
  };
}

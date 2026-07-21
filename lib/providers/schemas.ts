import { criticalFlags, dimensionNames } from "../contracts/verdict-shared";
import type { ProviderRole } from "./types";

type JsonSchema = Readonly<Record<string, unknown>>;

const boundedString = (maximum: number, minimum = 1): JsonSchema => ({
  type: "string",
  minLength: minimum,
  maxLength: maximum
});

const stringEnum = (values: readonly string[]): JsonSchema => ({ type: "string", enum: values });
const score: JsonSchema = { type: "integer", minimum: 0, maximum: 100 };
const dimensionName = stringEnum(dimensionNames);
const criticalFlag = stringEnum(criticalFlags);

const evidence: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["segmentId", "dimension", "summary", "severity"],
  properties: {
    segmentId: { type: "string", pattern: "^s[0-9]{4}$" },
    dimension: dimensionName,
    summary: boundedString(280),
    severity: score
  }
};

const improvement: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["dimension", "direction", "example"],
  properties: {
    dimension: dimensionName,
    direction: boundedString(240),
    example: boundedString(160, 0)
  }
};

const fragment: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "purpose"],
  properties: { text: boundedString(160), purpose: boundedString(120) }
};

const dimensionAssessment = (name: string): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  required: ["score", "explanation", "evidence", "improvement"],
  properties: {
    score,
    explanation: boundedString(400),
    evidence: { type: "array", maxItems: 3, items: { ...evidence, properties: { ...(evidence.properties as object), dimension: { const: name } } } },
    improvement: { ...improvement, properties: { ...(improvement.properties as object), dimension: { const: name } } }
  }
});

const dimensions = Object.fromEntries(dimensionNames.map((name) => [name, dimensionAssessment(name)]));
const dimensionScores = Object.fromEntries(dimensionNames.map((name) => [name, score]));

const lunaProperties = {
  contractVersion: { const: "bomti_index_v1" },
  dimensions: {
    type: "object",
    additionalProperties: false,
    required: dimensionNames,
    properties: dimensions
  },
  criticalFlags: { type: "array", maxItems: 6, uniqueItems: true, items: criticalFlag }
};

const terraProperties = {
  contractVersion: { const: "bomti_index_v1" },
  holisticIndex: score,
  explanation: boundedString(800),
  evidence: { type: "array", maxItems: 5, items: evidence },
  improvements: { type: "array", minItems: 1, maxItems: 5, items: improvement },
  fragments: { type: "array", maxItems: 2, items: fragment },
  criticalFlags: { type: "array", maxItems: 6, uniqueItems: true, items: criticalFlag }
};

const schemas = {
  guest: {
    type: "object",
    additionalProperties: false,
    required: ["contractVersion", "dimensions", "criticalFlags", "holisticIndex", "explanation", "evidence", "improvements", "fragments"],
    properties: { ...lunaProperties, ...terraProperties }
  },
  luna: {
    type: "object",
    additionalProperties: false,
    required: ["contractVersion", "dimensions", "criticalFlags"],
    properties: lunaProperties
  },
  terra: {
    type: "object",
    additionalProperties: false,
    required: ["contractVersion", "holisticIndex", "explanation", "evidence", "improvements", "fragments", "criticalFlags"],
    properties: terraProperties
  },
  sol: {
    type: "object",
    additionalProperties: false,
    required: ["contractVersion", "finalIndex", "dimensions", "explanation", "evidence", "improvements", "fragments", "criticalFlags", "decisions"],
    properties: {
      contractVersion: { const: "bomti_index_v1" },
      finalIndex: score,
      dimensions: {
        type: "object",
        additionalProperties: false,
        required: dimensionNames,
        properties: dimensionScores
      },
      explanation: boundedString(800),
      evidence: { type: "array", maxItems: 5, items: evidence },
      improvements: { type: "array", minItems: 1, maxItems: 5, items: improvement },
      fragments: { type: "array", maxItems: 2, items: fragment },
      criticalFlags: { type: "array", maxItems: 6, uniqueItems: true, items: criticalFlag },
      decisions: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["fieldPath", "chosenFrom", "reason"],
          properties: {
            fieldPath: stringEnum([
              "/finalIndex",
              ...dimensionNames.map((name) => `/dimensions/${name}`),
              "/explanation",
              "/evidence",
              "/improvements",
              "/fragments",
              "/criticalFlags"
            ]),
            chosenFrom: stringEnum(["luna", "terra", "sol"]),
            reason: boundedString(240)
          }
        }
      }
    }
  }
} as const satisfies Record<ProviderRole, JsonSchema>;

export function outputSchemaFor(role: ProviderRole): JsonSchema {
  return schemas[role];
}

export function outputSchemaName(role: ProviderRole): string {
  return `bomti_${role}_candidate_v1`;
}

import { describe, expect, it } from "vitest";
import { validateEvaluationInput } from "../lib/contracts/evaluation";
import { providerRequestSchema, deepSeekCandidateSchema } from "../lib/contracts/verdict";
import deepSeekFixture from "./fixtures/judge/deepseek.valid.json";
import duplicateFixture from "./fixtures/judge/provider-output.duplicate.json";
import malformedFixture from "./fixtures/judge/provider-output.malformed.json";
import englishEmojiFixture from "./fixtures/judge/provider-request.en-emoji.json";
import koreanFixture from "./fixtures/judge/provider-request.ko.json";

describe("bomti_index_v1 provider boundaries", () => {
  it("accepts Korean and English provider request fixtures", () => {
    // Given
    const fixtures = [koreanFixture, englishEmojiFixture];

    // When
    const results = fixtures.map((fixture) => providerRequestSchema.safeParse(fixture));

    // Then
    expect(results.every((result) => result.success)).toBe(true);
  });

  it("accepts a code-point-boundary emoji field regardless of UTF-16 width", () => {
    // Given
    const source = { ...englishEmojiFixture, question: "😀".repeat(1200) };

    // When
    const result = providerRequestSchema.safeParse(source);

    // Then
    expect(result.success).toBe(true);
  });

  it("normalizes every bounded provider-controlled string to NFC", () => {
    // Given
    const source = { ...deepSeekFixture, explanation: "cafe\u0301" };

    // When
    const result = deepSeekCandidateSchema.parse(source);

    // Then
    expect(result.explanation).toBe("café");
  });

  it("accepts an emoji provider output at its code-point boundary", () => {
    // Given
    const source = { ...deepSeekFixture, explanation: "😀".repeat(800) };

    // When
    const result = deepSeekCandidateSchema.safeParse(source);

    // Then
    expect(result.success).toBe(true);
  });

  it("rejects normalized duplicate evidence", () => {
    // Given
    const source = { ...deepSeekFixture, evidence: duplicateFixture.evidence };

    // When
    const result = deepSeekCandidateSchema.safeParse(source);

    // Then
    expect(result.success).toBe(false);
  });

  it("accepts distinct evidence summaries for the same segment and dimension", () => {
    // Given
    const source = {
      ...deepSeekFixture,
      evidence: [
        deepSeekFixture.evidence[0],
        { ...deepSeekFixture.evidence[0], summary: "A distinct supporting observation" }
      ]
    };

    // When
    const result = deepSeekCandidateSchema.safeParse(source);

    // Then
    expect(result.success).toBe(true);
  });

  it("rejects duplicate improvement dimensions", () => {
    // Given
    const source = { ...deepSeekFixture, improvements: duplicateFixture.improvements };

    // When
    const result = deepSeekCandidateSchema.safeParse(source);

    // Then
    expect(result.success).toBe(false);
  });

  it("accepts distinct improvement directions for one dimension", () => {
    // Given
    const source = {
      ...deepSeekFixture,
      improvements: [
        deepSeekFixture.improvements[0],
        { ...deepSeekFixture.improvements[0], direction: "Add a concrete comparison point" }
      ]
    };

    // When
    const result = deepSeekCandidateSchema.safeParse(source);

    // Then
    expect(result.success).toBe(true);
  });

  it("rejects duplicate critical flags", () => {
    // Given
    const source = { ...deepSeekFixture, criticalFlags: duplicateFixture.criticalFlags };

    // When
    const result = deepSeekCandidateSchema.safeParse(source);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects normalized duplicate fragments", () => {
    // Given
    const fragment = deepSeekFixture.fragments[0];
    const source = {
      ...deepSeekFixture,
      fragments: [fragment, { ...fragment, text: `${fragment.text}e\u0301`, purpose: `${fragment.purpose}e\u0301` }]
    };
    const normalizedDuplicate = {
      ...source,
      fragments: [
        { ...fragment, text: "cafe\u0301", purpose: "detaille\u0301" },
        { ...fragment, text: "café", purpose: "detaillé" }
      ]
    };

    // When
    const result = deepSeekCandidateSchema.safeParse(normalizedDuplicate);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects unexpected keys in nested dimension records", () => {
    // Given
    const source = {
      ...deepSeekFixture,
      dimensions: {
        ...deepSeekFixture.dimensions,
        unexpectedDimension: deepSeekFixture.dimensions.contextMismatch
      }
    };

    // When
    const result = deepSeekCandidateSchema.safeParse(source);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects evidence assigned to the wrong dimension assessment", () => {
    // Given
    const source = {
      ...deepSeekFixture,
      dimensions: {
        ...deepSeekFixture.dimensions,
        contextMismatch: {
          ...deepSeekFixture.dimensions.contextMismatch,
          evidence: [
            {
              ...deepSeekFixture.dimensions.contextMismatch.evidence[0],
              dimension: "genericityCliche"
            }
          ]
        }
      }
    };

    // When
    const result = deepSeekCandidateSchema.safeParse(source);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects improvement guidance assigned to the wrong dimension assessment", () => {
    // Given
    const source = {
      ...deepSeekFixture,
      dimensions: {
        ...deepSeekFixture.dimensions,
        contextMismatch: {
          ...deepSeekFixture.dimensions.contextMismatch,
          improvement: {
            ...deepSeekFixture.dimensions.contextMismatch.improvement,
            dimension: "specificityGap"
          }
        }
      }
    };

    // When
    const result = deepSeekCandidateSchema.safeParse(source);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects the malformed adversarial provider fixture", () => {
    // Given
    const source = malformedFixture;

    // When
    const result = deepSeekCandidateSchema.safeParse(source);

    // Then
    expect(result.success).toBe(false);
  });

  it("coalesces every accepted answer to the provider segment ceiling", () => {
    // Given
    const answer = Array.from({ length: 1000 }, (_, index) => `${index % 10}.`).join(" ");

    // When
    const input = validateEvaluationInput(
      {
        question: "Describe a result",
        answer,
        targetRole: "Operations",
        jobCompanyContext: "Subscription service"
      },
      "authenticated"
    );

    // Then
    expect(input.answerSegments).toHaveLength(999);
    expect(
      providerRequestSchema.safeParse({
        contractVersion: "bomti_index_v1",
        locale: "en",
        question: input.question,
        targetRole: input.targetRole,
        jobCompanyContext: input.jobCompanyContext,
        experienceEvidence: input.experienceEvidence ?? "",
        segments: input.answerSegments.map((segment) => ({
          segmentId: segment.segmentId,
          pseudonymizedText: segment.originalText
        }))
      }).success
    ).toBe(true);
  });
});

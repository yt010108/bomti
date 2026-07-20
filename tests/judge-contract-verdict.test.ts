import { describe, expect, it } from "vitest";
import { normalizedVerdictSchema } from "../lib/contracts/verdict";
import verdictFixture from "./fixtures/judge/normalized-verdict.valid.json";

describe("bomti_index_v1 normalized verdict", () => {
  it("accepts the exact literal provenance map", () => {
    // Given
    const source = verdictFixture;

    // When
    const result = normalizedVerdictSchema.safeParse(source);

    // Then
    expect(result.success).toBe(true);
  });

  it("rejects empty provenance", () => {
    // Given
    const source = { ...verdictFixture, provenance: {} };

    // When
    const result = normalizedVerdictSchema.safeParse(source);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects partial provenance", () => {
    // Given
    const source = { ...verdictFixture, provenance: { "/finalIndex": "server:hybrid" } };

    // When
    const result = normalizedVerdictSchema.safeParse(source);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects arbitrary extra provenance paths", () => {
    // Given
    const source = {
      ...verdictFixture,
      provenance: { ...verdictFixture.provenance, "/arbitrary": "sol" }
    };

    // When
    const result = normalizedVerdictSchema.safeParse(source);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects a source forbidden for a final field", () => {
    // Given
    const source = {
      ...verdictFixture,
      provenance: { ...verdictFixture.provenance, "/descriptor": "sol" }
    };

    // When
    const result = normalizedVerdictSchema.safeParse(source);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects a descriptor that contradicts finalIndex", () => {
    // Given
    const source = { ...verdictFixture, descriptor: "밤티 그 자체" };

    // When
    const result = normalizedVerdictSchema.safeParse(source);

    // Then
    expect(result.success).toBe(false);
  });
});

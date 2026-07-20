import { describe, expect, it } from "vitest";
import { segmentAnswer } from "../lib/contracts/text";

describe("bomti_index_v1 characterization", () => {
  it("keeps an unpunctuated English answer as one stable provider segment", () => {
    // Given
    const answer = "I coordinated the launch across product and support";

    // When
    const segments = segmentAnswer(answer);

    // Then
    expect(segments).toEqual([{ segmentId: "s0001", originalText: answer }]);
  });
});

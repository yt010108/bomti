import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvidenceCard, ScoreMeter, scoreDescriptor } from "../components/bomti";

describe("Bomti design primitives", () => {
  it.each([
    [0, "밤티 거의 없음"], [24, "밤티 거의 없음"], [25, "살짝 밤티"], [49, "살짝 밤티"],
    [50, "꽤 밤티"], [74, "꽤 밤티"], [75, "밤티 그 자체"], [100, "밤티 그 자체"]
  ])("maps %i to its exact descriptor", (score, descriptor) => {
    expect(scoreDescriptor(score)).toBe(descriptor);
  });

  it("renders complete progressbar semantics", () => {
    const html = renderToStaticMarkup(createElement(ScoreMeter, { score: 67 }));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="67"');
    expect(html).toContain("꽤 밤티");
  });

  it("escapes evidence instead of rendering it as HTML", () => {
    const html = renderToStaticMarkup(createElement(EvidenceCard, {
      segmentId: "s0001",
      quote: "<script>alert(1)</script>",
      reason: "합성 XSS fixture"
    }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

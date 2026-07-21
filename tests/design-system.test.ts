import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvidenceCard, ScoreMeter, scoreDescriptor } from "../components/bomti";

describe("Bomti design primitives", () => {
  it.each([
    [0, "보완이 필요해요"], [24, "보완이 필요해요"], [25, "다듬으면 좋아요"], [49, "다듬으면 좋아요"],
    [50, "기본기가 좋아요"], [74, "기본기가 좋아요"], [75, "설득력이 좋아요"], [100, "설득력이 좋아요"]
  ])("maps %i to its exact descriptor", (score, descriptor) => {
    expect(scoreDescriptor(score)).toBe(descriptor);
  });

  it("renders complete progressbar semantics", () => {
    const html = renderToStaticMarkup(createElement(ScoreMeter, { score: 67 }));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="67"');
    expect(html).toContain("기본기가 좋아요");
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

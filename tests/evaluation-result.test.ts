import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvaluationResult, scoreDescriptor } from "../components/bomti";

const verdict = (score: number, segmentId = "s0001", summary = "문장 근거") => ({
  finalIndex: score,
  dimensions: { contextMismatch: score, genericityCliche: score, credibilityRisk: score, specificityGap: score, toneReadabilityRisk: score },
  explanation: "간결한 설명",
  evidence: Array.from({ length: 4 }, (_, index) => ({ segmentId, dimension: "genericityCliche", summary: `${summary}-${index}`, severity: score })),
  improvements: [{ dimension: "genericityCliche", direction: "구체적인 행동을 연결하세요.", example: "상황과 결과를 제시합니다." }]
});

describe("evaluation result", () => {
  it.each([[0], [24], [25], [49], [50], [74], [75], [100]])("keeps exact descriptor and meter semantics at %i", (score) => {
    const html = renderToStaticMarkup(createElement(EvaluationResult, { audience: "guest", verdict: verdict(score) }));
    expect(html).toContain(scoreDescriptor(score));
    expect(html).toContain(`aria-valuenow="${score}"`);
    expect((html.match(/<figure /g) ?? []).length).toBe(3);
  });

  it("rejects invalid segment IDs and renders XSS as inert text", () => {
    const invalid = renderToStaticMarkup(createElement(EvaluationResult, { audience: "guest", verdict: verdict(42, "invalid") }));
    expect(invalid).toContain("검증되지 않은 근거");
    const escaped = renderToStaticMarkup(createElement(EvaluationResult, { audience: "guest", verdict: verdict(42, "s0001", "<script>alert(1)</script>") }));
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
  });

  it("does not expose a full rewrite contract", async () => {
    const source = `${await readFile("app/evaluation-form.tsx", "utf8")}\n${await readFile("components/bomti/evaluation-result.tsx", "utf8")}`;
    expect(source).not.toContain("fullRewrite");
  });
});

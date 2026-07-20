import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const receiptSchema = z.object({
  verdict: z.enum(["fail", "pass"]),
  code: z.string().optional(),
  requirementCount: z.number().optional()
});

async function runRequirements(source?: string) {
  const output = await mkdtemp(path.join(os.tmpdir(), "bomti-requirements-output-"));
  const args = [
    "scripts/verification/requirements.mjs",
    "--profile=current",
    `--out=${output}`,
    "--sha=verification-test-sha"
  ];
  if (source) args.push(`--source=${source}`);
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: "ignore" });
    child.once("exit", (code) => resolve(code ?? 1));
  });
  const receipt = receiptSchema.parse(JSON.parse(await readFile(path.join(output, "result.json"), "utf8")));
  await rm(output, { recursive: true, force: true });
  return { exitCode, receipt };
}

describe("canonical requirements structure", () => {
  it("accepts the complete canonical ledger", async () => {
    // Given: the checked-in canonical requirements document.
    // When: structural verification parses its Markdown AST.
    const result = await runRequirements();

    // Then: all IDs and required contract cells are complete.
    expect(result).toEqual({ exitCode: 0, receipt: { verdict: "pass", requirementCount: 15 } });
  });

  it.each([
    ["terminal heading", "## 터미널 상태 및 HTTP 매핑", "MISSING_HEADING:터미널 상태 및 HTTP 매핑"],
    [
      "terminal table",
      "| 상태 | 종결 여부 | HTTP | 공개 상태 | 안정적 오류 코드 | verdict | 재시도 |",
      "MISSING_TABLE:터미널 상태 및 HTTP 매핑"
    ],
    ["input mapping", "| `question` |", "MISSING_MAPPING:input.question"],
    ["terminal mapping", "| `provider_output_invalid` |", "MISSING_MAPPING:terminal.provider_output_invalid"],
    ["error code", "| `ADJUDICATION_REQUIRED` | 503 |", "MISSING_MAPPING:error.ADJUDICATION_REQUIRED"],
    ["partial verdict rule", "| 부분 verdict |", "MISSING_MAPPING:success.partial-verdict"]
  ])("rejects a missing %s", async (_label, target, expectedCode) => {
    // Given: one required structural cell removed from a copied ledger.
    const directory = await mkdtemp(path.join(os.tmpdir(), "bomti-requirements-source-"));
    const source = path.join(directory, "requirements.md");
    const markdown = await readFile(path.join(process.cwd(), "docs", "requirements.md"), "utf8");
    await writeFile(source, markdown.replace(target, "REMOVED_FOR_STRUCTURAL_TEST"), "utf8");

    // When: structural verification parses the malformed copy.
    const result = await runRequirements(source);
    await rm(directory, { recursive: true, force: true });

    // Then: the stable code names the missing semantic mapping.
    expect(result.exitCode).not.toBe(0);
    expect(result.receipt).toMatchObject({ verdict: "fail", code: expectedCode });
  });
});

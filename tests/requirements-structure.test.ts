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
    [
      "terminal heading",
      "## 터미널 상태 및 HTTP 매핑",
      "REMOVED_FOR_STRUCTURAL_TEST",
      "MISSING_HEADING:터미널 상태 및 HTTP 매핑"
    ],
    [
      "terminal table",
      "| 상태 | 종결 여부 | HTTP | 공개 상태 | 안정적 오류 코드 | verdict | 재시도 |",
      "REMOVED_FOR_STRUCTURAL_TEST",
      "MISSING_TABLE:터미널 상태 및 HTTP 매핑"
    ],
    ["input mapping", "| `question` |", "REMOVED_FOR_STRUCTURAL_TEST", "MISSING_MAPPING:input.question"],
    [
      "terminal mapping",
      "| `provider_output_invalid` |",
      "REMOVED_FOR_STRUCTURAL_TEST",
      "MISSING_MAPPING:terminal.provider_output_invalid"
    ],
    [
      "error code",
      "| `ADJUDICATION_REQUIRED` | 503 |",
      "REMOVED_FOR_STRUCTURAL_TEST",
      "MISSING_MAPPING:error.ADJUDICATION_REQUIRED"
    ],
    [
      "partial verdict rule",
      "| 부분 verdict |",
      "REMOVED_FOR_STRUCTURAL_TEST",
      "MISSING_MAPPING:success.partial-verdict"
    ],
    [
      "score weight",
      "`contextMismatch` 25%",
      "`contextMismatch` 24%",
      "MISSING_MAPPING:score.dimensions"
    ],
    [
      "score descriptor",
      "0–24 `밤티 거의 없음`",
      "0–24 `밤티 위험 낮음`",
      "MISSING_MAPPING:score.descriptors"
    ],
    [
      "terminal completion flag",
      "| `validation_failed` | 종결 | 400 |",
      "| `validation_failed` | 비종결 | 400 |",
      "MISSING_MAPPING:terminal.validation_failed"
    ],
    [
      "terminal retry rule",
      "| `completed` | 종결 | 200 | `completed` | 없음 | 완전한 verdict | 불필요 |",
      "| `completed` | 종결 | 200 | `completed` | 없음 | 완전한 verdict | 필요 |",
      "MISSING_MAPPING:terminal.completed"
    ],
    [
      "error public meaning",
      "| `PROVIDER_OUTPUT_INVALID` | 502 | `provider_output_invalid` | 구조·범위·세그먼트·PII 검증 실패 |",
      "| `PROVIDER_OUTPUT_INVALID` | 502 | `provider_output_invalid` | 공급자 응답 실패 |",
      "MISSING_MAPPING:error.PROVIDER_OUTPUT_INVALID"
    ],
    [
      "retry user allowance",
      "| Sol 있는 인증 `completed` | 계정 1회 소비 | 수락 뒤 1회 소비 |",
      "| Sol 있는 인증 `completed` | 소비 없음 | 수락 뒤 1회 소비 |",
      "MISSING_MAPPING:retry.completed-sol"
    ],
    [
      "retry Sol allowance",
      "| 게스트 `completed` | IP·쿠키·전역 각 1회 소비 | 해당 없음 |",
      "| 게스트 `completed` | IP·쿠키·전역 각 1회 소비 | 예약 해제 |",
      "MISSING_MAPPING:retry.completed-guest"
    ]
  ])("rejects a malformed %s", async (_label, target, replacement, expectedCode) => {
    // Given: one required structural cell altered in a copied ledger.
    const directory = await mkdtemp(path.join(os.tmpdir(), "bomti-requirements-source-"));
    const source = path.join(directory, "requirements.md");
    const markdown = await readFile(path.join(process.cwd(), "docs", "requirements.md"), "utf8");
    await writeFile(source, markdown.replace(target, replacement), "utf8");

    // When: structural verification parses the malformed copy.
    const result = await runRequirements(source);
    await rm(directory, { recursive: true, force: true });

    // Then: the stable code names the missing semantic mapping.
    expect(result.exitCode).not.toBe(0);
    expect(result.receipt).toMatchObject({ verdict: "fail", code: expectedCode });
  });
});

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const receiptSchema = z.object({
  verdict: z.enum(["approve", "blocked", "fail", "pass", "skipped"]),
  runner: z.string(),
  profile: z.string(),
  sha: z.string(),
  code: z.string().optional(),
  assertions: z.array(z.string())
});

type Invocation = {
  readonly runner: string;
  readonly profile: string;
  readonly expectedVerdict: "blocked" | "pass" | "skipped";
  readonly expectedCode?: "dependency_not_ready" | "operator_not_authorized" | "operator_not_supplied";
};

async function runFixture(invocation: Invocation) {
  const output = await mkdtemp(path.join(os.tmpdir(), "bomti-runner-test-"));
  const args = [
    "scripts/verification/fixture.mjs",
    invocation.runner,
    `--profile=${invocation.profile}`,
    `--out=${output}`,
    "--sha=verification-test-sha"
  ];
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: "ignore" });
    child.once("exit", (code) => resolve(code ?? 1));
  });
  const receipt = receiptSchema.parse(JSON.parse(await readFile(path.join(output, "result.json"), "utf8")));
  await rm(output, { recursive: true, force: true });
  return { exitCode, receipt };
}

describe("verification fixture runner", () => {
  it("routes current, future, operator, and live profiles to honest receipts", async () => {
    // Given: one profile from each executable dependency class.
    const invocations = [
      { runner: "e2e", profile: "toolchain-fixture-contract", expectedVerdict: "pass" },
      {
        runner: "privacy",
        profile: "korean-pii-clean-context",
        expectedVerdict: "blocked",
        expectedCode: "dependency_not_ready"
      },
      {
        runner: "final-qa",
        profile: "final-product",
        expectedVerdict: "blocked",
        expectedCode: "dependency_not_ready"
      },
      {
        runner: "benchmark-pair",
        profile: "eligible-live",
        expectedVerdict: "blocked",
        expectedCode: "operator_not_supplied"
      },
      {
        runner: "live",
        profile: "authorization-state",
        expectedVerdict: "skipped",
        expectedCode: "operator_not_authorized"
      },
      {
        runner: "independent-review",
        profile: "readonly-final",
        expectedVerdict: "blocked",
        expectedCode: "operator_not_supplied"
      }
    ] satisfies readonly Invocation[];

    // When: the public CLI dispatches every profile.
    const results = await Promise.all(invocations.map(runFixture));

    // Then: each command exits cleanly with a non-fabricated machine verdict.
    expect(results.map(({ exitCode }) => exitCode)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(results.map(({ receipt }) => ({ verdict: receipt.verdict, code: receipt.code }))).toEqual(
      invocations.map(({ expectedVerdict, expectedCode }) => ({ verdict: expectedVerdict, code: expectedCode }))
    );
    expect(results.some(({ receipt }) => receipt.code?.startsWith("RUNNER_NOT_IMPLEMENTED"))).toBe(false);
  });

  it("rejects an undocumented runner/profile pair", async () => {
    // Given: a runner/profile pair absent from the canonical matrix.
    const invocation = {
      runner: "privacy",
      profile: "invented-profile",
      expectedVerdict: "blocked"
    } satisfies Invocation;

    // When: the pair crosses the CLI boundary.
    const output = await mkdtemp(path.join(os.tmpdir(), "bomti-runner-unknown-"));
    const exitCode = await new Promise<number>((resolve) => {
      const child = spawn(
        process.execPath,
        [
          "scripts/verification/fixture.mjs",
          invocation.runner,
          `--profile=${invocation.profile}`,
          `--out=${output}`,
          "--sha=verification-test-sha"
        ],
        { cwd: process.cwd(), stdio: "ignore" }
      );
      child.once("exit", (code) => resolve(code ?? 1));
    });

    // Then: dispatch fails instead of silently treating it as a future profile.
    await rm(output, { recursive: true, force: true });
    expect(exitCode).not.toBe(0);
  });

  it("binds the malformed judge receipt to the named invalid fixture", async () => {
    // Given: the malformed profile and its checked-in mutation fixture.
    const output = await mkdtemp(path.join(os.tmpdir(), "bomti-judge-profile-"));

    // When: the judge CLI executes that failure profile.
    const exitCode = await new Promise<number>((resolve) => {
      const child = spawn(
        process.execPath,
        [
          "scripts/verification/judge.mjs",
          "--profile=malformed-score-script-segment",
          `--out=${output}`,
          "--sha=verification-test-sha"
        ],
        { cwd: process.cwd(), stdio: "ignore" }
      );
      child.once("exit", (code) => resolve(code ?? 1));
    });
    const receipt = receiptSchema.parse(JSON.parse(await readFile(path.join(output, "result.json"), "utf8")));
    await rm(output, { recursive: true, force: true });

    // Then: the intended nonzero result records that the invalid fixture was actually exercised.
    expect(exitCode).not.toBe(0);
    expect(receipt).toMatchObject({ verdict: "fail", code: "PROVIDER_OUTPUT_INVALID" });
    expect(receipt.assertions).toContain("named malformed fixture executed");
  });
});

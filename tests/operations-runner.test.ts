import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function run(script: string, profile: string) {
  const output = await mkdtemp(path.join(os.tmpdir(), "bomti-operations-test-"));
  const code = await new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [script, `--profile=${profile}`, `--out=${output}`, "--sha=operations-test-sha"], {
      cwd: process.cwd(),
      stdio: "ignore"
    });
    child.once("exit", (value) => resolve(value ?? 1));
  });
  const receipt = JSON.parse(await readFile(path.join(output, "result.json"), "utf8"));
  return { code, output, receipt };
}

describe("operations verification runners", () => {
  it("records safe degraded configuration outcomes without secrets or external calls", async () => {
    const result = await run("scripts/verification/operations.mjs", "paused-db-missing-model-disabled-budget-expired-oauth-provider429-corrupt-backup");
    try {
      expect(result.code).toBe(0);
      expect(result.receipt).toMatchObject({ verdict: "pass", runner: "operations", sha: "operations-test-sha" });
      expect(result.receipt.degradedStates).toEqual(expect.arrayContaining(["DATABASE_PAUSED_BLOCKED", "BACKUP_AUTH_TAG_INVALID"]));
      expect(JSON.stringify(result.receipt)).not.toContain("benign-secret-value");
    } finally {
      await rm(result.output, { recursive: true, force: true });
    }
  });

  it("keeps live verification skipped until a separately authorized operator action", async () => {
    const result = await run("scripts/verification/live.mjs", "authorization-state");
    try {
      expect(result.code).toBe(0);
      expect(result.receipt).toMatchObject({ verdict: "skipped", code: "operator_not_authorized", sha: "operations-test-sha" });
    } finally {
      await rm(result.output, { recursive: true, force: true });
    }
  });
});

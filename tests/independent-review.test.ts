import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const receiptSchema = z.object({
  verdict: z.literal("approve"),
  sha: z.string(),
  scope: z.literal("sanitized read-only exact-SHA snapshot"),
  assertions: z.array(z.string())
});

describe("independent review runner", () => {
  it("reviews an exact-SHA sanitized read-only snapshot when explicitly enabled", async () => {
    // Given: an approved redacted security receipt and a narrow executable Codex fixture.
    const workspace = await mkdtemp(path.join(os.tmpdir(), "bomti-review-test-"));
    const output = path.join(workspace, "output");
    const securityReceipt = path.join(workspace, "security.json");
    const fakeCodex = path.join(workspace, "codex-fixture.mjs");
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).trim();
    await writeFile(
      securityReceipt,
      `${JSON.stringify({
        verdict: "pass",
        sha,
        redaction: "no secrets, raw inputs, identifiers, or tokens included"
      })}\n`,
      "utf8"
    );
    await writeFile(
      fakeCodex,
      `#!/usr/bin/env node
import { existsSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const required = ["--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check", "--sandbox=read-only", "--model=gpt-5.6-sol", "--config=model_reasoning_effort=\\\"xhigh\\\""];
if (required.some((flag) => !args.includes(flag))) process.exit(2);
const output = args.find((value) => value.startsWith("--output-last-message="))?.slice(22);
const snapshot = args.find((value) => value.startsWith("--cd="))?.slice(5);
const sha = args.at(-1)?.match(/[0-9a-f]{40}/)?.[0];
if (!output || !snapshot || !sha) process.exit(3);
if ((statSync(snapshot).mode & 0o222) !== 0 || existsSync(path.join(snapshot, ".env.example"))) process.exit(4);
writeFileSync(output, JSON.stringify({ reviewedSha: sha, verdict: "APPROVE", criticalFindings: 0, highFindings: 0 }));
`,
      "utf8"
    );
    await chmod(fakeCodex, 0o755);

    // When: the public independent-review CLI executes the authorized path.
    const exitCode = await new Promise<number>((resolve) => {
      const child = spawn(
        process.execPath,
        [
          "scripts/verification/fixture.mjs",
          "independent-review",
          "--profile=readonly-final",
          `--out=${output}`,
          `--sha=${sha}`,
          `--input=${securityReceipt}`,
          "--enabled=true",
          `--codex=${fakeCodex}`
        ],
        { cwd: process.cwd(), stdio: "ignore" }
      );
      child.once("exit", (code) => resolve(code ?? 1));
    });
    const receipt = receiptSchema.parse(JSON.parse(await readFile(path.join(output, "result.json"), "utf8")));
    await rm(workspace, { recursive: true, force: true });

    // Then: the sanitized snapshot and review receipt are bound to that exact SHA.
    expect(exitCode).toBe(0);
    expect(receipt.sha).toBe(sha);
    expect(receipt.assertions).toContain("environment and key paths excluded from snapshot");
  });
});

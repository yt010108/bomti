import { execFile } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const securityReceiptSchema = z.object({
  verdict: z.enum(["approve", "pass"]),
  sha: z.string(),
  redaction: z.literal("no secrets, raw inputs, identifiers, or tokens included")
});

async function makeReadOnly(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await makeReadOnly(target);
      await chmod(target, 0o555);
    } else {
      await chmod(target, 0o444);
    }
  }
  await chmod(directory, 0o555);
}

async function makeWritable(directory) {
  await chmod(directory, 0o755);
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await makeWritable(target);
    else await chmod(target, 0o644);
  }
}

async function createSnapshot(sha, workspace) {
  const archive = path.join(workspace, "snapshot.tar");
  const snapshot = path.join(workspace, "snapshot");
  const { stdout } = await execFileAsync(
    "git",
    [
      "archive",
      "--format=tar",
      sha,
      "--",
      ".",
      ":(exclude).env*",
      ":(exclude).omo/evidence/**",
      ":(exclude)**/*.pem",
      ":(exclude)**/*.key"
    ],
    { cwd: process.cwd(), encoding: "buffer", maxBuffer: 50 * 1024 * 1024 }
  );
  await writeFile(archive, stdout);
  await mkdir(snapshot);
  await execFileAsync("tar", ["-xf", archive, "-C", snapshot]);
  await makeReadOnly(snapshot);
  return snapshot;
}

function reviewSchema(sha) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["reviewedSha", "verdict", "criticalFindings", "highFindings"],
    properties: {
      reviewedSha: { const: sha },
      verdict: { enum: ["APPROVE", "REJECT"] },
      criticalFindings: { type: "integer", minimum: 0 },
      highFindings: { type: "integer", minimum: 0 }
    }
  };
}

async function executeReview(flags, snapshot, workspace) {
  const schemaPath = path.join(workspace, "review-schema.json");
  const resultPath = path.join(workspace, "review-result.json");
  await writeFile(schemaPath, `${JSON.stringify(reviewSchema(flags.sha), null, 2)}\n`, "utf8");
  const executable = typeof flags.codex === "string" ? flags.codex : "codex";
  const prompt = `Review the sanitized read-only Bomti snapshot at exact SHA ${flags.sha}. Return only the requested JSON review receipt.`;
  const arguments_ = [
      "exec",
      "--ignore-user-config",
      "--ignore-rules",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox=read-only",
      "--model=gpt-5.6-sol",
      "--config=model_reasoning_effort=\"xhigh\"",
      `--output-schema=${schemaPath}`,
      `--output-last-message=${resultPath}`,
      `--cd=${snapshot}`,
      prompt
    ];
  const isNodeScript = /\.m?js$/i.test(executable);
  await execFileAsync(
    isNodeScript ? process.execPath : executable,
    isNodeScript ? [executable, ...arguments_] : arguments_,
    { cwd: process.cwd(), encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );
  return z
    .object({
      reviewedSha: z.literal(flags.sha),
      verdict: z.enum(["APPROVE", "REJECT"]),
      criticalFindings: z.number().int().nonnegative(),
      highFindings: z.number().int().nonnegative()
    })
    .strict()
    .parse(JSON.parse(await readFile(resultPath, "utf8")));
}

export async function runIndependentReview(flags) {
  if (typeof flags.input !== "string") {
    return {
      verdict: "blocked",
      code: "operator_not_supplied",
      scope: "independent review input dependency",
      assertions: ["security receipt input presence checked", "no review fabricated"]
    };
  }
  try {
    await access(path.resolve(flags.input));
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return {
      verdict: "blocked",
      code: "operator_not_supplied",
      scope: "independent review input dependency",
      assertions: ["security receipt input presence checked", "no review fabricated"]
    };
  }
  if (flags.enabled !== "true" && process.env.BOMTI_INDEPENDENT_REVIEW_AUTHORIZED !== "true") {
    return {
      verdict: "skipped",
      code: "operator_not_authorized",
      scope: "operator-authorized independent review dependency",
      assertions: ["review authorization checked", "no external model call made"]
    };
  }

  const securityReceipt = securityReceiptSchema.parse(JSON.parse(await readFile(path.resolve(flags.input), "utf8")));
  if (securityReceipt.sha !== flags.sha) throw new Error("REVIEW_INPUT_SHA_MISMATCH");
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" });
  if (stdout.trim() !== flags.sha) throw new Error("REVIEW_SOURCE_SHA_MISMATCH");

  const workspace = await mkdtemp(path.join(os.tmpdir(), "bomti-independent-review-"));
  try {
    const snapshot = await createSnapshot(flags.sha, workspace);
    let result;
    try {
      result = await executeReview(flags, snapshot, workspace);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (error.code === "ENOENT") {
        return {
          verdict: "blocked",
          code: "dependency_not_ready",
          scope: "installed Codex CLI dependency",
          assertions: ["Codex executable presence checked", "no review fabricated"]
        };
      }
      return {
        verdict: "fail",
        code: "independent_review_failed",
        scope: "sanitized read-only exact-SHA snapshot",
        assertions: ["review failure cannot approve", "review receipt remains bound to exact SHA"],
        exitCode: 1
      };
    }
    const approved = result.verdict === "APPROVE" && result.criticalFindings === 0 && result.highFindings === 0;
    return {
      verdict: approved ? "approve" : "fail",
      code: approved ? undefined : "independent_review_rejected",
      scope: "sanitized read-only exact-SHA snapshot",
      assertions: [
        "security payload SHA matched",
        "sanitized tracked snapshot created",
        "environment and key paths excluded from snapshot",
        "snapshot filesystem made read-only",
        "Codex user config ignored",
        "review receipt bound to exact SHA"
      ],
      exitCode: approved ? 0 : 1
    };
  } finally {
    await makeWritable(workspace);
    await rm(workspace, { recursive: true, force: true });
  }
}

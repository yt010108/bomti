import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseFlags, requireReceiptFlags, writeReceipt } from "./receipt.mjs";

const execFileAsync = promisify(execFile);

async function git(args, options = {}) {
  return execFileAsync("git", args, { encoding: "utf8", ...options });
}

async function statusAt(directory) {
  const { stdout } = await git(["status", "--porcelain=v1"], { cwd: directory });
  return stdout.trim();
}

function isWithin(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function main() {
  const divider = process.argv.indexOf("--");
  const ownArgs = divider === -1 ? process.argv.slice(2) : process.argv.slice(2, divider);
  const payload = divider === -1 ? [] : process.argv.slice(divider + 1);
  const flags = parseFlags(ownArgs);
  requireReceiptFlags(flags, ["out", "sha"]);
  if (payload.length === 0) throw new Error("PAYLOAD_REQUIRED");

  const sourceDirectory = process.cwd();
  const { stdout: sourceSha } = await git(["rev-parse", "HEAD"], { cwd: sourceDirectory });
  if (sourceSha.trim() !== flags.sha) throw new Error("SOURCE_SHA_MISMATCH");
  if (await statusAt(sourceDirectory)) throw new Error("SOURCE_WORKTREE_DIRTY");

  const { stdout: gitDirectory } = await git(["rev-parse", "--git-dir"], { cwd: sourceDirectory });
  const resolvedGitDirectory = path.resolve(sourceDirectory, gitDirectory.trim());
  const outputDirectory = path.resolve(flags.out);
  if (isWithin(outputDirectory, sourceDirectory) || isWithin(outputDirectory, resolvedGitDirectory)) {
    throw new Error("EVIDENCE_MUST_BE_OUTSIDE_CHECKOUT");
  }

  const payloadOutIndex = payload.lastIndexOf("--out");
  if (payloadOutIndex !== -1 && payload[payloadOutIndex + 1] && path.resolve(payload[payloadOutIndex + 1]) === outputDirectory) {
    throw new Error("WRAPPER_AND_PAYLOAD_OUTPUT_COLLIDE");
  }

  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bomti-lane-"));
  const detachedDirectory = path.join(workspaceRoot, "checkout");
  const port = 41000 + Math.floor(Math.random() * 1000);
  const namespace = `bomti_${flags.sha.slice(0, 8)}_${port}`;
  let payloadExitCode = 1;
  let failureCode = null;

  try {
    await git(["worktree", "add", "--detach", detachedDirectory, flags.sha], { cwd: sourceDirectory });
    if (await statusAt(detachedDirectory)) throw new Error("LANE_WORKTREE_DIRTY_BEFORE_PAYLOAD");
    await mkdir(outputDirectory, { recursive: true });

    try {
      await execFileAsync(payload[0], payload.slice(1), {
        cwd: detachedDirectory,
        env: {
          ...process.env,
          TEST_SHA: flags.sha,
          BOMTI_BASE_URL: `http://127.0.0.1:${port}`,
          BOMTI_TEST_SUPABASE_NAMESPACE: namespace
        },
        encoding: "utf8"
      });
      payloadExitCode = 0;
    } catch (error) {
      payloadExitCode = typeof error.code === "number" ? error.code : 1;
      failureCode = "PAYLOAD_FAILED";
    }

    if (await statusAt(detachedDirectory)) {
      failureCode = "LANE_WORKTREE_DIRTY_AFTER_PAYLOAD";
      payloadExitCode = 1;
    }
  } finally {
    await git(["worktree", "remove", "--force", detachedDirectory], { cwd: sourceDirectory }).catch(() => undefined);
    await rm(workspaceRoot, { recursive: true, force: true });
  }

  await writeReceipt(outputDirectory, {
    verdict: payloadExitCode === 0 ? "pass" : "fail",
    runner: "evidence-lane",
    sha: flags.sha,
    payload: payload[0],
    payloadExitCode,
    failureCode,
    testedUrl: `http://127.0.0.1:${port}`,
    fixtureNamespace: namespace,
    assertions: ["source clean before lane", "detached worktree used", "lane clean after payload", "cleanup attempted"]
  });

  if (payloadExitCode !== 0) process.exitCode = payloadExitCode;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

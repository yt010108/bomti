import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseFlags, requireReceiptFlags, writeReceipt } from "./receipt.mjs";

const execFileAsync = promisify(execFile);
const redactedValue = "[REDACTED]";
const safeEnvironmentNames = [
  "CI",
  "ComSpec",
  "FORCE_COLOR",
  "LANG",
  "LC_ALL",
  "NO_COLOR",
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "TERM",
  "TZ",
  "WINDIR"
];
const sensitiveArgumentPattern =
  /(?:^|[-_])(?:api[-_]?key|authorization|cookie|password|secret|service[-_]?role[-_]?key|token)(?:$|[-_])/i;

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

function exitCodeFrom(error) {
  return typeof error?.code === "number" ? error.code : 1;
}

function payloadOutput(payload, workingDirectory) {
  const flags = parseFlags(payload);
  return typeof flags.out === "string" ? path.resolve(workingDirectory, flags.out) : null;
}

function sanitizedCommand(payload) {
  const sanitized = [];
  let redactNext = false;

  for (const argument of payload) {
    if (redactNext) {
      sanitized.push(redactedValue);
      redactNext = false;
      continue;
    }

    const assignmentIndex = argument.indexOf("=");
    const name = assignmentIndex === -1 ? argument : argument.slice(0, assignmentIndex);
    if (sensitiveArgumentPattern.test(name)) {
      sanitized.push(assignmentIndex === -1 ? argument : `${name}=${redactedValue}`);
      redactNext = assignmentIndex === -1;
      continue;
    }

    sanitized.push(argument);
  }

  return sanitized;
}

function sanitizedEnvironment(workspaceRoot, overrides) {
  const environment = {};
  for (const name of safeEnvironmentNames) {
    if (typeof process.env[name] === "string") environment[name] = process.env[name];
  }

  return {
    ...environment,
    HOME: path.join(workspaceRoot, "home"),
    TMPDIR: path.join(workspaceRoot, "tmp"),
    npm_config_cache: path.join(workspaceRoot, "npm-cache"),
    ...overrides
  };
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

  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bomti-lane-"));
  const detachedDirectory = path.join(workspaceRoot, "checkout");
  const nestedOutputDirectory = payloadOutput(payload, detachedDirectory);
  if (nestedOutputDirectory === outputDirectory) {
    await rm(workspaceRoot, { recursive: true, force: true });
    throw new Error("WRAPPER_AND_PAYLOAD_OUTPUT_COLLIDE");
  }

  const port = 41000 + Math.floor(Math.random() * 1000);
  const namespace = `bomti_${flags.sha.slice(0, 8)}_${port}`;
  const environment = sanitizedEnvironment(workspaceRoot, {
    TEST_SHA: flags.sha,
    BOMTI_BASE_URL: `http://127.0.0.1:${port}`,
    BOMTI_TEST_SUPABASE_NAMESPACE: namespace
  });
  const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
  const dependencyInstallCommand = [npmExecutable, "ci", "--no-audit", "--no-fund"];
  let dependencyInstallExitCode = 1;
  let payloadExitCode = 1;
  let failureCode = null;

  try {
    await git(["worktree", "add", "--detach", detachedDirectory, flags.sha], { cwd: sourceDirectory });
    if (await statusAt(detachedDirectory)) throw new Error("LANE_WORKTREE_DIRTY_BEFORE_PAYLOAD");
    await Promise.all([
      mkdir(outputDirectory, { recursive: true }),
      mkdir(environment.HOME, { recursive: true }),
      mkdir(environment.TMPDIR, { recursive: true }),
      mkdir(environment.npm_config_cache, { recursive: true })
    ]);

    try {
      await execFileAsync(dependencyInstallCommand[0], dependencyInstallCommand.slice(1), {
        cwd: detachedDirectory,
        env: environment,
        encoding: "utf8"
      });
      dependencyInstallExitCode = 0;
    } catch (error) {
      dependencyInstallExitCode = exitCodeFrom(error);
      failureCode = "DEPENDENCY_INSTALL_FAILED";
    }

    if (dependencyInstallExitCode === 0) {
      try {
        await execFileAsync(payload[0], payload.slice(1), {
          cwd: detachedDirectory,
          env: environment,
          encoding: "utf8"
        });
        payloadExitCode = 0;
      } catch (error) {
        payloadExitCode = exitCodeFrom(error);
        failureCode = "PAYLOAD_FAILED";
      }
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
    dependencyInstallCommand,
    dependencyInstallExitCode,
    payloadCommand: sanitizedCommand(payload),
    payloadExitCode,
    failureCode,
    nestedReceipt: nestedOutputDirectory ? path.join(nestedOutputDirectory, "result.json") : null,
    testedUrl: `http://127.0.0.1:${port}`,
    fixtureNamespace: namespace,
    assertions: [
      "source clean before lane",
      "detached worktree used",
      "locked dependencies installed",
      "payload environment allowlisted",
      "lane clean after payload",
      "cleanup attempted"
    ]
  });

  if (payloadExitCode !== 0) process.exitCode = payloadExitCode;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

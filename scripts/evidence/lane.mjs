import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  canonicalPath,
  isWithin,
  nestedReceiptFailure,
  packageScriptNames,
  payloadMetadata,
  receiptLocation,
  sanitizedCommand,
  sanitizedEnvironment,
  trustedExecutable
} from "./lane-contract.mjs";
import { parseFlags, requireReceiptFlags, writeReceipt } from "./receipt.mjs";

const execFileAsync = promisify(execFile);
const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";

function gitEnvironment(executable) {
  const environment = {
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_NOSYSTEM: "1",
    LANG: "C",
    LC_ALL: "C",
    PATH: [path.dirname(executable), path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter)
  };
  for (const name of ["ComSpec", "PATHEXT", "SystemRoot", "WINDIR"]) {
    if (typeof process.env[name] === "string") environment[name] = process.env[name];
  }
  return environment;
}

async function git(executable, args, options = {}) {
  return execFileAsync(
    executable,
    ["-c", "core.fsmonitor=false", "-c", `core.hooksPath=${nullDevice}`, ...args],
    {
      encoding: "utf8",
      ...options,
      env: gitEnvironment(executable)
    }
  );
}

async function statusAt(gitExecutable, directory) {
  const { stdout } = await git(gitExecutable, ["status", "--porcelain=v1"], { cwd: directory });
  return stdout.trim();
}

function exitCodeFrom(error) {
  return typeof error?.code === "number" ? error.code : 1;
}

async function main() {
  const divider = process.argv.indexOf("--");
  const ownArgs = divider === -1 ? process.argv.slice(2) : process.argv.slice(2, divider);
  const payload = divider === -1 ? [] : process.argv.slice(divider + 1);
  const flags = parseFlags(ownArgs);
  requireReceiptFlags(flags, ["out", "sha"]);
  if (payload.length === 0) throw new Error("PAYLOAD_REQUIRED");

  const gitName = process.platform === "win32" ? "git.exe" : "git";
  const gitExecutable = await trustedExecutable(gitName, []);
  const sourceDirectory = await canonicalPath(process.cwd());
  const { stdout: sourceSha } = await git(gitExecutable, ["rev-parse", "HEAD"], { cwd: sourceDirectory });
  if (sourceSha.trim() !== flags.sha) throw new Error("SOURCE_SHA_MISMATCH");
  if (await statusAt(gitExecutable, sourceDirectory)) throw new Error("SOURCE_WORKTREE_DIRTY");

  const { stdout: gitDirectory } = await git(gitExecutable, ["rev-parse", "--git-dir"], { cwd: sourceDirectory });
  const resolvedGitDirectory = await canonicalPath(path.resolve(sourceDirectory, gitDirectory.trim()));
  const { stdout: gitCommonDirectory } = await git(gitExecutable, ["rev-parse", "--git-common-dir"], {
    cwd: sourceDirectory
  });
  const resolvedGitCommonDirectory = await canonicalPath(path.resolve(sourceDirectory, gitCommonDirectory.trim()));
  const outputDirectory = await canonicalPath(flags.out);
  if (
    isWithin(outputDirectory, sourceDirectory) ||
    isWithin(outputDirectory, resolvedGitDirectory) ||
    isWithin(outputDirectory, resolvedGitCommonDirectory)
  ) {
    throw new Error("EVIDENCE_MUST_BE_OUTSIDE_CHECKOUT");
  }

  const payloadDetails = payloadMetadata(payload);
  const profile = typeof flags.profile === "string" ? flags.profile : (payloadDetails.profile ?? "default");
  if (profile !== "default") {
    await git(gitExecutable, ["grep", "-F", "-e", `--profile=${profile}`, flags.sha, "--", "."], {
      cwd: sourceDirectory
    }).catch(() => {
        throw new Error("PROFILE_NOT_DOCUMENTED");
      });
  }
  const excludedDirectories = [sourceDirectory, resolvedGitDirectory, resolvedGitCommonDirectory];
  const verifiedGitExecutable = await trustedExecutable(gitName, excludedDirectories);
  if (verifiedGitExecutable !== gitExecutable) throw new Error("TRUSTED_GIT_CHANGED");
  const npmName = process.platform === "win32" ? "npm.cmd" : "npm";
  const npmExecutable = await trustedExecutable(npmName, excludedDirectories);
  let scriptNames = new Set();

  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bomti-lane-"));
  const detachedDirectory = path.join(workspaceRoot, "checkout");
  let nestedOutputDirectory;
  try {
    nestedOutputDirectory = payloadDetails.output
      ? await canonicalPath(path.resolve(detachedDirectory, payloadDetails.output))
      : null;
  } catch (error) {
    await rm(workspaceRoot, { recursive: true, force: true });
    throw error;
  }
  if (nestedOutputDirectory === outputDirectory) {
    await rm(workspaceRoot, { recursive: true, force: true });
    throw new Error("WRAPPER_AND_PAYLOAD_OUTPUT_COLLIDE");
  }
  if (nestedOutputDirectory && !isWithin(nestedOutputDirectory, outputDirectory)) {
    await rm(workspaceRoot, { recursive: true, force: true });
    throw new Error("PAYLOAD_OUTPUT_MUST_BE_NESTED");
  }

  const port = 41000 + Math.floor(Math.random() * 1000);
  const namespace = `bomti_${flags.sha.slice(0, 8)}_${port}`;
  let environment;
  try {
    environment = await sanitizedEnvironment(workspaceRoot, detachedDirectory, excludedDirectories, {
      TEST_SHA: flags.sha,
      BOMTI_BASE_URL: `http://127.0.0.1:${port}`,
      BOMTI_TEST_SUPABASE_NAMESPACE: namespace
    });
  } catch (error) {
    await rm(workspaceRoot, { recursive: true, force: true });
    throw error;
  }
  const dependencyInstallCommand = ["npm", "ci", "--no-audit", "--no-fund"];
  let dependencyInstallExitCode = 1;
  let payloadExitCode = null;
  let laneExitCode = 1;
  let failureCode = null;
  let verifiedNestedReceiptPath = null;

  try {
    await git(gitExecutable, ["worktree", "add", "--detach", detachedDirectory, flags.sha], {
      cwd: sourceDirectory
    });
    if (await statusAt(gitExecutable, detachedDirectory)) throw new Error("LANE_WORKTREE_DIRTY_BEFORE_PAYLOAD");
    scriptNames = await packageScriptNames(detachedDirectory);
    await Promise.all([
      mkdir(outputDirectory, { recursive: true }),
      mkdir(environment.HOME, { recursive: true }),
      mkdir(environment.TMPDIR, { recursive: true }),
      mkdir(environment.npm_config_cache, { recursive: true })
    ]);

    try {
      await execFileAsync(npmExecutable, dependencyInstallCommand.slice(1), {
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
        const payloadExecutable = path.basename(payload[0]).startsWith("npm") ? npmExecutable : payload[0];
        await execFileAsync(payloadExecutable, payload.slice(1), {
          cwd: detachedDirectory,
          env: environment,
          encoding: "utf8"
        });
        payloadExitCode = 0;
        laneExitCode = 0;
      } catch (error) {
        payloadExitCode = exitCodeFrom(error);
        laneExitCode = payloadExitCode;
        failureCode = "PAYLOAD_FAILED";
      }
    }

    if (await statusAt(gitExecutable, detachedDirectory)) {
      failureCode = "LANE_WORKTREE_DIRTY_AFTER_PAYLOAD";
      laneExitCode = 1;
    }

    if (nestedOutputDirectory) {
      const actualOutputDirectory = await canonicalPath(outputDirectory);
      if (actualOutputDirectory !== outputDirectory) throw new Error("WRAPPER_OUTPUT_CHANGED");
      const actualNestedReceiptPath = await canonicalPath(path.join(nestedOutputDirectory, "result.json"));
      if (
        !isWithin(actualNestedReceiptPath, actualOutputDirectory) ||
        actualNestedReceiptPath === path.join(actualOutputDirectory, "result.json")
      ) {
        failureCode = "NESTED_RECEIPT_OUTSIDE_WRAPPER";
        laneExitCode = 1;
        await rm(nestedOutputDirectory, { recursive: true, force: true });
      } else {
        const isDocumented = async (value, field = null) => {
          if (value.length === 0 || value.length > 500) return false;
          try {
            const { stdout } = await git(gitExecutable, ["grep", "-F", "-e", value, flags.sha, "--", "."], {
              cwd: sourceDirectory
            });
            if (!field) return true;
            const fieldPattern = new RegExp(`(?:^|[,{\\s])(?:${field}|["']${field}["'])\\s*:`);
            return stdout.split("\n").some((line) => fieldPattern.test(line));
          } catch {
            return false;
          }
        };
        const nestedFailureCode = await nestedReceiptFailure(actualNestedReceiptPath, flags.sha, profile, isDocumented);
        if (nestedFailureCode) {
          if (laneExitCode === 0 || nestedFailureCode !== "NESTED_RECEIPT_INVALID") {
            failureCode = nestedFailureCode;
            laneExitCode = 1;
          }
          await rm(nestedOutputDirectory, { recursive: true, force: true });
        } else {
          verifiedNestedReceiptPath = actualNestedReceiptPath;
        }
      }
    }
  } finally {
    let cleanupFailed = false;
    try {
      await git(gitExecutable, ["worktree", "remove", "--force", detachedDirectory], { cwd: sourceDirectory });
    } catch {
      cleanupFailed = true;
    }
    try {
      await rm(workspaceRoot, { recursive: true, force: true });
    } catch {
      cleanupFailed = true;
    }
    if (cleanupFailed) {
      failureCode = "LANE_CLEANUP_FAILED";
      laneExitCode = 1;
    }
  }

  await writeReceipt(outputDirectory, {
    verdict: laneExitCode === 0 ? "pass" : "fail",
    runner: "evidence-lane",
    profile,
    sha: flags.sha,
    dependencyInstallCommand,
    dependencyInstallExitCode,
    payloadCommand: sanitizedCommand(payload, scriptNames),
    payloadExitCode,
    failureCode,
    nestedReceipt: receiptLocation(verifiedNestedReceiptPath, outputDirectory),
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

  if (laneExitCode !== 0) process.exitCode = laneExitCode;
}

main().catch((error) => {
  const message = typeof error?.message === "string" ? error.message : "";
  const stableCode = message.match(/^([A-Z][A-Z0-9_]*)(?::|$)/)?.[1] ?? "EVIDENCE_LANE_FAILED";
  console.error(stableCode);
  process.exitCode = 1;
});

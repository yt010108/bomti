import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type EvidenceLaneFixture = {
  root: string;
  repository: string;
  sha: string;
};

async function run(command: string, args: string[], cwd: string): Promise<void> {
  await execFileAsync(command, args, { cwd, encoding: "utf8" });
}

export async function createEvidenceLaneFixture(laneScript: string): Promise<EvidenceLaneFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "bomti-lane-test-"));
  const primaryRepository = path.join(root, "repository");
  const repository = path.join(root, "checkout");
  const packageDirectory = path.join(primaryRepository, "fixture-bin");
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(path.join(primaryRepository, ".gitignore"), "node_modules\n", "utf8");
  await writeFile(path.join(primaryRepository, ".npmrc"), "loglevel=silent\n", "utf8");
  await writeFile(path.join(primaryRepository, "profiles.txt"), "--profile=integration\n", "utf8");
  await writeFile(
    path.join(primaryRepository, "package.json"),
    `${JSON.stringify({
      private: true,
      scripts: {
        "evidence:lane": `node ${JSON.stringify(laneScript)}`,
        "probe-dependency": "fixture-bin"
      },
      devDependencies: { "fixture-bin": "file:./fixture-bin" }
    })}\n`,
    "utf8"
  );
  await writeFile(
    path.join(packageDirectory, "package.json"),
    `${JSON.stringify({ name: "fixture-bin", version: "1.0.0", bin: { "fixture-bin": "bin.mjs" } })}\n`,
    "utf8"
  );
  const fixtureExecutable = path.join(packageDirectory, "bin.mjs");
  await writeFile(
    fixtureExecutable,
    `#!/usr/bin/env node
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
const equals = process.argv.find((argument) => argument.startsWith("--out="));
const separate = process.argv.indexOf("--out");
const output = equals?.slice(6) ?? (separate === -1 ? undefined : process.argv[separate + 1]);
const profileIndex = process.argv.indexOf("--profile");
const profile = profileIndex === -1 ? "default" : process.argv[profileIndex + 1];
if (output) {
  const externalIndex = process.argv.indexOf("--external-target");
  if (externalIndex !== -1) {
    const externalTarget = process.argv[externalIndex + 1];
    mkdirSync(externalTarget, { recursive: true });
    rmSync(output, { recursive: true, force: true });
    symlinkSync(externalTarget, output, "dir");
  }
  mkdirSync(output, { recursive: true });
  const receipt = {
    sha: process.argv.includes("--wrong-sha") ? "wrong-sha" : process.env.TEST_SHA,
    profile,
    redaction: process.argv.includes("--bad-redaction")
      ? "untrusted declaration"
      : "no secrets, raw inputs, identifiers, or tokens included"
  };
  if (process.argv.includes("--raw-field")) receipt.rawIdentifier = "benign-raw-identifier";
  writeFileSync(path.join(output, "result.json"), JSON.stringify(receipt) + "\\n", "utf8");
}
if (process.argv.includes("--exit-after-receipt")) process.exit(7);
`,
    "utf8"
  );
  await chmod(fixtureExecutable, 0o755);
  await run(
    "npm",
    ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"],
    primaryRepository
  );
  await run("git", ["init"], primaryRepository);
  await run("git", ["config", "user.name", "Evidence Lane Test"], primaryRepository);
  await run("git", ["config", "user.email", "evidence-lane@example.invalid"], primaryRepository);
  await run("git", ["add", "."], primaryRepository);
  await run("git", ["commit", "-m", "test fixture"], primaryRepository);
  await run("git", ["worktree", "add", "--detach", repository, "HEAD"], primaryRepository);
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" });
  return { root, repository, sha: stdout.trim() };
}

export async function removeEvidenceLaneFixture(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

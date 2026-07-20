import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const laneScript = path.join(process.cwd(), "scripts/evidence/lane.mjs");
const receiptSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  payloadCommand: z.array(z.string()),
  payloadExitCode: z.number().int(),
  nestedReceipt: z.string().nullable()
});

type LaneResult = {
  exitCode: number;
  stderr: string;
};

async function run(command: string, args: string[], cwd: string): Promise<void> {
  await execFileAsync(command, args, { cwd, encoding: "utf8" });
}

async function runLane(
  repository: string,
  sha: string,
  wrapperOutput: string,
  payload: string[],
  extraEnvironment: Readonly<Record<string, string>> = {}
): Promise<LaneResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [laneScript, "--out", wrapperOutput, "--sha", sha, "--", ...payload],
      {
        cwd: repository,
        encoding: "utf8",
        env: { ...process.env, ...extraEnvironment }
      },
      (error, _stdout, stderr) => {
        resolve({
          exitCode: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          stderr
        });
      }
    );
  });
}

describe("evidence lane", () => {
  let fixtureRoot = "";
  let repository = "";
  let sha = "";

  beforeAll(async () => {
    fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "bomti-lane-test-"));
    repository = path.join(fixtureRoot, "repository");
    const packageDirectory = path.join(repository, "fixture-bin");
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(path.join(repository, ".gitignore"), "node_modules\n", "utf8");
    await writeFile(
      path.join(repository, "package.json"),
      `${JSON.stringify({
        private: true,
        scripts: { "probe-dependency": "fixture-bin" },
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
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const equals = process.argv.find((argument) => argument.startsWith("--out="));
const separate = process.argv.indexOf("--out");
const output = equals?.slice(6) ?? (separate === -1 ? undefined : process.argv[separate + 1]);
if (output) {
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, "result.json"), "{}\\n", "utf8");
}
`,
      "utf8"
    );
    await chmod(fixtureExecutable, 0o755);
    await run("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], repository);
    await run("git", ["init"], repository);
    await run("git", ["config", "user.name", "Evidence Lane Test"], repository);
    await run("git", ["config", "user.email", "evidence-lane@example.invalid"], repository);
    await run("git", ["add", "."], repository);
    await run("git", ["commit", "-m", "test fixture"], repository);
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" });
    sha = stdout.trim();
  });

  afterAll(async () => {
    if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
  });

  it("installs locked dependencies and records the complete payload receipt", async () => {
    const wrapperOutput = path.join(fixtureRoot, "wrapper");
    const nestedOutput = path.join(fixtureRoot, "nested");
    const payload = [
      "npm",
      "run",
      "probe-dependency",
      "--",
      "--out",
      nestedOutput,
      "--token",
      "benign-sensitive-value"
    ];

    const result = await runLane(repository, sha, wrapperOutput, payload);
    const parsedReceipt: unknown = JSON.parse(await readFile(path.join(wrapperOutput, "result.json"), "utf8"));
    const receipt = receiptSchema.parse(parsedReceipt);

    expect(result.exitCode).toBe(0);
    expect(receipt).toEqual({
      verdict: "pass",
      payloadCommand: [...payload.slice(0, -1), "[REDACTED]"],
      payloadExitCode: 0,
      nestedReceipt: path.join(nestedOutput, "result.json")
    });
  });

  it("does not expose arbitrary caller environment variables to the payload", async () => {
    const wrapperOutput = path.join(fixtureRoot, "environment-wrapper");
    const probe = path.join(fixtureRoot, "environment-probe.txt");
    const payload = [
      process.execPath,
      "-e",
      `require("node:fs").writeFileSync(process.argv[1], String(process.env.ISSUE9_SECRET_SENTINEL === undefined))`,
      probe
    ];

    const result = await runLane(repository, sha, wrapperOutput, payload, { ISSUE9_SECRET_SENTINEL: "benign-marker" });

    expect(result.exitCode).toBe(0);
    expect(await readFile(probe, "utf8")).toBe("true");
  });

  it.each([
    ["separate", (output: string) => ["--out", output]],
    ["equals", (output: string) => [`--out=${output}`]]
  ])("rejects %s wrapper and payload receipt collisions", async (_name, collisionArguments) => {
    const wrapperOutput = path.join(fixtureRoot, `collision-${_name}`);
    const payload = [process.execPath, "-e", "process.exit(0)", "--", ...collisionArguments(wrapperOutput)];

    const result = await runLane(repository, sha, wrapperOutput, payload);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("WRAPPER_AND_PAYLOAD_OUTPUT_COLLIDE");
  });
});

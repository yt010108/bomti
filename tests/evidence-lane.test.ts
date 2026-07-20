import { execFile } from "node:child_process";
import { mkdir, readFile, symlink } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createEvidenceLaneFixture, removeEvidenceLaneFixture } from "./support/evidence-lane-fixture";

const laneScript = path.join(process.cwd(), "scripts/evidence/lane.mjs");
const receiptSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  profile: z.string(),
  payloadCommand: z.array(z.string()),
  payloadExitCode: z.number().int(),
  failureCode: z.string().nullable(),
  nestedReceipt: z.string().nullable()
});

type LaneResult = {
  exitCode: number;
  stderr: string;
};

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
    const fixture = await createEvidenceLaneFixture();
    fixtureRoot = fixture.root;
    repository = fixture.repository;
    sha = fixture.sha;
  });

  afterAll(async () => {
    if (fixtureRoot) await removeEvidenceLaneFixture(fixtureRoot);
  });

  it("installs locked dependencies and records the complete payload receipt", async () => {
    const wrapperOutput = path.join(fixtureRoot, "wrapper");
    const nestedOutput = path.join(wrapperOutput, "payload");
    const payload = [
      "npm",
      "run",
      "probe-dependency",
      "--",
      "--out",
      nestedOutput,
      "--profile",
      "integration",
      "--token",
      "benign-sensitive-value",
      "--header",
      "Authorization: Bearer benign-header-value",
      "--answer",
      "benign-raw-input",
      "--applicant-id",
      "benign-identifier"
    ];

    const result = await runLane(repository, sha, wrapperOutput, payload);
    const parsedReceipt: unknown = JSON.parse(await readFile(path.join(wrapperOutput, "result.json"), "utf8"));
    const receipt = receiptSchema.parse(parsedReceipt);

    expect(result.exitCode).toBe(0);
    expect(receipt).toEqual({
      verdict: "pass",
      profile: "integration",
      payloadCommand: [
        "npm",
        "run",
        "probe-dependency",
        "--",
        "--out",
        "[REDACTED]",
        "--profile",
        "[REDACTED]",
        "--token",
        "[REDACTED]",
        "--header",
        "[REDACTED]",
        "--answer",
        "[REDACTED]",
        "--applicant-id",
        "[REDACTED]"
      ],
      payloadExitCode: 0,
      failureCode: null,
      nestedReceipt: "payload/result.json"
    });
  });

  it("does not expose arbitrary caller environment variables to the payload", async () => {
    const wrapperOutput = path.join(fixtureRoot, "environment-wrapper");
    const probe = path.join(fixtureRoot, "environment-probe.txt");
    const sourceBin = path.join(repository, "node_modules", ".bin");
    const payload = [
      process.execPath,
      "-e",
      `require("node:fs").writeFileSync(process.argv[1], JSON.stringify({
        arbitraryAbsent: process.env.ISSUE9_SECRET_SENTINEL === undefined,
        provider: process.env.BOMTI_TEST_PROVIDER,
        auth: process.env.BOMTI_TEST_AUTH,
        fixtureProfile: process.env.BOMTI_TEST_FIXTURE_PROFILE,
        sourcePathAbsent: !process.env.PATH.includes(process.argv[2])
      }))`,
      probe,
      sourceBin
    ];

    const result = await runLane(repository, sha, wrapperOutput, payload, {
      ISSUE9_SECRET_SENTINEL: "benign-marker",
      PATH: `${sourceBin}${path.delimiter}${process.env.PATH}`
    });
    const probeResult: unknown = JSON.parse(await readFile(probe, "utf8"));

    expect(result.exitCode).toBe(0);
    expect(probeResult).toEqual({
      arbitraryAbsent: true,
      provider: "deterministic",
      auth: "fixtures",
      fixtureProfile: "baseline",
      sourcePathAbsent: true
    });
  });

  it("preserves command structure without recording script contents", async () => {
    const wrapperOutput = path.join(fixtureRoot, "command-wrapper");
    const payload = [
      process.execPath,
      "-e",
      `process.exit(process.env.ISSUE9_SECRET_SENTINEL === undefined ? 0 : 1)`,
      "benign-positional-input"
    ];

    const result = await runLane(repository, sha, wrapperOutput, payload);
    const parsedReceipt: unknown = JSON.parse(await readFile(path.join(wrapperOutput, "result.json"), "utf8"));
    const receipt = receiptSchema.parse(parsedReceipt);

    expect(result.exitCode).toBe(0);
    expect(receipt.payloadCommand).toEqual(["node", "-e", "[REDACTED]", "[REDACTED]"]);
  });

  it("records the payload process exit status on failure", async () => {
    const wrapperOutput = path.join(fixtureRoot, "failure-wrapper");
    const result = await runLane(repository, sha, wrapperOutput, [process.execPath, "-e", "process.exit(7)"]);
    const parsedReceipt: unknown = JSON.parse(await readFile(path.join(wrapperOutput, "result.json"), "utf8"));
    const receipt = receiptSchema.parse(parsedReceipt);

    expect(result.exitCode).toBe(7);
    expect(receipt.payloadExitCode).toBe(7);
    expect(receipt.failureCode).toBe("PAYLOAD_FAILED");
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

  it("rejects a collision reached through a symlink alias", async () => {
    const wrapperOutput = path.join(fixtureRoot, "symlink-wrapper");
    const alias = path.join(fixtureRoot, "symlink-alias");
    await mkdir(wrapperOutput);
    await symlink(wrapperOutput, alias);

    const result = await runLane(repository, sha, wrapperOutput, [
      process.execPath,
      "-e",
      "process.exit(0)",
      "--",
      "--out",
      alias
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("WRAPPER_AND_PAYLOAD_OUTPUT_COLLIDE");
  });

  it("fails when a nested receipt is not bound to the tested SHA", async () => {
    const wrapperOutput = path.join(fixtureRoot, "wrong-sha-wrapper");
    const nestedOutput = path.join(wrapperOutput, "payload");
    const result = await runLane(repository, sha, wrapperOutput, [
      "npm",
      "run",
      "probe-dependency",
      "--",
      "--out",
      nestedOutput,
      "--profile",
      "integration",
      "--wrong-sha"
    ]);
    const parsedReceipt: unknown = JSON.parse(await readFile(path.join(wrapperOutput, "result.json"), "utf8"));
    const receipt = receiptSchema.parse(parsedReceipt);

    expect(result.exitCode).not.toBe(0);
    expect(receipt.failureCode).toBe("NESTED_RECEIPT_SHA_MISMATCH");
  });
});

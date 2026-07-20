import { mkdir, readFile, symlink } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEvidenceLaneFixture, removeEvidenceLaneFixture } from "./support/evidence-lane-fixture";
import { readLaneReceipt, runLane } from "./support/run-evidence-lane";

const laneScript = path.join(process.cwd(), "scripts/evidence/lane.mjs");

describe("evidence lane", () => {
  let fixtureRoot = "";
  let repository = "";
  let sha = "";

  beforeAll(async () => {
    const fixture = await createEvidenceLaneFixture(laneScript);
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

    const result = await runLane(repository, sha, wrapperOutput, payload, { npm_config_loglevel: "notice" });
    const receipt = await readLaneReceipt(wrapperOutput);

    expect(result.exitCode).toBe(0);
    expect(receipt).toEqual({
      verdict: "pass",
      profile: "integration",
      payloadCommand: [
        "npm",
        "run",
        "probe-dependency",
        "--",
        "[REDACTED]",
        "[REDACTED]",
        "[REDACTED]",
        "[REDACTED]",
        "[REDACTED]",
        "[REDACTED]",
        "[REDACTED]",
        "[REDACTED]",
        "[REDACTED]",
        "[REDACTED]",
        "[REDACTED]",
        "[REDACTED]"
      ],
      payloadExitCode: 0,
      failureCode: null,
      nestedReceipt: "payload/result.json"
    });
    const combinedLog = `${result.stdout}\n${result.stderr}`;
    expect(combinedLog).not.toContain("benign-header-value");
    expect(combinedLog).not.toContain("benign-raw-input");
    expect(combinedLog).not.toContain("benign-identifier");
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
    const receipt = await readLaneReceipt(wrapperOutput);

    expect(result.exitCode).toBe(0);
    expect(receipt.payloadCommand).toEqual(["node", "[REDACTED]", "[REDACTED]", "[REDACTED]"]);
  });

  it("records the payload process exit status on failure", async () => {
    const wrapperOutput = path.join(fixtureRoot, "failure-wrapper");
    const result = await runLane(repository, sha, wrapperOutput, [process.execPath, "-e", "process.exit(7)"]);
    const receipt = await readLaneReceipt(wrapperOutput);

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
    const receipt = await readLaneReceipt(wrapperOutput);

    expect(result.exitCode).not.toBe(0);
    expect(receipt.failureCode).toBe("NESTED_RECEIPT_SHA_MISMATCH");
  });
});

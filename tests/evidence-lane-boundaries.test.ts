import { chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEvidenceLaneFixture, removeEvidenceLaneFixture } from "./support/evidence-lane-fixture";
import { readLaneReceipt, runLane } from "./support/run-evidence-lane";

const laneScript = path.join(process.cwd(), "scripts/evidence/lane.mjs");

describe("evidence lane trust boundaries", () => {
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

  it("redacts flag-shaped values and rejects undocumented profiles", async () => {
    const wrapperOutput = path.join(fixtureRoot, "flag-value-wrapper");
    const markers = ["--benign-raw-marker", "--benign-id-marker", "--benign-header-marker"];
    const result = await runLane(repository, sha, wrapperOutput, [
      process.execPath,
      "-e",
      "process.exit(0)",
      "--",
      "--answer",
      markers[0],
      "--applicant-id",
      markers[1],
      "--header",
      markers[2]
    ]);
    const serializedReceipt = await readFile(path.join(wrapperOutput, "result.json"), "utf8");
    expect(result.exitCode).toBe(0);
    for (const marker of markers) expect(serializedReceipt).not.toContain(marker);

    const profileResult = await runLane(repository, sha, path.join(fixtureRoot, "profile-wrapper"), [
      process.execPath,
      "-e",
      "process.exit(0)",
      "--",
      "--profile",
      "benign-undocumented-profile"
    ]);
    expect(profileResult.exitCode).not.toBe(0);
    expect(profileResult.stderr).toContain("PROFILE_NOT_DOCUMENTED");
  });

  it("does not execute a source-checkout binary through a caller PATH symlink", async () => {
    const sourceBin = path.join(repository, "node_modules", ".bin");
    const callerBin = path.join(fixtureRoot, "caller-bin");
    const sourceProbe = path.join(sourceBin, "source-probe");
    const probeOutput = path.join(fixtureRoot, "source-probe-output");
    await mkdir(sourceBin, { recursive: true });
    await mkdir(callerBin);
    await writeFile(sourceProbe, `#!/bin/sh\nprintf reached > "$1"\n`, "utf8");
    await chmod(sourceProbe, 0o755);
    await symlink(sourceProbe, path.join(callerBin, "source-probe"));

    const result = await runLane(
      repository,
      sha,
      path.join(fixtureRoot, "path-wrapper"),
      ["source-probe", probeOutput],
      { PATH: `${callerBin}${path.delimiter}${process.env.PATH}` }
    );

    expect(result.exitCode).not.toBe(0);
    await expect(readFile(probeOutput, "utf8")).rejects.toThrow();
  });

  it("runs internal Git and payload tools without a caller PATH", async () => {
    const callerRuntime = path.join(fixtureRoot, "caller-runtime");
    await mkdir(callerRuntime);
    await symlink("/bin/sh", path.join(callerRuntime, "sh"));
    const result = await runLane(
      repository,
      sha,
      path.join(fixtureRoot, "empty-path-wrapper"),
      [process.execPath, "-e", "process.exit(0)"],
      { PATH: callerRuntime }
    );

    expect(result.exitCode).toBe(0);
  });

  it("rejects wrapper output inside the linked worktree common Git directory", async () => {
    const commonGitOutput = path.join(fixtureRoot, "repository", ".git", "evidence-output");
    const result = await runLane(repository, sha, commonGitOutput, [process.execPath, "-e", "process.exit(0)"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("EVIDENCE_MUST_BE_OUTSIDE_CHECKOUT");
  });

  it("requires nested receipts to remain inside the wrapper directory", async () => {
    const wrapperOutput = path.join(fixtureRoot, "external-wrapper");
    const siblingOutput = path.join(fixtureRoot, "external-payload");
    const result = await runLane(repository, sha, wrapperOutput, [
      "npm",
      "run",
      "probe-dependency",
      "--",
      "--out",
      siblingOutput,
      "--profile",
      "integration"
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("PAYLOAD_OUTPUT_MUST_BE_NESTED");
  });

  it("rechecks a nested receipt path after the payload creates a symlink", async () => {
    for (const targetKind of ["external", "wrapper"] as const) {
      const wrapperOutput = path.join(fixtureRoot, `runtime-alias-${targetKind}-wrapper`);
      const nestedOutput = path.join(wrapperOutput, "payload");
      const aliasTarget = targetKind === "wrapper" ? wrapperOutput : path.join(fixtureRoot, "runtime-alias-external");
      const result = await runLane(repository, sha, wrapperOutput, [
        "npm",
        "run",
        "probe-dependency",
        "--",
        "--out",
        nestedOutput,
        "--profile",
        "integration",
        "--external-target",
        aliasTarget
      ]);
      const receipt = await readLaneReceipt(wrapperOutput);

      expect(result.exitCode).not.toBe(0);
      expect(receipt.failureCode).toBe("NESTED_RECEIPT_OUTSIDE_WRAPPER");
      expect(receipt.nestedReceipt).toBeNull();
    }
  });

  it("does not publish invalid nested receipts created by a failing payload", async () => {
    const wrapperOutput = path.join(fixtureRoot, "failing-nested-wrapper");
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
      "--wrong-sha",
      "--exit-after-receipt"
    ]);
    const receipt = await readLaneReceipt(wrapperOutput);

    expect(result.exitCode).not.toBe(0);
    expect(receipt.payloadExitCode).toBe(7);
    expect(receipt.failureCode).toBe("NESTED_RECEIPT_SHA_MISMATCH");
    expect(receipt.nestedReceipt).toBeNull();
  });

  it("rejects nested receipts with incomplete, unknown, undocumented, or invalid metadata", async () => {
    for (const invalidFlag of ["--minimal-receipt", "--raw-field", "--raw-code", "--bad-redaction"]) {
      const wrapperOutput = path.join(fixtureRoot, invalidFlag.slice(2));
      const result = await runLane(repository, sha, wrapperOutput, [
        "npm",
        "run",
        "probe-dependency",
        "--",
        "--out",
        path.join(wrapperOutput, "payload"),
        "--profile",
        "integration",
        invalidFlag
      ]);
      const receipt = await readLaneReceipt(wrapperOutput);

      expect(result.exitCode).not.toBe(0);
      expect(receipt.failureCode).toMatch(/^NESTED_RECEIPT_/);
      expect(receipt.nestedReceipt).toBeNull();
    }
  });
});

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const execFileAsync = promisify(execFile);
const currentProfiles = new Set(["contract-korean", "malformed-score-script-segment"]);
const futureProfiles = new Set(["no-escalation-and-sol", "resume-after-terra-sol-capped"]);

async function runJudgeContracts(profile) {
  await execFileAsync(
    process.execPath,
    ["./node_modules/vitest/vitest.mjs", "run", "tests/judge-contract.test.ts", "tests/judge-runner-profile.test.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, BOMTI_JUDGE_PROFILE: profile }
    }
  );
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);
  if (futureProfiles.has(flags.profile)) {
    await writeReceipt(flags.out, {
      verdict: "blocked",
      runner: "judge",
      profile: flags.profile,
      sha: flags.sha,
      code: "dependency_not_ready",
      scope: "future product dependency",
      assertions: ["future judge dependency checked", "no unavailable behavior reported as pass"]
    });
    return;
  }
  if (!currentProfiles.has(flags.profile)) throw new Error(`UNKNOWN_JUDGE_PROFILE:${flags.profile}`);
  await runJudgeContracts(flags.profile);

  if (flags.profile === "malformed-score-script-segment") {
    await writeReceipt(flags.out, {
      verdict: "fail",
      runner: "judge",
      profile: flags.profile,
      sha: flags.sha,
      code: "PROVIDER_OUTPUT_INVALID",
      assertions: [
        "named malformed fixture executed",
        "score range rejected",
        "unsafe provider text rejected",
        "unknown segment rejected"
      ]
    });
    throw new Error("PROVIDER_OUTPUT_INVALID");
  }

  await writeReceipt(flags.out, {
    verdict: "pass",
    runner: "judge",
    profile: flags.profile,
    sha: flags.sha,
    contractVersion: "bomti_index_v1",
    dimensions: 5,
    guestEvidenceLimit: 3,
    assertions: [
      "named contract fixture executed",
      "Korean contract fixture passed",
      "segment IDs validated",
      "guest projection bounded"
    ]
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

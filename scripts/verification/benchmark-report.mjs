import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const execFileAsync = promisify(execFile);
const implementedProfiles = new Set(["metric-formulas-missing-ties"]);
const futureProfiles = new Set(["majority-tie-abstain-missing"]);

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);
  if (futureProfiles.has(flags.profile)) {
    await writeReceipt(flags.out, {
      verdict: "blocked",
      runner: "benchmark-report",
      profile: flags.profile,
      sha: flags.sha,
      code: "dependency_not_ready",
      scope: "future benchmark corpus dependency",
      assertions: ["future benchmark dependency checked", "no unavailable behavior reported as pass"]
    });
    return;
  }
  if (!implementedProfiles.has(flags.profile)) throw new Error(`UNKNOWN_BENCHMARK_REPORT_PROFILE:${flags.profile}`);
  await execFileAsync(process.execPath, ["./node_modules/vitest/vitest.mjs", "run", "tests/judge-calibration.test.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, BOMTI_BENCHMARK_PROFILE: flags.profile }
  });
  await writeReceipt(flags.out, {
    verdict: "pass",
    runner: "benchmark-report",
    profile: flags.profile,
    sha: flags.sha,
    contractVersion: "bomti_calibration_v1",
    assertions: [
      "pairwise agreement numerator denominator and missing values calculated",
      "evaluator disagreement excludes abstain-only records",
      "descriptor escalation failure and usefulness metrics retain explicit denominators"
    ]
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

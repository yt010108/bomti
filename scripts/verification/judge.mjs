import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const execFileAsync = promisify(execFile);

async function runJudgeContracts() {
  await execFileAsync(process.execPath, ["./node_modules/vitest/vitest.mjs", "run", "tests/judge-contract.test.ts"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);
  await runJudgeContracts();

  if (flags.profile === "malformed-score-script-segment") {
    await writeReceipt(flags.out, {
      verdict: "fail",
      runner: "judge",
      profile: flags.profile,
      sha: flags.sha,
      code: "PROVIDER_OUTPUT_INVALID",
      assertions: ["score range rejected", "unsafe extra field rejected", "unknown segment rejected"]
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
    assertions: ["Korean contract fixture passed", "segment IDs validated", "guest projection bounded"]
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";
import { runFinalQa } from "./final-qa.mjs";
import { runIndependentReview } from "./independent-review.mjs";
import { classifyRunnerProfile, receiptForClassification } from "./runner-profiles.mjs";

async function main() {
  const [runner, ...argv] = process.argv.slice(2);
  if (!runner) throw new Error("RUNNER_REQUIRED");

  const flags = parseFlags(argv);
  requireReceiptFlags(flags);
  let outcome;
  if (runner === "final-qa" && flags.profile === "final-product") {
    outcome = await runFinalQa(flags);
  } else if (runner === "independent-review" && flags.profile === "readonly-final") {
    outcome = await runIndependentReview(flags);
  } else {
    const classification = classifyRunnerProfile(runner, flags.profile);
    outcome = receiptForClassification(classification);
  }
  const { exitCode = 0, ...receipt } = outcome;
  await writeReceipt(flags.out, {
    ...receipt,
    runner,
    profile: flags.profile,
    sha: flags.sha
  });
  if (exitCode !== 0) process.exitCode = exitCode;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

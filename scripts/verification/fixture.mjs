import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

async function main() {
  const [runner, ...argv] = process.argv.slice(2);
  if (!runner) throw new Error("RUNNER_REQUIRED");

  const flags = parseFlags(argv);
  requireReceiptFlags(flags);
  await writeReceipt(flags.out, {
    verdict: "pass",
    runner,
    profile: flags.profile,
    sha: flags.sha,
    assertions: ["runner accepts profile/out/sha", "machine-readable receipt emitted"],
    scope: "toolchain-fixture-contract"
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

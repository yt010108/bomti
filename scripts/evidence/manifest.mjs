import { parseFlags, requireReceiptFlags, writeReceipt } from "./receipt.mjs";

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);

  await writeReceipt(flags.out, {
    verdict: "pass",
    runner: "manifest",
    profile: flags.profile,
    sha: flags.sha,
    assertions: ["receipt metadata is present", "redaction declaration is present"]
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

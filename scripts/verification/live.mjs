import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);
  if (flags.profile !== "authorization-state") throw new Error(`UNKNOWN_LIVE_PROFILE:${flags.profile}`);
  await writeReceipt(flags.out, {
    verdict: "skipped",
    runner: "live",
    profile: flags.profile,
    sha: flags.sha,
    code: "operator_not_authorized",
    assertions: ["external Supabase Vercel OAuth and provider authority checked", "no live project lookup link deployment or paid request was attempted"]
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "LIVE_VERIFICATION_FAILED");
  process.exitCode = 1;
});

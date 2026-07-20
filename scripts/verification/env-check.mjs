import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);

  const environment = { ...process.env };
  if (flags.profile === "missing-supabase-url") delete environment.SUPABASE_URL;

  const missing = required.find((name) => !environment[name]?.trim());
  if (missing) {
    const code = `ENV_MISSING:${missing}`;
    await writeReceipt(flags.out, {
      verdict: "fail",
      runner: "env-check",
      profile: flags.profile,
      sha: flags.sha,
      code,
      assertions: ["missing values are not printed"]
    });
    throw new Error(code);
  }

  await writeReceipt(flags.out, {
    verdict: "pass",
    runner: "env-check",
    profile: flags.profile,
    sha: flags.sha,
    assertions: ["required names are present", "values are never printed"]
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

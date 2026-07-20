import { readFile } from "node:fs/promises";
import { parseFlags, requireReceiptFlags, writeReceipt } from "./receipt.mjs";

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);
  if (typeof flags.input !== "string") throw new Error("ARGUMENT_REQUIRED:input");

  const receipt = JSON.parse(await readFile(flags.input, "utf8"));
  if (receipt.sha !== flags.sha) throw new Error("SHA_MISMATCH");
  if (typeof receipt.redaction !== "string") throw new Error("REDACTION_DECLARATION_MISSING");

  await writeReceipt(flags.out, {
    verdict: "pass",
    runner: "bind",
    profile: flags.profile,
    sha: flags.sha,
    boundReceipt: flags.input,
    assertions: ["receipt SHA matches", "receipt includes redaction declaration"]
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

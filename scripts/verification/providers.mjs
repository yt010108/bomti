import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const execFileAsync = promisify(execFile);
const profiles = new Set(["deepseek-luna-terra-sol-valid", "opencode-429-sol-missing"]);

async function runProviderTests(flags) {
  await execFileAsync(process.execPath, ["./node_modules/vitest/vitest.mjs", "run", "tests/provider-adapters.test.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      BOMTI_PROVIDER_PROFILE: flags.profile,
      BOMTI_PROVIDER_CAPTURE_OUT: path.resolve(flags.out)
    }
  });
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);
  if (!profiles.has(flags.profile)) throw new Error(`UNKNOWN_PROVIDER_PROFILE:${flags.profile}`);
  await runProviderTests(flags);
  const snapshot = JSON.parse(await readFile(path.join(path.resolve(flags.out), "provider-snapshot.json"), "utf8"));
  const serialized = JSON.stringify(snapshot);
  if (/Bearer\s|test-opencode-secret|test-openai-secret/i.test(serialized)) throw new Error("PROVIDER_SECRET_LEAKED");
  await writeReceipt(flags.out, {
    verdict: "pass",
    runner: "providers",
    profile: flags.profile,
    sha: flags.sha,
    contractVersion: "bomti_index_v1",
    assertions: flags.profile === "deepseek-luna-terra-sol-valid"
      ? [
          "all four configured model IDs dispatched without substitution",
          "guest and paid candidates normalized",
          "token usage and integer cost metadata recorded",
          "role token timeout and reasoning ceilings enforced",
          "authorization material redacted"
        ]
      : [
          "OpenCode 429 mapped to GUEST_PROVIDER_UNAVAILABLE",
          "missing Sol disabled full paid evaluation",
          "zero substitute calls",
          "not-accepted retry and ambiguous no-retry behavior deterministic",
          "authorization material redacted"
        ],
    artifact: "provider-snapshot.json"
  });
}

main().catch(async (error) => {
  const flags = parseFlags(process.argv.slice(2));
  if (typeof flags.out === "string") {
    await writeReceipt(flags.out, {
      verdict: "fail",
      code: error.message,
      runner: "providers",
      profile: flags.profile,
      sha: flags.sha,
      assertions: ["provider runner failed closed"]
    });
  }
  console.error(error.message);
  process.exitCode = 1;
});

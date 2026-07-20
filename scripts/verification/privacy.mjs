import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const execFileAsync = promisify(execFile);
const profiles = new Set(["korean-pii-clean-context", "kisa-sbom-date-phone-email"]);

async function runPrivacyTests(flags) {
  await execFileAsync(
    process.execPath,
    ["./node_modules/vitest/vitest.mjs", "run", "tests/privacy-pipeline.test.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        BOMTI_PRIVACY_PROFILE: flags.profile,
        BOMTI_PRIVACY_CAPTURE_OUT: path.resolve(flags.out)
      }
    }
  );
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);
  if (!profiles.has(flags.profile)) throw new Error(`UNKNOWN_PRIVACY_PROFILE:${flags.profile}`);
  await runPrivacyTests(flags);

  const snapshotPath = path.join(path.resolve(flags.out), "privacy-snapshot.json");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const serialized = JSON.stringify(snapshot);
  const forbiddenPatterns = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
    /(?:010|02)[- .]?\d{3,4}[- .]?\d{4}/u,
    /김민수|박서연/u
  ];
  if (forbiddenPatterns.some((pattern) => pattern.test(serialized))) throw new Error("FIXTURE_SECRET_LEAKED");
  if (flags.profile === "kisa-sbom-date-phone-email" && snapshot.riskState !== "excluded_distinctive_context") {
    throw new Error("BENCHMARK_RISK_STATE_MISMATCH");
  }

  await writeReceipt(flags.out, {
    verdict: "pass",
    runner: "privacy",
    profile: flags.profile,
    sha: flags.sha,
    privacyVersion: "bomti_privacy_v1",
    riskState: snapshot.riskState,
    assertions: [
      "named privacy fixture executed",
      "typed stable placeholders emitted",
      "provider history response benchmark and log boundaries scanned",
      "raw input cannot serialize through boundary adapters",
      "guest benchmark persistence denied",
      "uncertainty excluded",
      "fixture secret scanner found zero originals"
    ],
    artifact: "privacy-snapshot.json"
  });
}

main().catch(async (error) => {
  const flags = parseFlags(process.argv.slice(2));
  if (typeof flags.out === "string") {
    await writeReceipt(flags.out, {
      verdict: "fail",
      code: error.message,
      runner: "privacy",
      profile: flags.profile,
      sha: flags.sha,
      assertions: ["privacy runner failed closed"]
    });
  }
  console.error(error.message);
  process.exitCode = 1;
});

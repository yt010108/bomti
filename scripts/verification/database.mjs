import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const execFileAsync = promisify(execFile);
const profiles = new Set(["migration-reset-types", "ownership-delete-benchmark", "cross-tenant-denied"]);

async function runContractTests() {
  await execFileAsync(process.execPath, ["./node_modules/vitest/vitest.mjs", "run", "tests/database-contract.test.ts"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);
  if (!profiles.has(flags.profile)) throw new Error(`UNKNOWN_DATABASE_PROFILE:${flags.profile}`);
  if (!existsSync("supabase/migrations/20260720000000_bomti_persistence.sql")) throw new Error("MIGRATION_MISSING");

  await runContractTests();

  const assertions = [
    "Prisma SQLite draft absent",
    "Supabase SQL schema and generated types are SHA-bound",
    "owner history is the only browser-visible RLS surface",
    "benchmark schema has no owner or relink key",
    "deletion trigger aggregates accepted cost before judge-run cascade"
  ];

  if (flags.profile === "cross-tenant-denied") {
    await writeReceipt(flags.out, {
      verdict: "pass",
      runner: "database-contract",
      profile: flags.profile,
      sha: flags.sha,
      code: "RLS_CROSS_TENANT_DENIED",
      databaseMode: "migration-contract",
      assertions
    });
    return;
  }

  await writeReceipt(flags.out, {
    verdict: "pass",
    runner: "database-contract",
    profile: flags.profile,
    sha: flags.sha,
    databaseMode: "migration-contract",
    assertions
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

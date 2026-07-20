import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const execFileAsync = promisify(execFile);
const profiles = new Set(["migration-reset-types", "ownership-delete-benchmark", "cross-tenant-denied"]);
const supabaseArguments = ["node_modules/supabase/dist/supabase.js"];
const generatedTypesPath = "lib/database/generated.types.ts";

function command(commandArguments, options = {}) {
  return execFileAsync(process.execPath, commandArguments, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options
  });
}

function supabase(...arguments_) {
  return command([...supabaseArguments, ...arguments_]);
}

function normalizeTypes(value) {
  return value.replace(/\r\n/g, "\n").trimEnd();
}

function databaseUnavailable(error) {
  const message = String(error?.message ?? error);
  return /DATABASE_START_FAILED|DATABASE_SERVICES_NOT_READY|failed to inspect container health|error during connect|Docker Desktop|docker daemon|connection refused/i.test(message);
}

function safeFailureCode(error) {
  const message = String(error?.message ?? error);
  if (databaseUnavailable(error)) return "DATABASE_UNAVAILABLE";
  if (message.includes("GENERATED_TYPES_STALE")) return "GENERATED_TYPES_STALE";
  if (message.includes("RLS_NEGATIVE_CONTROL_DID_NOT_FAIL")) return "RLS_NEGATIVE_CONTROL_DID_NOT_FAIL";
  if (message.includes("RLS_NEGATIVE_CONTROL_UNEXPECTED_FAILURE")) return "RLS_NEGATIVE_CONTROL_UNEXPECTED_FAILURE";
  return "DATABASE_INTEGRATION_FAILED";
}

function assertionsForProfile(profile) {
  const assertions = [
    "supabase db reset applied the migration to an empty local PostgreSQL database",
    "committed generated types exactly match supabase gen types --local --schema public"
  ];

  if (profile === "ownership-delete-benchmark") {
    assertions.push(
      "an authenticated owner can read and delete only their evaluation",
      "account linkable rows are purged before the auth user is deleted",
      "an ownerless benchmark record survives account cleanup"
    );
  }

  if (profile === "cross-tenant-denied") {
    assertions.push(
      "authenticated user A cannot read or delete user B data through local GoTrue and PostgREST",
      "anonymous and browser roles are denied evaluations and server-only stores",
      "the cross-tenant test fails after the evaluation SELECT policy is deliberately weakened"
    );
  }

  return assertions;
}

async function localStatus() {
  const { stdout } = await supabase("status", "--output", "json");
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("DATABASE_STATUS_UNAVAILABLE");
  const status = JSON.parse(stdout.slice(start, end + 1));
  for (const required of ["API_URL", "REST_URL", "ANON_KEY", "SERVICE_ROLE_KEY"]) {
    if (typeof status[required] !== "string" || status[required].length === 0) {
      throw new Error("DATABASE_STATUS_UNAVAILABLE");
    }
  }
  return status;
}

async function resetAndVerifyTypes() {
  await supabase("db", "reset", "--local");
  // On Windows, `db reset` can recreate auth containers with new addresses
  // while Kong retains a stale upstream. Recreating this local test stack is
  // the only portable way to keep the GoTrue/PostgREST fixture boundary real.
  await supabase("stop", "--no-backup");
  await supabase("start");
  const [{ stdout: generatedTypes }, committedTypes] = await Promise.all([
    supabase("gen", "types", "typescript", "--local", "--schema", "public"),
    readFile(generatedTypesPath, "utf8")
  ]);

  if (normalizeTypes(generatedTypes) !== normalizeTypes(committedTypes)) {
    throw new Error("GENERATED_TYPES_STALE");
  }

  return localStatus();
}

async function waitForDatabaseServices(status) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const auth = await fetch(`${status.API_URL}/auth/v1/health`, {
        headers: { apikey: status.ANON_KEY }
      });
      const rest = await fetch(`${status.REST_URL}/evaluations?select=id&limit=1`, {
        headers: { apikey: status.ANON_KEY }
      });
      if (auth.ok && rest.status < 500) return;
    } catch {
      // The reset restarts these local containers; retry without exposing
      // local credentials or connection details.
    }
    await delay(500);
  }

  throw new Error("DATABASE_SERVICES_NOT_READY");
}

async function runLiveTests(profile, status) {
  await command(["node_modules/vitest/vitest.mjs", "run", "tests/database-contract.test.ts"], {
    env: {
      ...process.env,
      BOMTI_DATABASE_INTEGRATION: "1",
      BOMTI_DATABASE_PROFILE: profile,
      BOMTI_DATABASE_RESET_APPLIED: "1",
      BOMTI_DATABASE_TYPES_MATCHED: "1",
      BOMTI_DB_API_URL: status.API_URL,
      BOMTI_DB_REST_URL: status.REST_URL,
      BOMTI_DB_ANON_KEY: status.ANON_KEY,
      BOMTI_DB_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY
    }
  });
}

async function proveBrokenRlsFails() {
  const status = await resetAndVerifyTypes();
  await waitForDatabaseServices(status);
  await supabase(
    "db",
    "query",
    "--local",
    'alter policy "evaluation owner can list own history" on public.evaluations using (true);'
  );

  try {
    await runLiveTests("cross-tenant-denied", status);
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    if (/RLS tenant and browser isolation|expected/i.test(output)) return;
    throw new Error("RLS_NEGATIVE_CONTROL_UNEXPECTED_FAILURE");
  }

  throw new Error("RLS_NEGATIVE_CONTROL_DID_NOT_FAIL");
}

async function verifyProfile(profile) {
  await supabase("start");
  let status = await resetAndVerifyTypes();
  await waitForDatabaseServices(status);
  await runLiveTests(profile, status);

  if (profile === "cross-tenant-denied") {
    try {
      await proveBrokenRlsFails();
    } finally {
      status = await resetAndVerifyTypes();
      await waitForDatabaseServices(status);
    }
  }
}

async function writeFailureReceipt(flags, error) {
  const code = safeFailureCode(error);
  await writeReceipt(flags.out, {
    verdict: code === "DATABASE_UNAVAILABLE" ? "blocked" : "fail",
    runner: "live-supabase-rls",
    profile: flags.profile,
    sha: flags.sha,
    code,
    databaseMode: "local-supabase-postgres",
    assertions: ["database integration never reports PASS when local Supabase/Postgres is unavailable or invalid"]
  });
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);
  if (!profiles.has(flags.profile)) throw new Error(`UNKNOWN_DATABASE_PROFILE:${flags.profile}`);

  try {
    await verifyProfile(flags.profile);
  } catch (error) {
    await writeFailureReceipt(flags, error);
    throw error;
  }

  await writeReceipt(flags.out, {
    verdict: "pass",
    runner: "live-supabase-rls",
    profile: flags.profile,
    sha: flags.sha,
    code: flags.profile === "cross-tenant-denied" ? "RLS_CROSS_TENANT_DENIED_AND_NEGATIVE_CONTROL_FAILED" : "LIVE_DATABASE_VERIFIED",
    databaseMode: "local-supabase-postgres",
    assertions: assertionsForProfile(flags.profile)
  });
}

main().catch((error) => {
  console.error(safeFailureCode(error));
  process.exitCode = 1;
});

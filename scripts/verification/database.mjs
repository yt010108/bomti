import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const execFileAsync = promisify(execFile);
const profiles = new Set([
  "migration-reset-types",
  "ownership-delete-benchmark",
  "cross-tenant-denied",
  "deletion-cost-lifecycle",
  "account-three-kst-rollover",
  "twenty-concurrent-cookie-rotation",
  "refund-ambiguous-acceptance-month-boundary"
]);
const supabaseArguments = ["node_modules/supabase/dist/supabase.js"];
const generatedTypesPath = "lib/database/generated.types.ts";
const localCliEnvironment = {
  ...process.env,
  SUPABASE_DISABLE_TELEMETRY: "1",
  DO_NOT_TRACK: "1"
};
const failureReceipts = {
  DATABASE_UNAVAILABLE: { code: "DATABASE_UNAVAILABLE", verdict: "blocked" },
  GENERATED_TYPES_STALE: { code: "GENERATED_TYPES_STALE", verdict: "fail" },
  RLS_NEGATIVE_CONTROL_DID_NOT_FAIL: { code: "RLS_NEGATIVE_CONTROL_DID_NOT_FAIL", verdict: "fail" },
  RLS_NEGATIVE_CONTROL_UNEXPECTED_FAILURE: {
    code: "RLS_NEGATIVE_CONTROL_UNEXPECTED_FAILURE",
    verdict: "fail"
  },
  DATABASE_INTEGRATION_FAILED: { code: "DATABASE_INTEGRATION_FAILED", verdict: "fail" }
};

function command(commandArguments, options = {}) {
  return execFileAsync(process.execPath, commandArguments, {
    ...options,
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: { ...localCliEnvironment, ...options.env }
  });
}

function supabase(...arguments_) {
  return command([...supabaseArguments, ...arguments_]);
}

async function localPostgresContainer() {
  const { stdout } = await execFileAsync("docker", [
    "ps",
    "--filter",
    "name=supabase_db_bomti",
    "--format",
    "{{.Names}}"
  ], { encoding: "utf8", windowsHide: true });
  const container = stdout.trim().split(/\r?\n/u).find(Boolean);
  if (!container) throw new Error("DATABASE_START_FAILED");
  return container;
}

async function waitForLocalPostgres() {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const container = await localPostgresContainer();
      await execFileAsync("docker", ["exec", container, "pg_isready", "-U", "postgres", "-d", "postgres"], {
        encoding: "utf8",
        windowsHide: true
      });
      return;
    } catch {
      await delay(500);
    }
  }
  throw new Error("DATABASE_SERVICES_NOT_READY");
}

async function resetLocalDatabase() {
  await supabase("start");
  await waitForLocalPostgres();
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...supabaseArguments, "db", "reset", "--local"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: localCliEnvironment
    });
    let output = "";
    let settled = false;
    let finishScheduled = false;
    let migrationObserved = false;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdout?.destroy();
      child.stderr?.destroy();
      if (error) reject(error);
      else resolve();
    };
    const finishAfterRestart = () => {
      if (finishScheduled) return;
      finishScheduled = true;
      setTimeout(() => {
        child.unref();
        settle();
      }, 2_000);
    };
    const onOutput = (chunk) => {
      output += chunk.toString();
      if (output.includes("Restarting containers...")) finishAfterRestart();
      if (!migrationObserved && output.includes("Applying migration 20260721000000_usage_budget_state_machine.sql...")) {
        migrationObserved = true;
        const fallback = setTimeout(finishAfterRestart, 30_000);
        fallback.unref();
      }
    };
    const timeout = setTimeout(() => settle(new Error("DATABASE_RESET_TIMEOUT")), 60_000);
    child.stdout?.on("data", onOutput);
    child.stderr?.on("data", onOutput);
    child.once("error", (error) => settle(error));
    child.once("exit", (code) => {
      if (code === 0) settle();
      else settle(new Error(`DATABASE_RESET_EXIT_${String(code)}`));
    });
  });
  await waitForLocalPostgres();
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

  if (profile === "deletion-cost-lifecycle") {
    assertions.push(
      "PostgreSQL rejects invalid deletion initial states, skips, rewinds, and non-idempotent retries",
      "every deletion transition rolls back after injected failure and succeeds exactly once on retry",
      "account data removal settles the original cost identity and releases its reservation exactly once",
      "auth ciphertext and terminal account identifiers are removed before TTL cleanup deletes the job"
    );
  }

  if (profile === "account-three-kst-rollover") {
    assertions.push(
      "an authenticated campaign consumes exactly three allowances and rejects the fourth",
      "guest IP and cookie buckets roll only at KST midnight",
      "raw account IP and cookie values are never stored"
    );
  }

  if (profile === "twenty-concurrent-cookie-rotation") {
    assertions.push(
      "twenty simultaneous guest attempts sharing an IP reserve at most one provider call",
      "idempotency duplicates consume and call once without returning a verdict",
      "current and previous cookie HMAC aliases cannot bypass the daily limit"
    );
  }

  if (profile === "refund-ambiguous-acceptance-month-boundary") {
    assertions.push(
      "partial Luna Terra and Sol acceptance settles or releases each reservation exactly once",
      "ambiguous accepted cost survives reservation TTL and alerts after seven days",
      "late reconciliation releases the hold once while account allowance is refunded",
      "UTC month boundaries isolate budget ledgers"
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
  await resetLocalDatabase();
  // On Windows, `db reset` can recreate auth containers with new addresses
  // while Kong retains a stale upstream. Recreating this local test stack is
  // the only portable way to keep the GoTrue/PostgREST fixture boundary real.
  await supabase("stop", "--no-backup");
  await supabase("start");
  await waitForLocalPostgres();
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
  const failure = failureReceipts[code];
  await writeReceipt(flags.out, {
    verdict: failure.verdict,
    runner: flags.profile.includes("rollover") || flags.profile.includes("concurrent") || flags.profile.includes("refund-")
      ? "usage"
      : "live-supabase-rls",
    profile: flags.profile,
    sha: flags.sha,
    code: failure.code,
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
    runner: flags.profile.includes("rollover") || flags.profile.includes("concurrent") || flags.profile.includes("refund-")
      ? "usage"
      : "live-supabase-rls",
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

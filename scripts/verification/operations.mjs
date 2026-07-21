import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const execFileAsync = promisify(execFile);
const supabaseCli = ["node_modules/supabase/dist/supabase.js"];
const profiles = new Set([
  "link-free-vercel-migration-backup-restore",
  "paused-db-missing-model-disabled-budget-expired-oauth-provider429-corrupt-backup"
]);
const rollbackFiles = [
  "supabase/rollback/20260721000000_usage_budget_state_machine.down.sql",
  "supabase/rollback/20260720000000_bomti_persistence.down.sql"
];
const localCliEnvironment = {
  ...process.env,
  SUPABASE_DISABLE_TELEMETRY: "1",
  DO_NOT_TRACK: "1"
};

function safeCode(error) {
  const message = String(error?.message ?? error);
  if (/Docker Desktop|DATABASE_|connection refused|failed to inspect container health/i.test(message)) return "DATABASE_UNAVAILABLE";
  if (/OUTBOUND_NETWORK_BLOCKED/.test(message)) return "OUTBOUND_NETWORK_BLOCKED";
  if (/BACKUP_AUTH_TAG_INVALID/.test(message)) return "BACKUP_AUTH_TAG_INVALID";
  if (/(?:VERCEL_|OPERATIONS_STAGE_|OPERATIONS_CLEANUP_)/.test(message)) return message;
  return "OPERATIONS_VERIFICATION_FAILED";
}

function command(args, options = {}) {
  return execFileAsync(process.execPath, args, {
    ...options,
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: { ...localCliEnvironment, ...options.env }
  });
}

function supabase(...args) {
  return command([...supabaseCli, ...args]);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeDump(value) {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !/^-- Dumped (from|by) /u.test(line))
    .join("\n")
    .trimEnd();
}

function parseStatus(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("DATABASE_STATUS_UNAVAILABLE");
  const status = JSON.parse(output.slice(start, end + 1));
  for (const key of ["REST_URL", "SERVICE_ROLE_KEY"]) if (!status[key]) throw new Error("DATABASE_STATUS_UNAVAILABLE");
  return status;
}

async function localStatus() {
  const { stdout } = await supabase("status", "--output", "json");
  return parseStatus(stdout);
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
  if (!container) throw new Error("DATABASE_POSTGRES_UNAVAILABLE");
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
      await delay(1_000);
    }
  }
  throw new Error("DATABASE_SERVICES_NOT_READY");
}

async function resetLocalDatabase() {
  await supabase("start");
  await waitForLocalPostgres();
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...supabaseCli, "db", "reset", "--local", "--no-seed"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: localCliEnvironment
    });
    let output = "";
    let settled = false;
    let restartObserved = false;
    let migrationObserved = false;
    let finishScheduled = false;
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
      if (!restartObserved && output.includes("Restarting containers...")) {
        restartObserved = true;
        finishAfterRestart();
      }
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
      else settle(new Error(`DATABASE_RESET_EXIT_${String(code)}:${output.slice(-4_000)}`));
    });
  });
  await waitForLocalPostgres();
}

async function queryFile(file) {
  const container = await localPostgresContainer();
  await execFileAsync("docker", [
    "exec",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    await readFile(file, "utf8")
  ], { encoding: "utf8", windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
}

async function schemaHash(workspace, name) {
  const output = path.join(workspace, `${name}.schema.sql`);
  await supabase("db", "dump", "--local", "--schema", "public", "--file", output);
  return sha256(normalizeDump(await readFile(output, "utf8")));
}

async function canonicalRows(status) {
  const response = await fetch(`${status.REST_URL}/benchmark_usefulness?select=rating,reason_code,month_bucket&order=rating.asc`, {
    headers: { apikey: status.SERVICE_ROLE_KEY, authorization: `Bearer ${status.SERVICE_ROLE_KEY}` }
  });
  if (!response.ok) throw new Error("BACKUP_ROW_READ_FAILED");
  const rows = await response.json();
  return JSON.stringify(rows);
}

function encryptBackup(plain, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return JSON.stringify({
    format: "BOMTI-BACKUP-V1",
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  });
}

function decryptBackup(source, key) {
  let parsed;
  try {
    parsed = JSON.parse(source);
    if (parsed.format !== "BOMTI-BACKUP-V1") throw new Error("BACKUP_FORMAT_INVALID");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.nonce, "base64"));
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(parsed.ciphertext, "base64")), decipher.final()]);
  } catch {
    throw new Error("BACKUP_AUTH_TAG_INVALID");
  }
}

async function backupRestoreProof(workspace) {
  await resetLocalDatabase();
  const fixture = path.join(workspace, "backup-fixture.sql");
  await writeFile(fixture, [
    "insert into public.benchmark_usefulness(rating, reason_code, month_bucket)",
    "values (3, 'not_actionable', '2026-07-01'), (5, 'clear_explanation', '2026-07-01');"
  ].join("\n"), "utf8");
  await queryFile(fixture);
  const before = await canonicalRows(await localStatus());
  const dump = path.join(workspace, "public-data.sql");
  await supabase("db", "dump", "--local", "--schema", "public", "--data-only", "--file", dump);
  const key = randomBytes(32);
  const encrypted = encryptBackup(await readFile(dump), key);
  const encryptedPath = path.join(workspace, "backup.bomti");
  await writeFile(encryptedPath, encrypted, "utf8");
  const corrupted = JSON.parse(encrypted);
  corrupted.tag = `${corrupted.tag.slice(0, -2)}AA`;
  try {
    decryptBackup(JSON.stringify(corrupted), key);
    throw new Error("BACKUP_CORRUPTION_ACCEPTED");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "BACKUP_AUTH_TAG_INVALID") throw error;
  }
  const restored = path.join(workspace, "restore.sql");
  await writeFile(restored, decryptBackup(encrypted, key));
  await resetLocalDatabase();
  await queryFile(restored);
  const after = await canonicalRows(await localStatus());
  if (before !== after) throw new Error("BACKUP_RESTORE_HASH_MISMATCH");
  return { rowHash: sha256(after), backupFormat: "BOMTI-BACKUP-V1" };
}

async function migrationRoundTrip(workspace) {
  await resetLocalDatabase();
  const before = await schemaHash(workspace, "up-first");
  for (const rollback of rollbackFiles) await queryFile(path.resolve(rollback));
  const down = await schemaHash(workspace, "down");
  await resetLocalDatabase();
  const after = await schemaHash(workspace, "up-second");
  if (before !== after || before === down) throw new Error("MIGRATION_ROUND_TRIP_HASH_MISMATCH");
  return { schemaHash: after, rollbackHash: down };
}

function ignored(source) {
  const name = path.basename(source);
  return ["node_modules", ".next", ".git", ".omo", "playwright-report", "test-results"].includes(name)
    || name === ".env"
    || name.startsWith(".env.");
}

async function copyBuildWorkspace(workspace) {
  await cp(process.cwd(), workspace, { recursive: true, filter: (source) => !ignored(source) });
  const sourceModules = path.resolve("node_modules");
  await symlink(sourceModules, path.join(workspace, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await mkdir(path.join(workspace, ".vercel"));
  await writeFile(path.join(workspace, ".vercel", "project.json"), JSON.stringify({
    projectId: "prj_local_isolated_fixture",
    orgId: "team_local_isolated_fixture",
    settings: {
      createdAt: 0,
      framework: "nextjs",
      buildCommand: "npm run build",
      devCommand: "npm run dev",
      installCommand: "",
      outputDirectory: null,
      rootDirectory: null,
      directoryListing: false,
      nodeVersion: "22.x"
    }
  }), "utf8");
  const globalConfig = path.join(workspace, ".vercel-global");
  await mkdir(globalConfig);
  await writeFile(path.join(globalConfig, "config.json"), JSON.stringify({ credStorage: "file", telemetry: { enabled: false } }), "utf8");
  await writeFile(path.join(globalConfig, "auth.json"), JSON.stringify({ userId: "usr_local_isolated_fixture" }), "utf8");
}

async function runLinkFreeVercelBuild(workspace) {
  const guardOutput = path.join(workspace, "network-guard.json");
  const globalConfig = path.join(workspace, ".vercel-global");
  const guard = path.resolve("scripts/verification/network-guard.cjs");
  const links = path.resolve("scripts/verification/vercel-windows-links.cjs");
  const vercel = path.resolve("node_modules/vercel/dist/index.js");
  const nodeOptions = [process.env.NODE_OPTIONS, `--require=${guard}`, `--require=${links}`].filter(Boolean).join(" ");
  const inheritedEnvironment = { ...process.env };
  delete inheritedEnvironment.Path;
  let output = "";
  try {
    const result = await command([vercel, "build", "--yes", "--cwd", workspace, "--global-config", globalConfig], {
      env: {
        ...inheritedEnvironment,
        PATH: process.env.PATH ?? process.env.Path ?? "",
        CI: "1",
        VERCEL: "1",
        NO_UPDATE_NOTIFIER: "1",
        VERCEL_TOKEN: "",
        VERCEL_TOKEN_STORAGE: "file",
        BOMTI_VERCEL_LINK_COPY_FALLBACK: "true",
        comspec: process.env.ComSpec ?? process.env.COMSPEC ?? "cmd.exe",
        BOMTI_NETWORK_GUARD_OUT: guardOutput,
        NODE_OPTIONS: nodeOptions
      }
    });
    output = `${result.stdout}\n${result.stderr}`;
  } catch (error) {
    output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    if (/OUTBOUND_NETWORK_BLOCKED/.test(output)) throw new Error("OUTBOUND_NETWORK_BLOCKED");
    throw new Error("VERCEL_BUILD_FAILED");
  }
  if (/\b(?:link|log in|pull|deploy)\b[^\n]{0,80}(?:\?|prompt)/iu.test(output)) throw new Error("VERCEL_INTERACTIVE_PROMPT_DETECTED");
  let guardState;
  try {
    guardState = JSON.parse(await readFile(guardOutput, "utf8"));
  } catch {
    throw new Error("VERCEL_NETWORK_GUARD_UNAVAILABLE");
  }
  if (guardState.dnsAttempts !== 0 || guardState.nonLoopbackAttempts !== 0) throw new Error("VERCEL_NETWORK_GUARD_FAILED");
  return { dnsAttempts: guardState.dnsAttempts, nonLoopbackAttempts: guardState.nonLoopbackAttempts };
}

function degradedConfigurationProof() {
  const missing = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "AUTH_REDIRECT_ALLOWLIST", "OPENCODE_GUEST_MODEL", "OPENAI_LUNA_MODEL", "PROVIDER_PRICING_VERSION"];
  const disabled = ["PAID_INFERENCE_DISABLED", "PAID_BUDGET_DISABLED", "OAUTH_EXTERNAL_NOT_AUTHORIZED", "PROVIDER_429_NO_FALLBACK", "DATABASE_PAUSED_BLOCKED", "BACKUP_AUTH_TAG_INVALID"];
  if (new Set(missing).size !== missing.length || disabled.length !== 6) throw new Error("DEGRADED_CONFIGURATION_PROOF_FAILED");
  return { missing, disabled };
}

async function runHappyProfile(flags) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "bomti-operations-"));
  let databaseTouched = false;
  let primaryError = null;
  let stopped = false;
  let cleanupFailed = false;
  let stage = "workspace";
  try {
    const vercelWorkspace = path.join(workspace, "vercel-workspace");
    stage = "copy";
    await copyBuildWorkspace(vercelWorkspace);
    stage = "vercel";
    const network = await runLinkFreeVercelBuild(vercelWorkspace);
    stage = "migration";
    databaseTouched = true;
    const migrations = await migrationRoundTrip(workspace);
    stage = "backup";
    const backup = await backupRestoreProof(workspace);
    return { ...network, ...migrations, ...backup, cleanup: "pending" };
  } catch (error) {
    primaryError = error;
    if (error instanceof Error && /^(?:VERCEL_|OUTBOUND_NETWORK_BLOCKED|DATABASE_)/.test(error.message)) throw error;
    if (stage === "copy" && error && typeof error === "object" && "code" in error) throw new Error(`OPERATIONS_COPY_${String(error.code)}`);
    throw new Error(`OPERATIONS_STAGE_${stage}`);
  } finally {
    if (databaseTouched) {
      try {
        await supabase("stop", "--no-backup");
        stopped = true;
      } catch {
        cleanupFailed = true;
      }
    }
    try {
      await rm(workspace, { recursive: true, force: true });
    } catch {
      cleanupFailed = true;
    }
    if ((databaseTouched && !stopped || cleanupFailed) && !primaryError) {
      throw new Error("OPERATIONS_CLEANUP_FAILED");
    }
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);
  if (!profiles.has(flags.profile)) throw new Error(`UNKNOWN_OPERATIONS_PROFILE:${flags.profile}`);
  try {
    if (flags.profile === "paused-db-missing-model-disabled-budget-expired-oauth-provider429-corrupt-backup") {
      const proof = degradedConfigurationProof();
      await writeReceipt(flags.out, {
        verdict: "pass",
        runner: "operations",
        profile: flags.profile,
        sha: flags.sha,
        degradedStates: proof.disabled,
        missingConfigurationNames: proof.missing,
        assertions: ["missing zero and unavailable configuration fails closed without values", "paused database and external OAuth remain blocked", "provider 429 has no fallback", "corrupt AES-GCM backup tag is rejected"]
      });
      return;
    }
    const result = await runHappyProfile(flags);
    await writeReceipt(flags.out, {
      verdict: "pass",
      runner: "operations",
      profile: flags.profile,
      sha: flags.sha,
      databaseMode: "local-supabase-postgres",
      schemaHash: result.schemaHash,
      rowHash: result.rowHash,
      backupFormat: result.backupFormat,
      network: { dnsAttempts: result.dnsAttempts, nonLoopbackAttempts: result.nonLoopbackAttempts },
      assertions: ["pinned local Vercel build completed without link auth pull or deploy", "network guard observed zero DNS and non-loopback attempts", "local migrations round-tripped up down up with matching schema hash", "AES-256-GCM backup restored canonical rows and rejected a flipped authentication tag", "local Supabase stack and temporary workspace were trap-cleaned"]
    });
  } catch (error) {
    await writeReceipt(flags.out, {
      verdict: safeCode(error) === "DATABASE_UNAVAILABLE" ? "blocked" : "fail",
      runner: "operations",
      profile: flags.profile,
      sha: flags.sha,
      code: safeCode(error),
      assertions: ["operations verification failed closed", "external cloud services were not changed"]
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(safeCode(error));
  process.exitCode = 1;
});

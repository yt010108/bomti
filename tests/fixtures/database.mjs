import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const fixturePassword = "fixture-password-not-for-production";
const fixtureHmac = "f".repeat(64);
const fixtureRunId = "22222222-2222-4222-8222-222222222222";
const fixtureProvider = "fixture-provider";
const fixtureModel = "fixture-model";
const fixturePricingVersion = "fixture-pricing-v1";

function apiHeaders(key, token = key) {
  return {
    apikey: key,
    authorization: `Bearer ${token}`
  };
}

async function json(response) {
  const text = await response.text();
  return text.length === 0 ? null : JSON.parse(text);
}

export function databaseEnvironment() {
  const { BOMTI_DB_API_URL, BOMTI_DB_REST_URL, BOMTI_DB_ANON_KEY, BOMTI_DB_SERVICE_ROLE_KEY } = process.env;
  if (!BOMTI_DB_API_URL || !BOMTI_DB_REST_URL || !BOMTI_DB_ANON_KEY || !BOMTI_DB_SERVICE_ROLE_KEY) {
    throw new Error("DATABASE_TEST_ENVIRONMENT_MISSING");
  }

  return {
    apiUrl: BOMTI_DB_API_URL,
    restUrl: BOMTI_DB_REST_URL,
    anonKey: BOMTI_DB_ANON_KEY,
    serviceRoleKey: BOMTI_DB_SERVICE_ROLE_KEY
  };
}

export async function rest(environment, token, table, options = {}) {
  const { method = "GET", query = "", body } = options;
  const response = await fetch(`${environment.restUrl}/${table}${query}`, {
    method,
    headers: {
      ...apiHeaders(environment.anonKey, token),
      ...(body === undefined ? {} : { "content-type": "application/json", prefer: "return=representation" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  return { response, body: await json(response) };
}

export async function rpc(environment, name, body = {}) {
  const response = await fetch(`${environment.restUrl}/rpc/${name}`, {
    method: "POST",
    headers: {
      ...apiHeaders(environment.anonKey, environment.serviceRoleKey),
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return { response, body: await json(response) };
}

export async function databaseSql(statement) {
  const directory = await mkdtemp(join(tmpdir(), "bomti-db-query-"));
  const file = join(directory, "query.sql");
  try {
    await writeFile(file, statement, { encoding: "utf8", mode: 0o600 });
    return await execFileAsync(
      process.execPath,
      ["node_modules/supabase/dist/supabase.js", "db", "query", "--local", "--file", file],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024
      }
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function createUser(environment, email) {
  const created = await fetch(`${environment.apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      ...apiHeaders(environment.serviceRoleKey),
      "content-type": "application/json"
    },
    body: JSON.stringify({ email, password: fixturePassword, email_confirm: true })
  });
  const createdBody = await json(created);
  if (!created.ok || !createdBody?.id) throw new Error(`AUTH_FIXTURE_CREATE_FAILED:${created.status}`);

  const signedIn = await fetch(`${environment.apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: environment.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password: fixturePassword })
  });
  const signedInBody = await json(signedIn);
  if (!signedIn.ok || !signedInBody?.access_token) throw new Error(`AUTH_FIXTURE_SIGN_IN_FAILED:${signedIn.status}`);

  return { id: createdBody.id, email, accessToken: signedInBody.access_token };
}

export async function createDatabaseFixture(environment = databaseEnvironment()) {
  const userA = await createUser(environment, "fixture-user-a@bomti.test");
  const userB = await createUser(environment, "fixture-user-b@bomti.test");
  const service = environment.serviceRoleKey;
  const evaluations = await rest(environment, service, "evaluations", {
    method: "POST",
    body: [
      {
        owner_id: userA.id,
        campaign_id: "fixture-campaign-a",
        idempotency_hash: "a".repeat(64),
        status: "accepted",
        pseudonymized_segments: [{ kind: "fixture" }],
        anonymization_version: "fixture-v1"
      },
      {
        owner_id: userB.id,
        campaign_id: "fixture-campaign-b",
        idempotency_hash: "b".repeat(64),
        status: "accepted",
        pseudonymized_segments: [{ kind: "fixture" }],
        anonymization_version: "fixture-v1"
      }
    ]
  });
  if (!evaluations.response.ok || !Array.isArray(evaluations.body) || evaluations.body.length !== 2) {
    throw new Error(`EVALUATION_FIXTURE_CREATE_FAILED:${evaluations.response.status}`);
  }

  const [evaluationA, evaluationB] = evaluations.body;
  const consent = await rest(environment, service, "consent_records", {
    method: "POST",
    body: {
      owner_id: userA.id,
      evaluation_id: evaluationA.id,
      consent_version: "fixture-consent-v1",
      provider_id: "fixture-provider",
      purposes: ["evaluation"]
    }
  });
  if (!consent.response.ok) throw new Error(`CONSENT_FIXTURE_CREATE_FAILED:${consent.response.status}`);

  const usage = await rest(environment, service, "usage_counters", {
    method: "POST",
    body: {
      subject_kind: "account",
      subject_hmac: fixtureHmac,
      campaign_or_bucket: "fixture-campaign-a",
      state: "consumed",
      count: 1
    }
  });
  if (!usage.response.ok) throw new Error(`USAGE_FIXTURE_CREATE_FAILED:${usage.response.status}`);

  const benchmark = await rest(environment, service, "benchmark_records", {
    method: "POST",
    body: {
      group_id: "11111111-1111-4111-8111-111111111111",
      question_class: "motivation",
      target_role_class: "software_engineering",
      answer_segments: [{ kind: "fixture" }],
      verdict: { outcome: "fixture" },
      anonymization_version: "fixture-v1",
      provenance_class: "synthetic",
      review_status: "synthetic",
      month_bucket: "2026-07-01"
    }
  });
  if (!benchmark.response.ok || !Array.isArray(benchmark.body) || benchmark.body.length !== 1) {
    throw new Error(`BENCHMARK_FIXTURE_CREATE_FAILED:${benchmark.response.status}`);
  }

  return { environment, userA, userB, evaluationA, evaluationB, benchmark: benchmark.body[0], subjectHmac: fixtureHmac };
}

export async function createDeletionLifecycleFixture(environment = databaseEnvironment()) {
  const fixture = await createDatabaseFixture(environment);
  const utcMonth = new Date().toISOString().slice(0, 7) + "-01";
  const blockUntil = new Date(Date.now() + 2_000).toISOString();

  const run = await rest(environment, environment.serviceRoleKey, "judge_runs", {
    method: "POST",
    body: {
      id: fixtureRunId,
      evaluation_id: fixture.evaluationA.id,
      provider_role: "luna",
      provider_id: fixtureProvider,
      model_id: fixtureModel,
      request_id_hash: "r".repeat(64),
      input_tokens: 10,
      output_tokens: 20,
      accepted_cost_micros: 400,
      status: "completed"
    }
  });
  if (!run.response.ok) throw new Error(`JUDGE_RUN_FIXTURE_CREATE_FAILED:${run.response.status}`);

  const ledger = await rest(environment, environment.serviceRoleKey, "budget_ledger", {
    method: "POST",
    body: {
      provider_id: fixtureProvider,
      model_id: fixtureModel,
      utc_month: utcMonth,
      pricing_version: fixturePricingVersion,
      reserved_micros: 1_000,
      accepted_micros: 0
    }
  });
  if (!ledger.response.ok) throw new Error(`BUDGET_LEDGER_FIXTURE_CREATE_FAILED:${ledger.response.status}`);

  const reconciliation = await rest(environment, environment.serviceRoleKey, "provider_reconciliation", {
    method: "POST",
    body: {
      id: fixtureRunId,
      provider_id: fixtureProvider,
      model_id: fixtureModel,
      pricing_version: fixturePricingVersion,
      encrypted_client_correlation_id: "\\x010203",
      utc_month: utcMonth,
      reserved_micros: 1_000,
      state: "unresolved_reserved",
      accepted_cost_micros: 400
    }
  });
  if (!reconciliation.response.ok) {
    throw new Error(`RECONCILIATION_FIXTURE_CREATE_FAILED:${reconciliation.response.status}`);
  }

  const job = await rest(environment, environment.serviceRoleKey, "account_deletion_jobs", {
    method: "POST",
    body: {
      subject_hmac: fixture.subjectHmac,
      encrypted_auth_user_id: "\\x040506",
      state: "requested",
      block_until: blockUntil
    }
  });
  if (!job.response.ok || !Array.isArray(job.body) || job.body.length !== 1) {
    throw new Error(`DELETION_JOB_FIXTURE_CREATE_FAILED:${job.response.status}`);
  }

  return {
    ...fixture,
    deletionJob: job.body[0],
    runId: fixtureRunId,
    providerId: fixtureProvider,
    modelId: fixtureModel,
    pricingVersion: fixturePricingVersion,
    utcMonth,
    blockUntil
  };
}

export async function advanceDeletionJob(fixture, expectedState, ownerId = null) {
  return rpc(fixture.environment, "advance_account_deletion_job", {
    target_job_id: fixture.deletionJob.id,
    expected_state: expectedState,
    target_owner_id: ownerId
  });
}

export async function installDeletionFailureTrigger(jobId, state) {
  await databaseSql(`
    drop trigger if exists inject_account_deletion_transition_failure on public.account_deletion_jobs;
  `);
  await databaseSql(`
    create or replace function public.inject_account_deletion_transition_failure()
    returns trigger language plpgsql as $$
    begin
      if new.id = '${jobId}'::uuid and new.state = '${state}'::public.account_deletion_state then
        raise exception 'INJECTED_ACCOUNT_DELETION_FAILURE';
      end if;
      return new;
    end;
    $$;
  `);
  await databaseSql(`
    create trigger inject_account_deletion_transition_failure
    after update on public.account_deletion_jobs
    for each row execute function public.inject_account_deletion_transition_failure();
  `);
}

export async function removeDeletionFailureTrigger() {
  await databaseSql(`
    drop trigger if exists inject_account_deletion_transition_failure on public.account_deletion_jobs;
  `);
  await databaseSql(`drop function if exists public.inject_account_deletion_transition_failure();`);
}

export async function purgeAccountData(fixture) {
  const response = await fetch(`${fixture.environment.restUrl}/rpc/purge_account_linkable_data`, {
    method: "POST",
    headers: {
      ...apiHeaders(fixture.environment.anonKey, fixture.environment.serviceRoleKey),
      "content-type": "application/json"
    },
    body: JSON.stringify({ target_owner_id: fixture.userA.id, target_subject_hmac: fixture.subjectHmac })
  });
  if (!response.ok) throw new Error(`ACCOUNT_PURGE_FAILED:${response.status}`);
}

export async function deleteAuthUser(fixture) {
  const response = await fetch(`${fixture.environment.apiUrl}/auth/v1/admin/users/${fixture.userA.id}`, {
    method: "DELETE",
    headers: apiHeaders(fixture.environment.serviceRoleKey)
  });
  if (!response.ok) throw new Error(`AUTH_FIXTURE_DELETE_FAILED:${response.status}`);
}

export async function signInAfterDeletion(fixture) {
  const response = await fetch(`${fixture.environment.apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: fixture.environment.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: fixture.userA.email, password: fixturePassword })
  });
  return { response, body: await json(response) };
}

const fixturePassword = "fixture-password-not-for-production";
const fixtureHmac = "f".repeat(64);

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

import { describe, expect, it } from "vitest";
import {
  createDatabaseFixture,
  databaseEnvironment,
  deleteAuthUser,
  purgeAccountData,
  rest,
  signInAfterDeletion
} from "./fixtures/database";

const profile = process.env.BOMTI_DATABASE_PROFILE;
const liveDatabase = process.env.BOMTI_DATABASE_INTEGRATION === "1";

function profileSuite(profiles: string[], name: string, definition: () => void) {
  const suite = liveDatabase && profile !== undefined && profiles.includes(profile) ? describe : describe.skip;
  suite(name, definition);
}

profileSuite(["migration-reset-types"], "local Supabase migration and generated types", () => {
  it("runs against a freshly reset database whose generated types match the committed snapshot", () => {
    expect(process.env.BOMTI_DATABASE_RESET_APPLIED).toBe("1");
    expect(process.env.BOMTI_DATABASE_TYPES_MATCHED).toBe("1");
  });
});

profileSuite(["ownership-delete-benchmark"], "owner history and account cleanup", () => {
  it("allows an owner to read and delete only their evaluation, then removes their linkable data without deleting an ownerless benchmark", async () => {
    const fixture = await createDatabaseFixture(databaseEnvironment());

    const ownerHistory = await rest(fixture.environment, fixture.userA.accessToken, "evaluations", {
      query: "?select=id,owner_id&order=id"
    });
    expect(ownerHistory.response.status).toBe(200);
    expect(ownerHistory.body).toEqual([{ id: fixture.evaluationA.id, owner_id: fixture.userA.id }]);

    const ownDelete = await rest(fixture.environment, fixture.userA.accessToken, "evaluations", {
      method: "DELETE",
      query: `?id=eq.${fixture.evaluationA.id}`
    });
    expect(ownDelete.response.status).toBe(204);

    const deletedEvaluation = await rest(fixture.environment, fixture.environment.serviceRoleKey, "evaluations", {
      query: `?select=id&id=eq.${fixture.evaluationA.id}`
    });
    const deletedConsent = await rest(fixture.environment, fixture.environment.serviceRoleKey, "consent_records", {
      query: `?select=id&owner_id=eq.${fixture.userA.id}`
    });
    expect(deletedEvaluation.body).toEqual([]);
    expect(deletedConsent.body).toEqual([]);

    await purgeAccountData(fixture);
    await deleteAuthUser(fixture);

    const remainingEvaluations = await rest(fixture.environment, fixture.environment.serviceRoleKey, "evaluations", {
      query: `?select=id&owner_id=eq.${fixture.userA.id}`
    });
    const remainingConsent = await rest(fixture.environment, fixture.environment.serviceRoleKey, "consent_records", {
      query: `?select=id&owner_id=eq.${fixture.userA.id}`
    });
    const remainingUsage = await rest(fixture.environment, fixture.environment.serviceRoleKey, "usage_counters", {
      query: `?select=id&subject_kind=eq.account&subject_hmac=eq.${fixture.subjectHmac}`
    });
    const survivingBenchmark = await rest(fixture.environment, fixture.environment.serviceRoleKey, "benchmark_records", {
      query: `?select=record_id&record_id=eq.${fixture.benchmark.record_id}`
    });
    const deletedUserSignIn = await signInAfterDeletion(fixture);

    expect(remainingEvaluations.body).toEqual([]);
    expect(remainingConsent.body).toEqual([]);
    expect(remainingUsage.body).toEqual([]);
    expect(survivingBenchmark.body).toEqual([{ record_id: fixture.benchmark.record_id }]);
    expect(deletedUserSignIn.response.ok).toBe(false);
  });
});

profileSuite(["cross-tenant-denied"], "RLS tenant and browser isolation", () => {
  it("prevents user A and anonymous/browser roles from reading or deleting user B data or server-only stores", async () => {
    const fixture = await createDatabaseFixture(databaseEnvironment());

    const ownerHistory = await rest(fixture.environment, fixture.userA.accessToken, "evaluations", {
      query: "?select=id,owner_id&order=id"
    });
    expect(ownerHistory.response.status).toBe(200);
    expect(ownerHistory.body).toEqual([{ id: fixture.evaluationA.id, owner_id: fixture.userA.id }]);

    const crossTenantDelete = await rest(fixture.environment, fixture.userA.accessToken, "evaluations", {
      method: "DELETE",
      query: `?id=eq.${fixture.evaluationB.id}`
    });
    const userBStillExists = await rest(fixture.environment, fixture.environment.serviceRoleKey, "evaluations", {
      query: `?select=id,owner_id&id=eq.${fixture.evaluationB.id}`
    });
    expect(crossTenantDelete.response.status).toBe(204);
    expect(userBStillExists.body).toEqual([{ id: fixture.evaluationB.id, owner_id: fixture.userB.id }]);

    const anonymousHistory = await rest(fixture.environment, fixture.environment.anonKey, "evaluations", {
      query: "?select=id"
    });
    const anonymousCreate = await rest(fixture.environment, fixture.environment.anonKey, "evaluations", {
      method: "POST",
      body: {
        owner_id: fixture.userB.id,
        campaign_id: "anonymous-mutation-attempt",
        idempotency_hash: "c".repeat(64),
        status: "accepted",
        pseudonymized_segments: [{ kind: "fixture" }],
        anonymization_version: "fixture-v1"
      }
    });
    expect([401, 403]).toContain(anonymousHistory.response.status);
    expect([401, 403]).toContain(anonymousCreate.response.status);

    for (const table of ["budget_ledger", "provider_reconciliation", "account_deletion_jobs", "benchmark_records"]) {
      const anonymousAccess = await rest(fixture.environment, fixture.environment.anonKey, table, { query: "?select=*" });
      const authenticatedBrowserAccess = await rest(fixture.environment, fixture.userA.accessToken, table, { query: "?select=*" });
      expect([401, 403]).toContain(anonymousAccess.response.status);
      expect([401, 403]).toContain(authenticatedBrowserAccess.response.status);
    }
  });
});

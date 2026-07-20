import { describe, expect, it } from "vitest";
import {
  advanceDeletionJob,
  createDeletionLifecycleFixture,
  createDatabaseFixture,
  databaseSql,
  databaseEnvironment,
  deleteAuthUser,
  installDeletionFailureTrigger,
  purgeAccountData,
  removeDeletionFailureTrigger,
  rest,
  rpc,
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

profileSuite(["deletion-cost-lifecycle"], "account deletion and cost settlement lifecycle", () => {
  it("rejects illegal transitions and retries every failure-injected transition without restoring data or double settling cost", async () => {
    const fixture = await createDeletionLifecycleFixture(databaseEnvironment());
    const jobId = fixture.deletionJob.id;

    await expect(
      databaseSql(`
        insert into public.account_deletion_jobs (
          subject_hmac, encrypted_auth_user_id, state, block_until
        ) values (
          '${"i".repeat(64)}', decode('010203', 'hex'), 'sessions_revoked', now() + interval '1 hour'
        );
      `)
    ).rejects.toThrow();
    await expect(
      databaseSql(`update public.account_deletion_jobs set state = 'complete' where id = '${jobId}'::uuid;`)
    ).rejects.toThrow();

    const transitions = [
      { current: "requested", desired: "sessions_revoked", ownerId: null },
      { current: "sessions_revoked", desired: "app_data_deleted", ownerId: fixture.userA.id },
      { current: "app_data_deleted", desired: "auth_user_deleted", ownerId: fixture.userA.id },
      { current: "auth_user_deleted", desired: "complete", ownerId: null }
    ] as const;

    for (const transition of transitions) {
      if (transition.current === "app_data_deleted") await deleteAuthUser(fixture);

      await installDeletionFailureTrigger(jobId, transition.desired);
      const injectedFailure = await advanceDeletionJob(fixture, transition.current, transition.ownerId);
      expect(injectedFailure.response.status).toBe(400);
      await removeDeletionFailureTrigger();

      const rolledBack = await rest(fixture.environment, fixture.environment.serviceRoleKey, "account_deletion_jobs", {
        query: `?select=id,state,subject_hmac,encrypted_auth_user_id,attempts&id=eq.${jobId}`
      });
      expect(rolledBack.body).toHaveLength(1);
      expect(rolledBack.body[0].state).toBe(transition.current);

      if (transition.current === "sessions_revoked") {
        const evaluationBeforeRetry = await rest(
          fixture.environment,
          fixture.environment.serviceRoleKey,
          "evaluations",
          { query: `?select=id&id=eq.${fixture.evaluationA.id}` }
        );
        const ledgerBeforeRetry = await rest(
          fixture.environment,
          fixture.environment.serviceRoleKey,
          "budget_ledger",
          { query: `?select=reserved_micros,accepted_micros&pricing_version=eq.${fixture.pricingVersion}` }
        );
        expect(evaluationBeforeRetry.body).toEqual([{ id: fixture.evaluationA.id }]);
        expect(ledgerBeforeRetry.body).toEqual([{ reserved_micros: 1000, accepted_micros: 0 }]);
      }

      const advanced = await advanceDeletionJob(fixture, transition.current, transition.ownerId);
      expect(advanced.response.status).toBe(200);
      expect(advanced.body).toBe(transition.desired);

      const idempotentRetry = await advanceDeletionJob(fixture, transition.current, transition.ownerId);
      expect(idempotentRetry.response.status).toBe(200);
      expect(idempotentRetry.body).toBe(transition.desired);

      const advancedJob = await rest(fixture.environment, fixture.environment.serviceRoleKey, "account_deletion_jobs", {
        query: `?select=state,subject_hmac,encrypted_auth_user_id,attempts&id=eq.${jobId}`
      });
      expect(advancedJob.body).toHaveLength(1);
      if (transition.desired === "auth_user_deleted") {
        expect(advancedJob.body[0].encrypted_auth_user_id).toBeNull();
        expect(advancedJob.body[0].subject_hmac).toBe(fixture.subjectHmac);
      }
      if (transition.desired === "complete") {
        expect(advancedJob.body[0].encrypted_auth_user_id).toBeNull();
        expect(advancedJob.body[0].subject_hmac).toBeNull();
      }

      if (transition.desired === "sessions_revoked") {
        await expect(
          databaseSql(`update public.account_deletion_jobs set state = 'requested' where id = '${jobId}'::uuid;`)
        ).rejects.toThrow();
        await expect(
          databaseSql(`update public.account_deletion_jobs set state = 'auth_user_deleted' where id = '${jobId}'::uuid;`)
        ).rejects.toThrow();
        await expect(
          databaseSql(`
            update public.account_deletion_jobs
            set subject_hmac = '${"n".repeat(64)}'
            where id = '${jobId}'::uuid;
          `)
        ).rejects.toThrow();
      }
    }

    const remainingLinkableRows = await Promise.all([
      rest(fixture.environment, fixture.environment.serviceRoleKey, "evaluations", {
        query: `?select=id&owner_id=eq.${fixture.userA.id}`
      }),
      rest(fixture.environment, fixture.environment.serviceRoleKey, "consent_records", {
        query: `?select=id&owner_id=eq.${fixture.userA.id}`
      }),
      rest(fixture.environment, fixture.environment.serviceRoleKey, "usage_counters", {
        query: `?select=id&subject_kind=eq.account&subject_hmac=eq.${fixture.subjectHmac}`
      })
    ]);
    for (const result of remainingLinkableRows) expect(result.body).toEqual([]);

    const ledger = await rest(fixture.environment, fixture.environment.serviceRoleKey, "budget_ledger", {
      query: `?select=provider_id,model_id,utc_month,pricing_version,reserved_micros,accepted_micros&provider_id=eq.${fixture.providerId}`
    });
    expect(ledger.body).toEqual([
      {
        provider_id: fixture.providerId,
        model_id: fixture.modelId,
        utc_month: fixture.utcMonth,
        pricing_version: fixture.pricingVersion,
        reserved_micros: 0,
        accepted_micros: 400
      }
    ]);
    const syntheticPricing = await rest(fixture.environment, fixture.environment.serviceRoleKey, "budget_ledger", {
      query: "?select=pricing_version&pricing_version=eq.settled-on-delete"
    });
    const reconciliation = await rest(
      fixture.environment,
      fixture.environment.serviceRoleKey,
      "provider_reconciliation",
      { query: `?select=id&id=eq.${fixture.runId}` }
    );
    expect(syntheticPricing.body).toEqual([]);
    expect(reconciliation.body).toEqual([]);

    const terminalJob = await rest(fixture.environment, fixture.environment.serviceRoleKey, "account_deletion_jobs", {
      query: `?select=state,subject_hmac,encrypted_auth_user_id,attempts,block_until&id=eq.${jobId}`
    });
    expect(terminalJob.body).toHaveLength(1);
    expect(terminalJob.body[0]).toMatchObject({
      state: "complete",
      subject_hmac: null,
      encrypted_auth_user_id: null,
      attempts: 4
    });

    const waitForTtl = Math.max(0, Date.parse(fixture.blockUntil) - Date.now() + 100);
    await new Promise((resolve) => setTimeout(resolve, waitForTtl));
    const cleanup = await rpc(fixture.environment, "purge_expired_account_deletion_jobs");
    expect(cleanup.response.status).toBe(200);
    expect(cleanup.body).toBe(1);
    const removedJob = await rest(fixture.environment, fixture.environment.serviceRoleKey, "account_deletion_jobs", {
      query: `?select=id&id=eq.${jobId}`
    });
    expect(removedJob.body).toEqual([]);
  }, 60_000);
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

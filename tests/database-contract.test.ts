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
type RpcResult = Awaited<ReturnType<typeof rpc>>;

function reservationArguments(overrides: Record<string, unknown> = {}) {
  return {
    target_idempotency_hash: "i".repeat(64),
    target_request_fingerprint: "f".repeat(64),
    target_audience: "authenticated",
    target_account_hmac: "a".repeat(64),
    target_campaign_id: "campaign-usage-fixture",
    target_ip_current_hmac: null,
    target_ip_previous_hmac: null,
    target_cookie_current_hmac: null,
    target_cookie_previous_hmac: null,
    target_now: "2026-01-31T14:59:59.000Z",
    target_guest_global_limit: 100,
    target_sol_daily_limit: 10,
    target_monthly_budget_micros: 100_000,
    target_provider_costs: [],
    ...overrides
  };
}

async function reserve(environment: ReturnType<typeof databaseEnvironment>, overrides: Record<string, unknown>) {
  return rpc(environment, "reserve_evaluation_allowance", reservationArguments(overrides));
}

async function finalize(
  environment: ReturnType<typeof databaseEnvironment>,
  idempotencyHash: string,
  outcome: string,
  costResults: unknown[] = [],
  now = "2026-01-31T15:00:01.000Z"
) {
  return rpc(environment, "finalize_evaluation_allowance", {
    target_idempotency_hash: idempotencyHash,
    target_outcome: outcome,
    target_cost_results: costResults,
    target_now: now
  });
}
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

profileSuite(["account-three-kst-rollover"], "account allowance and KST guest rollover", () => {
  it("consumes three campaign allowances, rejects the fourth, and rolls guest buckets at KST midnight", async () => {
    const environment = databaseEnvironment();
    const accountHmac = "a".repeat(64);
    for (let index = 0; index < 3; index += 1) {
      const idempotency = `${index + 1}`.repeat(64);
      const reserved = await reserve(environment, {
        target_idempotency_hash: idempotency,
        target_request_fingerprint: `${index + 4}`.repeat(64),
        target_account_hmac: accountHmac
      });
      expect(reserved.response.status).toBe(200);
      expect(reserved.body).toMatchObject({ decision: "reserved", isDuplicate: false, providerCallAllowed: true });
      const completed = await finalize(environment, idempotency, "completed");
      expect(completed.response.status).toBe(200);
      expect(completed.body).toBe("completed");
    }

    const fourth = await reserve(environment, {
      target_idempotency_hash: "4".repeat(64),
      target_request_fingerprint: "8".repeat(64),
      target_account_hmac: accountHmac
    });
    expect(fourth.body).toMatchObject({ decision: "rejected", code: "ACCOUNT_LIMIT", providerCallAllowed: false });

    const guestBase = {
      target_audience: "guest",
      target_account_hmac: null,
      target_ip_current_hmac: "b".repeat(64),
      target_cookie_current_hmac: "c".repeat(64),
      target_campaign_id: "guest-preview"
    };
    const beforeMidnight = await reserve(environment, {
      ...guestBase,
      target_idempotency_hash: "d".repeat(64),
      target_request_fingerprint: "e".repeat(64),
      target_now: "2026-01-31T14:59:59.999Z"
    });
    expect(beforeMidnight.body).toMatchObject({ decision: "reserved", providerCallAllowed: true });
    await finalize(environment, "d".repeat(64), "completed", [], "2026-01-31T14:59:59.999Z");

    const afterMidnight = await reserve(environment, {
      ...guestBase,
      target_idempotency_hash: "f".repeat(64),
      target_request_fingerprint: "0".repeat(64),
      target_now: "2026-01-31T15:00:00.000Z"
    });
    expect(afterMidnight.body).toMatchObject({ decision: "reserved", providerCallAllowed: true });

    const guestCounters = await rest(environment, environment.serviceRoleKey, "usage_counters", {
      query: "?select=subject_kind,campaign_or_bucket,count&subject_kind=eq.guest_ip&order=campaign_or_bucket"
    });
    expect(guestCounters.body).toEqual([
      { subject_kind: "guest_ip", campaign_or_bucket: "guest:2026-01-31", count: 1 },
      { subject_kind: "guest_ip", campaign_or_bucket: "guest:2026-02-01", count: 1 }
    ]);
    expect(JSON.stringify(guestCounters.body)).not.toContain("198.51.100");

    const directMutation = await rest(environment, environment.serviceRoleKey, "evaluation_usage_reservations", {
      method: "POST",
      body: {
        idempotency_hash: "9".repeat(64),
        request_fingerprint: "8".repeat(64),
        audience: "authenticated",
        account_hmac: "7".repeat(64),
        campaign_id: "direct-mutation-forbidden",
        reservation_expires_at: "2026-02-01T16:00:00.000Z"
      }
    });
    expect([401, 403]).toContain(directMutation.response.status);

    const cleanup = await rpc(environment, "purge_expired_guest_usage", {
      target_now: "2026-02-10T15:00:00.000Z"
    });
    expect(cleanup.response.status).toBe(200);
    expect(cleanup.body).toBe(6);
  });
});

profileSuite(["twenty-concurrent-cookie-rotation"], "guest concurrency idempotency and HMAC rotation", () => {
  it("allows at most one provider call across concurrent shared-IP and duplicate attempts", async () => {
    const environment = databaseEnvironment();
    const sharedIp = "1".repeat(64);
    const attempts = await Promise.all(Array.from({ length: 20 }, (_, index) => reserve(environment, {
      target_audience: "guest",
      target_account_hmac: null,
      target_idempotency_hash: String(index + 10).padStart(2, "0").repeat(32),
      target_request_fingerprint: String(index + 40).padStart(2, "0").repeat(32),
      target_ip_current_hmac: sharedIp,
      target_cookie_current_hmac: String(index + 70).padStart(2, "0").repeat(32),
      target_campaign_id: "guest-concurrency",
      target_now: "2026-02-01T01:00:00.000Z"
    })));
    const allowed = attempts.filter((attempt: RpcResult) => attempt.body?.providerCallAllowed === true);
    expect(allowed).toHaveLength(1);
    expect(attempts.filter((attempt: RpcResult) => attempt.body?.code === "GUEST_LIMIT")).toHaveLength(19);

    const duplicateId = "9".repeat(64);
    const duplicateCalls = await Promise.all(Array.from({ length: 20 }, () => reserve(environment, {
      target_audience: "guest",
      target_account_hmac: null,
      target_idempotency_hash: duplicateId,
      target_request_fingerprint: "7".repeat(64),
      target_ip_current_hmac: "2".repeat(64),
      target_cookie_current_hmac: "3".repeat(64),
      target_campaign_id: "guest-idempotency",
      target_now: "2026-02-02T01:00:00.000Z"
    })));
    expect(duplicateCalls.filter((attempt: RpcResult) => attempt.body?.providerCallAllowed === true)).toHaveLength(1);
    expect(duplicateCalls.filter((attempt: RpcResult) => attempt.body?.code === "EVALUATION_IN_PROGRESS")).toHaveLength(19);
    expect(duplicateCalls.every((attempt: RpcResult) => !("verdict" in (attempt.body ?? {})))).toBe(true);
    await finalize(environment, duplicateId, "ambiguous_after_acceptance", [], "2026-02-02T01:00:01.000Z");
    const replay = await reserve(environment, {
      target_audience: "guest",
      target_account_hmac: null,
      target_idempotency_hash: duplicateId,
      target_request_fingerprint: "7".repeat(64),
      target_ip_current_hmac: "2".repeat(64),
      target_cookie_current_hmac: "3".repeat(64),
      target_campaign_id: "guest-idempotency",
      target_now: "2026-02-02T01:00:02.000Z"
    });
    expect(replay.body).toMatchObject({ code: "GUEST_ATTEMPT_ALREADY_USED", providerCallAllowed: false });
    expect(replay.body).not.toHaveProperty("verdict");

    const oldCookie = "4".repeat(64);
    const rotatedCookie = "5".repeat(64);
    const firstCookie = await reserve(environment, {
      target_audience: "guest",
      target_account_hmac: null,
      target_idempotency_hash: "6".repeat(64),
      target_request_fingerprint: "a".repeat(64),
      target_ip_current_hmac: "b".repeat(64),
      target_cookie_current_hmac: oldCookie,
      target_campaign_id: "guest-cookie-rotation",
      target_now: "2026-02-03T01:00:00.000Z"
    });
    expect(firstCookie.body?.providerCallAllowed).toBe(true);
    const rotatedAttempt = await reserve(environment, {
      target_audience: "guest",
      target_account_hmac: null,
      target_idempotency_hash: "c".repeat(64),
      target_request_fingerprint: "d".repeat(64),
      target_ip_current_hmac: "e".repeat(64),
      target_cookie_current_hmac: rotatedCookie,
      target_cookie_previous_hmac: oldCookie,
      target_campaign_id: "guest-cookie-rotation",
      target_now: "2026-02-03T01:00:01.000Z"
    });
    expect(rotatedAttempt.body).toMatchObject({ decision: "rejected", code: "GUEST_LIMIT" });
  }, 30_000);
});

profileSuite(["refund-ambiguous-acceptance-month-boundary"], "refund, reconciliation, and monthly budget lifecycle", () => {
  it("settles partial acceptance, retains ambiguity beyond TTL, reconciles late, and isolates UTC months", async () => {
    const environment = databaseEnvironment();
    const idempotency = "a".repeat(64);
    const providerCosts = [
      { providerRole: "luna", providerId: "provider", modelId: "luna", pricingVersion: "v1", reservedMicros: 1_000 },
      { providerRole: "terra", providerId: "provider", modelId: "terra", pricingVersion: "v1", reservedMicros: 1_000 },
      { providerRole: "sol", providerId: "provider", modelId: "sol", pricingVersion: "v1", reservedMicros: 1_000 }
    ];
    const initial = await reserve(environment, {
      target_idempotency_hash: idempotency,
      target_request_fingerprint: "b".repeat(64),
      target_account_hmac: "c".repeat(64),
      target_now: "2026-01-31T23:59:59.000Z",
      target_provider_costs: providerCosts,
      target_monthly_budget_micros: 10_000
    });
    expect(initial.body).toMatchObject({ decision: "reserved", providerCallAllowed: true });

    const finalized = await finalize(environment, idempotency, "failed_needs_adjudication", [
      { providerRole: "luna", outcome: "accepted", acceptedMicros: 400 },
      { providerRole: "terra", outcome: "ambiguous", encryptedRequestIdHex: "01020304" },
      { providerRole: "sol", outcome: "rejected" }
    ], "2026-02-01T00:00:01.000Z");
    expect(finalized.body).toBe("failed_needs_adjudication");

    const januaryLedger = await rest(environment, environment.serviceRoleKey, "budget_ledger", {
      query: "?select=model_id,utc_month,reserved_micros,accepted_micros&utc_month=eq.2026-01-01&order=model_id"
    });
    expect(januaryLedger.body).toEqual([
      { model_id: "luna", utc_month: "2026-01-01", reserved_micros: 0, accepted_micros: 400 },
      { model_id: "sol", utc_month: "2026-01-01", reserved_micros: 0, accepted_micros: 0 },
      { model_id: "terra", utc_month: "2026-01-01", reserved_micros: 1_000, accepted_micros: 0 }
    ]);
    const allowance = await rest(environment, environment.serviceRoleKey, "usage_counters", {
      query: "?select=subject_kind,count&subject_kind=in.(account,sol)&order=subject_kind"
    });
    expect(allowance.body).toEqual([
      { subject_kind: "account", count: 0 },
      { subject_kind: "sol", count: 0 }
    ]);

    const expired = await rpc(environment, "expire_stale_evaluation_reservations", {
      target_now: "2026-02-01T00:20:00.000Z"
    });
    expect(expired.body).toBe(0);
    const alerts = await rpc(environment, "mark_ambiguous_cost_alerts", {
      target_now: "2026-02-08T00:00:00.000Z"
    });
    expect(alerts.body).toBe(1);

    const costs = await rest(environment, environment.serviceRoleKey, "cost_reservations", {
      query: "?select=id,provider_role,state,encrypted_request_id,alerted_at&provider_role=eq.terra"
    });
    expect(costs.body).toHaveLength(1);
    expect(costs.body[0]).toMatchObject({ provider_role: "terra", state: "ambiguous_held" });
    expect(costs.body[0].encrypted_request_id).not.toBeNull();
    expect(costs.body[0].alerted_at).not.toBeNull();

    const reconciled = await rpc(environment, "resolve_ambiguous_cost", {
      target_cost_id: costs.body[0].id,
      target_resolution: "accepted",
      target_accepted_micros: 700,
      target_now: "2026-02-08T00:00:01.000Z"
    });
    expect(reconciled.body).toBe("accepted_settled");
    const reconciledAgain = await rpc(environment, "resolve_ambiguous_cost", {
      target_cost_id: costs.body[0].id,
      target_resolution: "accepted",
      target_accepted_micros: 700,
      target_now: "2026-02-08T00:00:02.000Z"
    });
    expect(reconciledAgain.body).toBe("accepted_settled");
    const nonIdempotentResolution = await rpc(environment, "resolve_ambiguous_cost", {
      target_cost_id: costs.body[0].id,
      target_resolution: "accepted",
      target_accepted_micros: 701,
      target_now: "2026-02-08T00:00:03.000Z"
    });
    expect(nonIdempotentResolution.response.status).toBe(400);

    const februaryId = "d".repeat(64);
    const february = await reserve(environment, {
      target_idempotency_hash: februaryId,
      target_request_fingerprint: "e".repeat(64),
      target_account_hmac: "c".repeat(64),
      target_now: "2026-02-01T00:00:00.000Z",
      target_provider_costs: [providerCosts[0]],
      target_monthly_budget_micros: 10_000
    });
    expect(february.body?.providerCallAllowed).toBe(true);
    const expiredFebruary = await rpc(environment, "expire_stale_evaluation_reservations", {
      target_now: "2026-02-01T00:10:01.000Z"
    });
    expect(expiredFebruary.body).toBe(1);

    const allLedgers = await rest(environment, environment.serviceRoleKey, "budget_ledger", {
      query: "?select=model_id,utc_month,reserved_micros,accepted_micros&model_id=eq.luna&order=utc_month"
    });
    expect(allLedgers.body).toEqual([
      { model_id: "luna", utc_month: "2026-01-01", reserved_micros: 0, accepted_micros: 400 },
      { model_id: "luna", utc_month: "2026-02-01", reserved_micros: 0, accepted_micros: 0 }
    ]);

    const overBudget = await reserve(environment, {
      target_idempotency_hash: "f".repeat(64),
      target_request_fingerprint: "1".repeat(64),
      target_account_hmac: "2".repeat(64),
      target_now: "2026-02-01T00:20:00.000Z",
      target_provider_costs: [{ ...providerCosts[0], reservedMicros: 20_000 }],
      target_monthly_budget_micros: 10_000
    });
    expect(overBudget.body).toMatchObject({ decision: "rejected", code: "PAID_EVALUATION_DISABLED" });

    const freeAfterSpend = await reserve(environment, {
      target_idempotency_hash: "3".repeat(64),
      target_request_fingerprint: "4".repeat(64),
      target_account_hmac: "5".repeat(64),
      target_now: "2026-02-01T00:21:00.000Z",
      target_provider_costs: [],
      target_monthly_budget_micros: 0
    });
    expect(freeAfterSpend.body).toMatchObject({ decision: "reserved", providerCallAllowed: true });

    const duplicateProviderRole = await reserve(environment, {
      target_idempotency_hash: "6".repeat(64),
      target_request_fingerprint: "7".repeat(64),
      target_account_hmac: "8".repeat(64),
      target_now: "2026-02-01T00:22:00.000Z",
      target_provider_costs: [providerCosts[0], { ...providerCosts[0], modelId: "duplicate-luna" }],
      target_monthly_budget_micros: 10_000
    });
    expect(duplicateProviderRole.body).toMatchObject({ decision: "rejected", code: "PROVIDER_COSTS_INVALID" });

    const accountCleanup = await rpc(environment, "purge_account_linkable_data", {
      target_owner_id: "11111111-1111-4111-8111-111111111111",
      target_subject_hmac: "5".repeat(64)
    });
    expect(accountCleanup.response.status).toBe(204);
    const cleanedReservation = await rest(environment, environment.serviceRoleKey, "evaluation_usage_reservations", {
      query: `?select=state,account_hmac,terminal_outcome&id=eq.${freeAfterSpend.body.reservationId}`
    });
    expect(cleanedReservation.body).toEqual([{
      state: "refunded",
      account_hmac: null,
      terminal_outcome: "account_deleted_before_acceptance"
    }]);
  }, 30_000);
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

    for (const table of [
      "budget_ledger", "provider_reconciliation", "account_deletion_jobs", "benchmark_records",
      "usage_subject_aliases", "evaluation_usage_reservations", "usage_reservation_buckets", "cost_reservations"
    ]) {
      const anonymousAccess = await rest(fixture.environment, fixture.environment.anonKey, table, { query: "?select=*" });
      const authenticatedBrowserAccess = await rest(fixture.environment, fixture.userA.accessToken, table, { query: "?select=*" });
      expect([401, 403]).toContain(anonymousAccess.response.status);
      expect([401, 403]).toContain(authenticatedBrowserAccess.response.status);
    }
  });
});

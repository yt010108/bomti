import { describe, expect, it } from "vitest";
import { runtimeReadiness } from "../lib/operations/readiness";

describe("operations readiness and disable switches", () => {
  it("fails closed without runtime configuration while keeping secret values out of the result", () => {
    expect(runtimeReadiness({})).toEqual({ status: "not_ready", ready: false, code: "ENV_MISSING:SUPABASE_URL" });
  });

  it("reports an explicit pause and a non-secret evaluation disable state", () => {
    expect(runtimeReadiness({ BOMTI_OPERATIONS_PAUSED: "true", SUPABASE_URL: "https://example.invalid", SUPABASE_ANON_KEY: "placeholder" }))
      .toEqual({ status: "paused", ready: false, code: "SERVICE_PAUSED" });
    expect(runtimeReadiness({ BOMTI_DISABLE_EVALUATIONS: "true", SUPABASE_URL: "https://example.invalid", SUPABASE_ANON_KEY: "placeholder" }))
      .toEqual({ status: "degraded", ready: true, code: "EVALUATIONS_DISABLED" });
  });

  it("keeps deterministic fixture readiness available without an external project", () => {
    expect(runtimeReadiness({ BOMTI_API_TEST_MODE: "true" })).toEqual({ status: "ok", ready: true });
  });
});

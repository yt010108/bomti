import { validateRuntimeEnvironment } from "../config/env";

export type Readiness = Readonly<{
  status: "ok" | "paused" | "degraded" | "not_ready";
  ready: boolean;
  code?: "SERVICE_PAUSED" | "EVALUATIONS_DISABLED" | `ENV_MISSING:${string}`;
}>;

export function runtimeReadiness(source: Record<string, string | undefined> = process.env): Readiness {
  if (source.BOMTI_OPERATIONS_PAUSED === "true") return { status: "paused", ready: false, code: "SERVICE_PAUSED" };
  if (source.BOMTI_DISABLE_EVALUATIONS === "true") return { status: "degraded", ready: true, code: "EVALUATIONS_DISABLED" };
  if (source.BOMTI_API_TEST_MODE === "true") return { status: "ok", ready: true };
  const environment = validateRuntimeEnvironment(source);
  if (!environment.ok) return { status: "not_ready", ready: false, code: environment.code };
  return { status: "ok", ready: true };
}

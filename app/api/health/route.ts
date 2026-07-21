import { runtimeReadiness } from "../../../lib/operations/readiness";

export const dynamic = "force-dynamic";

export function GET() {
  const readiness = runtimeReadiness();
  return Response.json(
    {
      status: readiness.status,
      ready: readiness.ready,
      ...(readiness.code ? { code: readiness.code } : {}),
      service: "bomti",
      auth: process.env.BOMTI_API_TEST_MODE === "true" ? "fixture" : "not_configured"
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", service: "bomti", auth: process.env.BOMTI_API_TEST_MODE === "true" ? "fixture" : "not_configured" },
    { headers: { "Cache-Control": "no-store" } }
  );
}

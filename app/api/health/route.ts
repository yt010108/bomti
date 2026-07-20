export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", service: "bomti" },
    { headers: { "Cache-Control": "no-store" } }
  );
}

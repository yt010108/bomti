import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();

  return NextResponse.json({
    id: `task_${Date.now()}`,
    ...body,
    created_at: new Date().toISOString()
  });
}

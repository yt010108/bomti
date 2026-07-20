import { notFound } from "next/navigation";
import { Showcase } from "./showcase-client";

export const dynamic = "force-dynamic";

export default async function ShowcasePage({ searchParams }: { searchParams: Promise<{ fixture?: string; state?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { fixture, state } = await searchParams;
  return <Showcase fixture={fixture} state={state} />;
}

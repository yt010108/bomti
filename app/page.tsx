import { EvaluationForm } from "./evaluation-form";

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ fixture?: string; scenario?: string }>;
}) {
  const { fixture, scenario } = await searchParams;
  const fixtureEnabled = process.env.BOMTI_API_TEST_MODE === "true";
  return (
    <EvaluationForm
      fixtureEnabled={fixtureEnabled}
      fixtureAudience={fixtureEnabled && fixture === "auth" ? "authenticated" : "guest"}
      fixtureScenario={fixtureEnabled ? scenario : undefined}
    />
  );
}

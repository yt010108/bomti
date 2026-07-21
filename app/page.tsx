import { EvaluationForm } from "./evaluation-form";

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ fixture?: string; scenario?: string }>;
}) {
  const { fixture, scenario } = await searchParams;
  const fixtureEnabled = process.env.BOMTI_API_TEST_MODE === "true";
  const score = process.env.NODE_ENV === "development" && /^result-(?:0|24|25|49|50|74|75|100)$/.test(scenario ?? "")
    ? Number(scenario?.slice("result-".length))
    : undefined;
  return (
    <EvaluationForm
      fixtureEnabled={fixtureEnabled}
      fixtureAudience={fixtureEnabled && fixture === "auth" ? "authenticated" : "guest"}
      fixtureScenario={fixtureEnabled ? scenario : undefined}
      fixtureResultScore={score}
    />
  );
}

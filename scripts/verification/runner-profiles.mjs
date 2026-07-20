const futureProfiles = {
  e2e: [],
  privacy: ["korean-pii-clean-context", "kisa-sbom-date-phone-email"],
  usage: [
    "account-three-kst-rollover",
    "twenty-concurrent-cookie-rotation",
    "refund-ambiguous-acceptance-month-boundary"
  ],
  providers: ["deepseek-luna-terra-sol-valid", "opencode-429-sol-missing"],
  api: [
    "guest-auth-owned-history-feedback",
    "pseudonymize-before-provider-and-storage",
    "auth-body-origin-consent-quota-provider-failures"
  ],
  visual: ["primitive-showcase", "fixture-color-only-meter", "result-boundaries"],
  "final-qa": ["final-product"],
  traceability: ["final"],
  security: ["final-adversarial"],
  scope: ["final"],
  operations: [
    "link-free-vercel-migration-backup-restore",
    "paused-db-missing-model-disabled-budget-expired-oauth-provider429-corrupt-backup"
  ],
  "independent-review": ["readonly-final"],
  "benchmark-validate": ["three-synthetic-operator-absent", "owner-evaluation-context-hash-bad-alias-rare-duplicate"],
  "benchmark-pair": ["synthetic-anonymous-group"],
  "benchmark-import": ["synthetic-contract-only"],
  "benchmark-export": ["synthetic-eligible", "last-rejected-set"],
  "benchmark-report": ["metric-formulas-missing-ties", "majority-tie-abstain-missing"]
};

const operatorProfiles = {
  live: ["authorization-state"],
  "benchmark-pair": ["eligible-live"]
};

const runners = new Set([...Object.keys(futureProfiles), ...Object.keys(operatorProfiles)]);

function includesProfile(matrix, runner, profile) {
  return matrix[runner]?.includes(profile) ?? false;
}

export function classifyRunnerProfile(runner, profile) {
  if (!runners.has(runner)) throw new Error(`UNKNOWN_RUNNER:${runner}`);
  if (profile === "toolchain-fixture-contract") return "current";
  if (includesProfile(operatorProfiles, runner, profile)) return runner === "live" ? "operator-gated" : "operator-input";
  if (includesProfile(futureProfiles, runner, profile)) return "future";
  throw new Error(`UNKNOWN_RUNNER_PROFILE:${runner}:${profile}`);
}

export function receiptForClassification(classification) {
  switch (classification) {
    case "current":
      return {
        verdict: "pass",
        scope: "toolchain-fixture-contract",
        assertions: ["runner accepts profile/out/sha", "machine-readable receipt emitted"]
      };
    case "future":
      return {
        verdict: "blocked",
        code: "dependency_not_ready",
        scope: "future product dependency",
        assertions: ["future product dependency checked", "no unavailable behavior reported as pass"]
      };
    case "operator-input":
      return {
        verdict: "blocked",
        code: "operator_not_supplied",
        scope: "operator-supplied input dependency",
        assertions: ["operator input presence checked", "no operator action fabricated"]
      };
    case "operator-gated":
      return {
        verdict: "skipped",
        code: "operator_not_authorized",
        scope: "operator-authorized live dependency",
        assertions: ["external authorization checked", "no external service changed"]
      };
    default:
      throw new Error(`UNKNOWN_PROFILE_CLASSIFICATION:${classification}`);
  }
}

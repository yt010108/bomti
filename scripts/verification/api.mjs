import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const execFileAsync = promisify(execFile);
const profiles = new Set([
  "guest-auth-owned-history-feedback",
  "pseudonymize-before-provider-and-storage",
  "auth-body-origin-consent-quota-provider-failures"
]);

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);
  if (!profiles.has(flags.profile)) throw new Error(`UNKNOWN_API_PROFILE:${flags.profile}`);
  await execFileAsync(process.execPath, ["./node_modules/vitest/vitest.mjs", "run", "tests/api-integration.test.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, BOMTI_API_TEST_MODE: "true", BOMTI_API_PROFILE: flags.profile }
  });
  await verifyHttpHarness(flags.profile);
  await writeReceipt(flags.out, {
    verdict: "pass",
    runner: "api",
    profile: flags.profile,
    sha: flags.sha,
    scope: "deterministic validated API route harness",
    assertions: [
      "guest and authenticated evaluation contracts executed",
      "pseudonymize before provider and persistence asserted",
      "owned history feedback pagination and deletion asserted",
      "content type body consent origin idempotency quota and provider failures asserted",
      "legacy mock routes absent and no-store responses asserted"
    ]
  });
}

async function verifyHttpHarness(profile) {
  const port = 43_000 + Math.floor(Math.random() * 1_000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, BOMTI_API_TEST_MODE: "true" },
    stdio: "ignore"
  });
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const health = await fetch(`${baseUrl}/api/health`);
        if (health.ok) break;
      } catch {
        // The server is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (attempt === 39) throw new Error("API_HARNESS_NOT_READY");
    }
    const body = {
      question: "지원 동기를 설명해 주세요.",
      answer: "harness@example.com에게 공유한 프로젝트 결과를 바탕으로 개선했습니다.",
      targetRole: "보안 엔지니어",
      jobCompanyContext: "공공 보안 서비스를 운영하는 조직",
      consent: { version: "bomti_consent_v1", providerDisclosure: true, pseudonymization: true, retention: true }
    };
    const evaluated = await fetch(`${baseUrl}/api/evaluations`, {
      method: "POST",
      headers: {
        origin: baseUrl,
        "content-type": "application/json",
        "x-bomti-guest-id": `harness-${port}`,
        "idempotency-key": `harness-${profile}-${port}-contract-key`
      },
      body: JSON.stringify(body)
    });
    const result = await evaluated.json();
    if (evaluated.status !== 201 || JSON.stringify(result).includes("harness@example.com")) {
      const code = typeof result?.error?.code === "string" ? result.error.code : "UNEXPECTED";
      throw new Error(`API_HARNESS_EVALUATION_FAILED:${evaluated.status}:${code}`);
    }
    const legacy = await fetch(`${baseUrl}/api/tasks`, { headers: { origin: baseUrl } });
    if (legacy.status !== 404) throw new Error("LEGACY_MOCK_ROUTE_REACHABLE");
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

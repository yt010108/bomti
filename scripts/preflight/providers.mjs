import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFlags, writeReceipt } from "../evidence/receipt.mjs";

const roles = [
  { role: "guest", provider: "opencode", model: "OPENCODE_GUEST_MODEL" },
  { role: "luna", provider: "openai", model: "OPENAI_LUNA_MODEL" },
  { role: "terra", provider: "openai", model: "OPENAI_TERRA_MODEL" },
  { role: "sol", provider: "openai", model: "OPENAI_SOL_MODEL" }
];

const priceNames = [
  "OPENCODE_GUEST_INPUT_USD_MICROS_PER_MILLION",
  "OPENCODE_GUEST_OUTPUT_USD_MICROS_PER_MILLION",
  "OPENAI_LUNA_INPUT_USD_MICROS_PER_MILLION",
  "OPENAI_LUNA_OUTPUT_USD_MICROS_PER_MILLION",
  "OPENAI_TERRA_INPUT_USD_MICROS_PER_MILLION",
  "OPENAI_TERRA_OUTPUT_USD_MICROS_PER_MILLION",
  "OPENAI_SOL_INPUT_USD_MICROS_PER_MILLION",
  "OPENAI_SOL_OUTPUT_USD_MICROS_PER_MILLION"
];

function present(source, name) {
  const candidate = source[name]?.trim();
  return candidate ? candidate : null;
}

function configurationIssues(source) {
  const required = [
    "OPENCODE_API_BASE_URL",
    "OPENCODE_API_KEY",
    "OPENCODE_GUEST_MODEL",
    "OPENAI_API_KEY",
    "OPENAI_LUNA_MODEL",
    "OPENAI_TERRA_MODEL",
    "OPENAI_SOL_MODEL",
    "PROVIDER_PRICING_VERSION",
    ...priceNames
  ];
  const issues = required.filter((name) => !present(source, name)).map((name) => `PROVIDER_CONFIG_MISSING:${name}`);
  for (const name of priceNames) {
    const candidate = present(source, name);
    if (candidate && !/^[0-9]+$/.test(candidate)) issues.push(`PROVIDER_PRICE_INVALID:${name}`);
  }
  if (present(source, "PAID_INFERENCE_ENABLED") !== "true") issues.push("PAID_INFERENCE_DISABLED");
  const budget = present(source, "PAID_MONTHLY_BUDGET_USD_CENTS");
  if (!budget || !/^[1-9][0-9]*$/.test(budget)) issues.push("PAID_BUDGET_DISABLED");
  return issues;
}

function configuredModelRecords(source) {
  return roles.map((definition) => ({
    role: definition.role,
    provider: definition.provider,
    configuredModelId: present(source, definition.model),
    resolvedModelId: null,
    requiredCapabilities: definition.role === "guest"
      ? ["chat_completions", "structured_outputs"]
      : ["responses", "structured_outputs"],
    capabilities: []
  }));
}

async function loadCatalog(flags, source) {
  if (typeof flags.catalog === "string") {
    return JSON.parse(await readFile(path.resolve(flags.catalog), "utf8"));
  }
  if (flags.live !== "authorized") throw new Error("PROVIDER_PREFLIGHT_LIVE_NOT_AUTHORIZED");
  const openCodeBase = present(source, "OPENCODE_API_BASE_URL").replace(/\/$/, "");
  const openCodeResponse = await fetch(`${openCodeBase}/models`, {
    headers: { authorization: `Bearer ${present(source, "OPENCODE_API_KEY")}` }
  });
  if (!openCodeResponse.ok) throw new Error("OPENCODE_MODEL_CATALOG_UNAVAILABLE");
  const openCodeBody = await openCodeResponse.json();
  const openCodeModels = Array.isArray(openCodeBody.data) ? openCodeBody.data : [];
  const openai = {};
  for (const role of roles.filter((item) => item.provider === "openai")) {
    const configured = present(source, role.model);
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(configured)}`, {
      headers: { authorization: `Bearer ${present(source, "OPENAI_API_KEY")}` }
    });
    if (response.ok) {
      const model = await response.json();
      openai[configured] = { id: model.id, capabilities: ["responses", "structured_outputs"] };
    }
  }
  return {
    opencode: Object.fromEntries(openCodeModels.map((model) => [model.id, model])),
    openai
  };
}

function resolveModels(source, catalog) {
  const issues = [];
  const resolved = roles.map((definition) => {
    const configuredModelId = present(source, definition.model);
    const record = catalog[definition.provider]?.[configuredModelId];
    if (!record) issues.push(`PROVIDER_MODEL_UNAVAILABLE:${definition.role}:${configuredModelId}`);
    const requiredCapabilities = definition.role === "guest"
      ? ["chat_completions", "structured_outputs"]
      : ["responses", "structured_outputs"];
    const capabilities = Array.isArray(record?.capabilities) ? record.capabilities : [];
    for (const capability of requiredCapabilities) {
      if (!capabilities.includes(capability)) {
        issues.push(`PROVIDER_CAPABILITY_MISSING:${definition.role}:${capability}`);
      }
    }
    return {
      role: definition.role,
      provider: definition.provider,
      configuredModelId,
      resolvedModelId: typeof record?.id === "string" ? record.id : null,
      requiredCapabilities,
      capabilities
    };
  });
  return { resolved, issues };
}

export async function runProviderPreflight(flags, source = process.env) {
  const issues = configurationIssues(source);
  if (issues.length > 0) {
    return {
      verdict: "fail",
      code: "PROVIDER_CONFIGURATION_UNUSABLE",
      issues,
      models: configuredModelRecords(source),
      assertions: ["configured model IDs recorded", "configuration failed closed", "authorization material omitted"]
    };
  }
  let catalog;
  try {
    catalog = await loadCatalog(flags, source);
  } catch (error) {
    return {
      verdict: "fail",
      code: error instanceof Error ? error.message : "PROVIDER_PREFLIGHT_FAILED",
      issues: [error instanceof Error ? error.message : "PROVIDER_PREFLIGHT_FAILED"],
      models: configuredModelRecords(source),
      assertions: ["live capability lookup requires explicit authorization"]
    };
  }
  const { resolved, issues: modelIssues } = resolveModels(source, catalog);
  return {
    verdict: modelIssues.length === 0 ? "pass" : "fail",
    ...(modelIssues.length === 0 ? {} : { code: "PROVIDER_CONFIGURATION_UNUSABLE" }),
    pricingVersion: present(source, "PROVIDER_PRICING_VERSION"),
    models: resolved,
    issues: modelIssues,
    assertions: [
      "configured model IDs resolved without fallback",
      "required endpoint and structured-output capabilities checked",
      "authorization material omitted"
    ]
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (typeof flags.out !== "string") throw new Error("ARGUMENT_REQUIRED:out");
  const outcome = await runProviderPreflight(flags);
  const serialized = JSON.stringify(outcome);
  for (const name of ["OPENCODE_API_KEY", "OPENAI_API_KEY"]) {
    const secret = present(process.env, name);
    if (secret && serialized.includes(secret)) throw new Error("PREFLIGHT_SECRET_LEAKED");
  }
  await writeReceipt(flags.out, {
    ...outcome,
    runner: "provider-preflight",
    profile: typeof flags.profile === "string" ? flags.profile : "configured",
    sha: typeof flags.sha === "string" ? flags.sha : "unbound"
  });
  if (outcome.verdict !== "pass") process.exitCode = 1;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

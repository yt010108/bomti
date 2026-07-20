import { access, readFile, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { parseFlags } from "./receipt.mjs";

const redactedValue = "[REDACTED]";
const redactionDeclaration = "no secrets, raw inputs, identifiers, or tokens included";
const safeEnvironmentNames = ["ComSpec", "LANG", "LC_ALL", "PATHEXT", "SystemRoot", "TERM", "TZ", "WINDIR"];
const safeExecutableNames = new Set(["node", "node.exe", "npm", "npm.cmd"]);
const safeNpmCommands = new Set(["exec", "run", "test"]);
const numericReceiptValues = {
  dimensions: 5,
  guestEvidenceLimit: 3,
  requirementCount: 15
};
const nestedReceiptFields = new Set([
  "assertions",
  "code",
  "contractVersion",
  "databaseMode",
  "dimensions",
  "guestEvidenceLimit",
  "profile",
  "redaction",
  "requirementCount",
  "runner",
  "scope",
  "sha",
  "timestamp",
  "verdict"
]);

export function isWithin(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

export async function canonicalPath(target) {
  let candidate = path.resolve(target);
  const missingSegments = [];

  while (true) {
    try {
      return path.join(await realpath(candidate), ...missingSegments.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(candidate);
      if (parent === candidate) return path.resolve(target);
      missingSegments.push(path.basename(candidate));
      candidate = parent;
    }
  }
}

export async function packageScriptNames(sourceDirectory) {
  const packageJson = JSON.parse(await readFile(path.join(sourceDirectory, "package.json"), "utf8"));
  if (!packageJson || typeof packageJson !== "object" || !packageJson.scripts || typeof packageJson.scripts !== "object") {
    return new Set();
  }
  return new Set(Object.keys(packageJson.scripts));
}

export function sanitizedCommand(payload, scriptNames) {
  const executable = path.basename(payload[0]);
  const sanitizedExecutable = safeExecutableNames.has(executable) ? executable : redactedValue;

  return payload.map((argument, index) => {
    if (index === 0) return sanitizedExecutable;
    if (argument === "--") return argument;
    if (sanitizedExecutable.startsWith("npm") && index === 1 && safeNpmCommands.has(argument)) return argument;
    if (
      sanitizedExecutable.startsWith("npm") &&
      index === 2 &&
      payload[1] === "run" &&
      scriptNames.has(argument)
    ) {
      return argument;
    }
    return redactedValue;
  });
}

async function trustedRuntimeDirectories(excludedDirectories) {
  const candidates = [path.dirname(process.execPath)];
  if (process.platform === "win32") {
    if (process.env.SystemRoot) candidates.push(path.join(process.env.SystemRoot, "System32"));
  } else {
    candidates.push("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin");
  }

  const directories = [];
  for (const candidate of candidates) {
    try {
      const canonical = await canonicalPath(candidate);
      if (!excludedDirectories.some((directory) => isWithin(canonical, directory)) && !directories.includes(canonical)) {
        directories.push(canonical);
      }
    } catch {
      continue;
    }
  }
  return directories;
}

export async function trustedExecutable(name, excludedDirectories) {
  const directories = await trustedRuntimeDirectories(excludedDirectories);
  for (const directory of directories) {
    const candidate = path.join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      const canonical = await canonicalPath(candidate);
      if (!excludedDirectories.some((excluded) => isWithin(canonical, excluded))) return canonical;
    } catch {
      continue;
    }
  }
  throw new Error(`TRUSTED_EXECUTABLE_MISSING:${name}`);
}

export async function sanitizedEnvironment(workspaceRoot, detachedDirectory, excludedDirectories, overrides) {
  const environment = {};
  for (const name of safeEnvironmentNames) {
    if (typeof process.env[name] === "string") environment[name] = process.env[name];
  }
  if (process.env.CI) environment.CI = "true";
  if (process.env.FORCE_COLOR) environment.FORCE_COLOR = "1";
  if (process.env.NO_COLOR) environment.NO_COLOR = "1";

  const runtimeDirectories = await trustedRuntimeDirectories(excludedDirectories);

  return {
    ...environment,
    PATH: [path.join(detachedDirectory, "node_modules", ".bin"), ...runtimeDirectories].join(path.delimiter),
    HOME: path.join(workspaceRoot, "home"),
    TMPDIR: path.join(workspaceRoot, "tmp"),
    npm_config_cache: path.join(workspaceRoot, "npm-cache"),
    BOMTI_TEST_PROVIDER: "deterministic",
    BOMTI_TEST_AUTH: "fixtures",
    BOMTI_TEST_FIXTURE_PROFILE: "baseline",
    ...overrides
  };
}

export function payloadMetadata(payload) {
  const flags = parseFlags(payload);
  return {
    output: typeof flags.out === "string" ? flags.out : null,
    profile: typeof flags.profile === "string" ? flags.profile : null
  };
}

export async function nestedReceiptFailure(receiptPath, sha, profile, isDocumented) {
  let receipt;
  try {
    receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  } catch {
    return "NESTED_RECEIPT_INVALID";
  }

  if (!receipt || typeof receipt !== "object") return "NESTED_RECEIPT_INVALID";
  const requiredFields = ["assertions", "profile", "redaction", "runner", "sha", "timestamp", "verdict"];
  if (requiredFields.some((field) => !(field in receipt))) return "NESTED_RECEIPT_SCHEMA_INVALID";
  if (Object.keys(receipt).some((field) => !nestedReceiptFields.has(field))) return "NESTED_RECEIPT_SCHEMA_INVALID";
  if (receipt.sha !== sha) return "NESTED_RECEIPT_SHA_MISMATCH";
  if (receipt.profile !== profile) return "NESTED_RECEIPT_PROFILE_MISMATCH";
  if (receipt.redaction !== redactionDeclaration) return "NESTED_RECEIPT_REDACTION_INVALID";
  if (typeof receipt.timestamp !== "string" || !Number.isFinite(Date.parse(receipt.timestamp))) {
    return "NESTED_RECEIPT_SCHEMA_INVALID";
  }
  if (!["approve", "blocked", "fail", "pass", "skipped"].includes(receipt.verdict)) {
    return "NESTED_RECEIPT_SCHEMA_INVALID";
  }
  if (typeof receipt.runner !== "string" || !(await isDocumented(receipt.runner))) {
    return "NESTED_RECEIPT_VALUE_UNDOCUMENTED";
  }
  if (!Array.isArray(receipt.assertions) || receipt.assertions.length === 0) return "NESTED_RECEIPT_SCHEMA_INVALID";
  for (const assertion of receipt.assertions) {
    if (typeof assertion !== "string" || !(await isDocumented(assertion))) {
      return "NESTED_RECEIPT_VALUE_UNDOCUMENTED";
    }
  }

  for (const [field, value] of Object.entries(receipt)) {
    if (requiredFields.includes(field) || field === "sha") continue;
    if (Object.hasOwn(numericReceiptValues, field)) {
      if (value === numericReceiptValues[field]) continue;
      return "NESTED_RECEIPT_SCHEMA_INVALID";
    }
    if (typeof value === "string" && (await isDocumented(value))) continue;
    return "NESTED_RECEIPT_VALUE_UNDOCUMENTED";
  }
  return null;
}

export function receiptLocation(receiptPath, wrapperOutput) {
  if (!receiptPath) return null;
  if (!isWithin(receiptPath, wrapperOutput)) return "[EXTERNAL_RECEIPT]";
  return path.relative(wrapperOutput, receiptPath).split(path.sep).join("/");
}

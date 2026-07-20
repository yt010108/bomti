import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { parseFlags } from "./receipt.mjs";

const redactedValue = "[REDACTED]";
const safeEnvironmentNames = ["ComSpec", "LANG", "LC_ALL", "PATHEXT", "SystemRoot", "TERM", "TZ", "WINDIR"];
const safeNpmCommands = new Set(["exec", "run", "test"]);
const commandFlagPattern = /^--?[A-Za-z][A-Za-z0-9_-]*(?:=.*)?$/;

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

  return payload.map((argument, index) => {
    if (index === 0) return executable;
    if (argument === "--") return argument;
    if (commandFlagPattern.test(argument)) {
      const assignmentIndex = argument.indexOf("=");
      return assignmentIndex === -1 ? argument : `${argument.slice(0, assignmentIndex)}=${redactedValue}`;
    }
    if (executable.startsWith("npm") && index === 1 && safeNpmCommands.has(argument)) return argument;
    if (executable.startsWith("npm") && index === 2 && payload[1] === "run" && scriptNames.has(argument)) return argument;
    return redactedValue;
  });
}

export async function sanitizedEnvironment(workspaceRoot, detachedDirectory, excludedDirectories, overrides) {
  const environment = {};
  for (const name of safeEnvironmentNames) {
    if (typeof process.env[name] === "string") environment[name] = process.env[name];
  }
  if (process.env.CI) environment.CI = "true";
  if (process.env.FORCE_COLOR) environment.FORCE_COLOR = "1";
  if (process.env.NO_COLOR) environment.NO_COLOR = "1";

  const pathEntries = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean);
  const canonicalEntries = await Promise.all(pathEntries.map((entry) => canonicalPath(entry)));
  const allowedEntries = canonicalEntries.filter(
    (entry) => !excludedDirectories.some((directory) => isWithin(entry, directory))
  );

  return {
    ...environment,
    PATH: [path.join(detachedDirectory, "node_modules", ".bin"), ...allowedEntries].join(path.delimiter),
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

export async function nestedReceiptFailure(receiptPath, sha, profile) {
  let receipt;
  try {
    receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  } catch {
    return "NESTED_RECEIPT_INVALID";
  }

  if (!receipt || typeof receipt !== "object") return "NESTED_RECEIPT_INVALID";
  if (receipt.sha !== sha) return "NESTED_RECEIPT_SHA_MISMATCH";
  if (receipt.profile !== profile) return "NESTED_RECEIPT_PROFILE_MISMATCH";
  if (typeof receipt.redaction !== "string" || receipt.redaction.length === 0) {
    return "NESTED_RECEIPT_REDACTION_MISSING";
  }
  return null;
}

export function receiptLocation(receiptPath, wrapperOutput) {
  if (!receiptPath) return null;
  if (!isWithin(receiptPath, wrapperOutput)) return "[EXTERNAL_RECEIPT]";
  return path.relative(wrapperOutput, receiptPath).split(path.sep).join("/");
}

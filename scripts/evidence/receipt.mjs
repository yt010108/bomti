import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function parseFlags(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const assignmentIndex = token.indexOf("=");
    if (assignmentIndex !== -1) {
      const key = token.slice(2, assignmentIndex);
      flags[key] = token.slice(assignmentIndex + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return flags;
}

export function requireReceiptFlags(flags, names = ["profile", "out", "sha"]) {
  for (const name of names) {
    if (typeof flags[name] !== "string" || flags[name].length === 0) {
      throw new Error(`ARGUMENT_REQUIRED:${name}`);
    }
  }
}

export async function writeReceipt(outputDirectory, payload) {
  await mkdir(outputDirectory, { recursive: true });
  const receipt = {
    timestamp: new Date().toISOString(),
    redaction: "no secrets, raw inputs, identifiers, or tokens included",
    ...payload
  };
  await writeFile(path.join(outputDirectory, "result.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

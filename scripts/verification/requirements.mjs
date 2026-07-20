import { readFile } from "node:fs/promises";
import path from "node:path";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const REQUIRED_IDS = Array.from({ length: 15 }, (_, index) => `BOM-${String(index + 1).padStart(3, "0")}`);
const historicalStart = /^<!--\s*historical-non-active:start\b/i;
const historicalEnd = /^<!--\s*historical-non-active:end\s*-->$/i;

function plainText(node) {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(plainText).join("");
}

function activeRequirementIds(markdown) {
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const counts = new Map();
  let insideHistoricalSection = false;

  for (const node of root.children) {
    if (node.type === "html" && historicalStart.test(node.value)) {
      insideHistoricalSection = true;
      continue;
    }
    if (node.type === "html" && historicalEnd.test(node.value)) {
      insideHistoricalSection = false;
      continue;
    }
    if (insideHistoricalSection || node.type !== "table") continue;

    for (const row of node.children.slice(1)) {
      const id = plainText(row.children[0] ?? {}).trim();
      if (/^BOM-\d{3}$/.test(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  return counts;
}

function verifyLedger(markdown) {
  const counts = activeRequirementIds(markdown);
  const missing = REQUIRED_IDS.filter((id) => counts.get(id) !== 1);
  const orphan = [...counts.keys()].filter((id) => !REQUIRED_IDS.includes(id));
  const duplicates = [...counts.entries()].filter(([, count]) => count !== 1).map(([id]) => id);

  if (missing.length) throw new Error(`MISSING_REQUIREMENT:${missing[0]}`);
  if (orphan.length) throw new Error(`ORPHAN_REQUIREMENT:${orphan[0]}`);
  if (duplicates.length) throw new Error(`DUPLICATE_REQUIREMENT:${duplicates[0]}`);
  return { requirementCount: counts.size };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);
  const ledgerPath = path.join(process.cwd(), "docs", "requirements.md");
  let markdown = await readFile(ledgerPath, "utf8");

  if (flags.profile === "missing-bom009") {
    markdown = markdown.replace("| BOM-009 |", "| OMITTED |");
  }
  if (flags.profile === "historical-duplicate") {
    markdown += "\n<!-- historical-non-active:start archived requirement -->\n| ID | Archived requirement |\n| --- | --- |\n| BOM-009 | archived duplicate that must not count |\n<!-- historical-non-active:end -->\n";
  }

  try {
    const result = verifyLedger(markdown);
    await writeReceipt(flags.out, {
      verdict: "pass",
      runner: "requirements",
      profile: flags.profile,
      sha: flags.sha,
      ...result,
      assertions: ["MDAST table parsed", "15 active IDs found exactly once", "historical sections excluded"]
    });
  } catch (error) {
    await writeReceipt(flags.out, {
      verdict: "fail",
      runner: "requirements",
      profile: flags.profile,
      sha: flags.sha,
      code: error.message,
      assertions: ["MDAST table parsed", "missing, orphan, and duplicate IDs are rejected"]
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

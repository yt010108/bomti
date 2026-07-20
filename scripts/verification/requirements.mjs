import { readFile } from "node:fs/promises";
import path from "node:path";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";
import { requiredTables } from "./requirements-contract.mjs";

const REQUIRED_IDS = Array.from({ length: 15 }, (_, index) => `BOM-${String(index + 1).padStart(3, "0")}`);
const profiles = new Set(["current", "missing-bom009", "historical-duplicate"]);
const historicalStart = /^<!--\s*historical-non-active:start\b/i;
const historicalEnd = /^<!--\s*historical-non-active:end\s*-->$/i;

function plainText(node) {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(plainText).join("");
}

function activeNodes(markdown) {
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const nodes = [];
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
    if (!insideHistoricalSection) nodes.push(node);
  }
  return nodes;
}

function activeRequirementIds(nodes) {
  const counts = new Map();
  for (const node of nodes) {
    if (node.type !== "table") continue;

    for (const row of node.children.slice(1)) {
      const id = plainText(row.children[0] ?? {}).trim();
      if (/^BOM-\d{3}$/.test(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  return counts;
}

function sectionTables(nodes) {
  const sections = new Map();
  let heading = null;
  for (const node of nodes) {
    if (node.type === "heading" && node.depth === 2) {
      heading = plainText(node).trim();
      sections.set(heading, { table: null });
      continue;
    }
    if (heading && node.type === "table" && sections.get(heading)?.table === null) {
      sections.set(heading, { table: node });
    }
  }
  return sections;
}

function tableCells(table) {
  return table.children.map((row) => row.children.map((cell) => plainText(cell).trim()));
}

function verifyTable(sections, specification) {
  const section = sections.get(specification.heading);
  if (!section) throw new Error(`MISSING_HEADING:${specification.heading}`);
  if (!section.table) throw new Error(`MISSING_TABLE:${specification.heading}`);
  const [headers = [], ...rows] = tableCells(section.table);
  if (headers.join("|") !== specification.headers.join("|")) {
    throw new Error(`MISSING_TABLE_HEADERS:${specification.heading}`);
  }
  for (const [key, mapping, expectedRow] of specification.mappings) {
    const matchingRows = rows.filter((row) => row[0] === key);
    const [row] = matchingRows;
    const isComplete =
      matchingRows.length === 1 &&
      row.length === expectedRow.length &&
      row.every((cell, index) => cell === expectedRow[index]);
    if (!isComplete) {
      throw new Error(`MISSING_MAPPING:${mapping}`);
    }
  }
}

function verifyLedger(markdown) {
  const nodes = activeNodes(markdown);
  const counts = activeRequirementIds(nodes);
  const missing = REQUIRED_IDS.filter((id) => counts.get(id) !== 1);
  const orphan = [...counts.keys()].filter((id) => !REQUIRED_IDS.includes(id));
  const duplicates = [...counts.entries()].filter(([, count]) => count !== 1).map(([id]) => id);

  if (missing.length) throw new Error(`MISSING_REQUIREMENT:${missing[0]}`);
  if (orphan.length) throw new Error(`ORPHAN_REQUIREMENT:${orphan[0]}`);
  if (duplicates.length) throw new Error(`DUPLICATE_REQUIREMENT:${duplicates[0]}`);
  const sections = sectionTables(nodes);
  for (const specification of requiredTables) verifyTable(sections, specification);
  return { requirementCount: counts.size };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags);
  if (!profiles.has(flags.profile)) throw new Error(`UNKNOWN_REQUIREMENTS_PROFILE:${flags.profile}`);
  const ledgerPath = typeof flags.source === "string" ? path.resolve(flags.source) : path.join(process.cwd(), "docs", "requirements.md");
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
      assertions: [
        "MDAST headings and tables parsed",
        "15 active IDs found exactly once",
        "required input score success terminal HTTP error retry refund and partial-verdict mappings found",
        "historical sections excluded"
      ]
    });
  } catch (error) {
    await writeReceipt(flags.out, {
      verdict: "fail",
      runner: "requirements",
      profile: flags.profile,
      sha: flags.sha,
      code: error.message,
      assertions: [
        "MDAST headings and tables parsed",
        "missing orphan duplicate and incomplete structural mappings are rejected"
      ]
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

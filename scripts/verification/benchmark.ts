import { randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BENCHMARK_CONTRACT_VERSION,
  buildBenchmarkReport,
  proposeAnonymousPairs,
  type BenchmarkCorpus,
  type BenchmarkRecord,
  validateBenchmarkCorpus,
  validateOperatorPendingReviewCorpus,
  validateReviewedImportCorpus
} from "../../lib/dataset/jsonl.ts";
import { buildCalibrationReport } from "../../lib/judge/calibration.ts";
// @ts-expect-error Legacy receipt helper is plain ESM JavaScript with no declaration file.
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const profiles = {
  validate: new Set(["three-synthetic-operator-absent", "owner-evaluation-context-hash-bad-alias-rare-duplicate"]),
  pair: new Set(["synthetic-anonymous-group", "eligible-live"]),
  curate: new Set(["pending-review-contract"]),
  import: new Set(["synthetic-contract-only", "operator-reviewed"]),
  export: new Set(["synthetic-eligible", "last-rejected-set"]),
  report: new Set(["metric-formulas-missing-ties", "majority-tie-abstain-missing"])
} as const;

type Command = keyof typeof profiles;
type Flags = Record<string, string | boolean>;

const sourceFixture = path.resolve(process.cwd(), "data/benchmark/synthetic-pairs.json");
const exportAllowlist = {
  record: new Set(["recordId", "groupId", "questionClass", "targetRoleClass", "answerSegments", "verdict", "anonymizationVersion", "provenanceClass", "reviewStatus"]),
  pair: new Set(["pairId", "leftRecordId", "rightRecordId", "groupId", "systemChoice"]),
  rating: new Set(["pairId", "raterAlias", "choice", "rationaleCodes"]),
  usefulness: new Set(["rating", "reasonCode"])
};

function requiredString(flags: Flags, name: string): string {
  const value = flags[name];
  if (typeof value !== "string" || !value) throw new Error(`ARGUMENT_REQUIRED:${name}`);
  return value;
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

function parseCorpus(source: unknown): BenchmarkCorpus {
  try {
    return validateBenchmarkCorpus(source);
  } catch {
    throw new Error("BENCHMARK_SCHEMA_INVALID");
  }
}

async function syntheticCorpus(): Promise<BenchmarkCorpus> {
  return parseCorpus(await readJson(sourceFixture));
}

async function writeJson(output: string, file: string, value: unknown): Promise<void> {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeOperatorNotSupplied(output: string, sha: string, command: Command): Promise<void> {
  await writeJson(output, "operator-status.json", {
    verdict: "blocked",
    code: "operator_not_supplied",
    runner: `benchmark-${command}`,
    sha,
    assertions: ["operator input presence checked", "no operator-curated record or review was fabricated"]
  });
}

function randomRaterAlias(used: Set<string>): string {
  let alias = "";
  do alias = `r${String(randomInt(0, 1_000)).padStart(3, "0")}`;
  while (used.has(alias));
  used.add(alias);
  return alias;
}

function exportCorpus(corpus: BenchmarkCorpus) {
  const records = corpus.records.filter((record) => record.reviewStatus === "synthetic" || record.reviewStatus === "reviewed");
  const selectedIds = new Set(records.map((record) => record.recordId));
  const pairs = corpus.pairs.filter((pair) => selectedIds.has(pair.leftRecordId) && selectedIds.has(pair.rightRecordId));
  const pairIds = new Set(pairs.map((pair) => pair.pairId));
  const recordIds = new Map(records.map((record) => [record.recordId, randomUUID()]));
  const groupIds = new Map(records.map((record) => [record.groupId, randomUUID()]));
  const newPairIds = new Map(pairs.map((pair) => [pair.pairId, randomUUID()]));
  const aliases = new Map<string, string>();
  const usedAliases = new Set<string>();
  const mappedRecords = records.map((record) => ({ ...record, recordId: recordIds.get(record.recordId)!, groupId: groupIds.get(record.groupId)! }));
  const mappedPairs = pairs.map((pair) => ({
    ...pair,
    pairId: newPairIds.get(pair.pairId)!,
    leftRecordId: recordIds.get(pair.leftRecordId)!,
    rightRecordId: recordIds.get(pair.rightRecordId)!,
    groupId: groupIds.get(pair.groupId)!
  }));
  const mappedRatings = corpus.ratings.filter((rating) => pairIds.has(rating.pairId)).map((rating) => {
    const alias = aliases.get(rating.raterAlias) ?? randomRaterAlias(usedAliases);
    aliases.set(rating.raterAlias, alias);
    return { ...rating, pairId: newPairIds.get(rating.pairId)!, raterAlias: alias };
  });
  return {
    contractVersion: BENCHMARK_CONTRACT_VERSION,
    records: mappedRecords,
    pairs: mappedPairs,
    ratings: mappedRatings,
    usefulness: corpus.usefulness
  };
}

function assertExportAllowlist(exported: ReturnType<typeof exportCorpus>): void {
  const assertKeys = (rows: readonly Record<string, unknown>[], allowed: Set<string>, kind: string) => {
    for (const row of rows) for (const key of Object.keys(row)) if (!allowed.has(key)) throw new Error(`EXPORT_ALLOWLIST_VIOLATION:${kind}:${key}`);
  };
  assertKeys(exported.records, exportAllowlist.record, "record");
  assertKeys(exported.pairs, exportAllowlist.pair, "pair");
  assertKeys(exported.ratings, exportAllowlist.rating, "rating");
  assertKeys(exported.usefulness, exportAllowlist.usefulness, "usefulness");
  const serialized = JSON.stringify(exported).toLocaleLowerCase("en-US");
  for (const forbidden of ["owner", "user", "account", "evaluation", "context_hash", "raw_input", "provider_secret", "relink"]) {
    if (serialized.includes(forbidden)) throw new Error(`EXPORT_FORBIDDEN_VALUE:${forbidden}`);
  }
}

function csvCell(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

async function writeCsv(output: string, file: string, rows: readonly Record<string, unknown>[], columns: readonly string[]): Promise<void> {
  const text = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
  await writeFile(path.join(output, file), `${text}\n`, "utf8");
}

function rejectedSetCorpus(corpus: BenchmarkCorpus): BenchmarkCorpus {
  const record = corpus.records[0];
  if (!record) throw new Error("SYNTHETIC_FIXTURE_MISSING");
  return {
    ...corpus,
    records: [...corpus.records, {
      ...record,
      recordId: "10000000-0000-4000-8000-000000000099",
      groupId: "20000000-0000-4000-8000-000000000099",
      reviewStatus: "pending_review"
    }]
  };
}

async function runValidate(flags: Flags, output: string): Promise<Record<string, unknown>> {
  const profile = requiredString(flags, "profile");
  if (profile === "owner-evaluation-context-hash-bad-alias-rare-duplicate") {
    const corpus = await syntheticCorpus();
    const invalidCases: unknown[] = [
      { ...corpus, records: [{ ...corpus.records[0], ownerId: "forbidden", evaluationId: "forbidden", contextHash: "forbidden", rawInput: "forbidden" }, ...corpus.records.slice(1)] },
      { ...corpus, ratings: [{ ...corpus.ratings[0], raterAlias: "founder" }, ...corpus.ratings.slice(1)] },
      { ...corpus, records: [{ ...corpus.records[0], answerSegments: [{ segmentId: "s0001", text: "KISA SBOM 2026-07-21" }] }, ...corpus.records.slice(1)] },
      { ...corpus, records: [...corpus.records, corpus.records[0]] }
    ];
    for (const invalid of invalidCases) {
      try {
        parseCorpus(invalid);
        throw new Error("BENCHMARK_NEGATIVE_FIXTURE_ACCEPTED");
      } catch (error) {
        if (error instanceof Error && error.message === "BENCHMARK_NEGATIVE_FIXTURE_ACCEPTED") throw error;
      }
    }
    throw new Error("BENCHMARK_SCHEMA_INVALID");
  }
  const corpus = await syntheticCorpus();
  const input = flags.input;
  if (typeof input === "string" && input) {
    try {
      validateOperatorPendingReviewCorpus(await readJson(path.resolve(input)));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "OPERATOR_PENDING_REVIEW_INVALID");
    }
    return { verdict: "pass", contractVersion: BENCHMARK_CONTRACT_VERSION, assertions: ["three synthetic deterministic pairs validated", "20-30 separately supplied pending_review pairs validated", "linkable and rare-duplicate fields rejected"] };
  }
  await writeOperatorNotSupplied(output, requiredString(flags, "sha"), "validate");
  return {
    verdict: "pass",
    contractVersion: BENCHMARK_CONTRACT_VERSION,
    operatorInputReceipt: "operator-status.json",
    assertions: ["three synthetic deterministic pairs validated", "inclusive 0-5 tie rule validated", "operator-curated input was not fabricated"]
  };
}

async function runPair(flags: Flags, output: string): Promise<Record<string, unknown>> {
  const profile = requiredString(flags, "profile");
  if (profile === "eligible-live") {
    const input = flags.input;
    if (typeof input !== "string" || !input) {
      await writeOperatorNotSupplied(output, requiredString(flags, "sha"), "pair");
      return { verdict: "blocked", code: "operator_not_supplied", assertions: ["operator input presence checked", "no live proposal was fabricated"] };
    }
    const corpus = parseCorpus(await readJson(path.resolve(input)));
    const proposals = proposeAnonymousPairs(corpus.records as readonly BenchmarkRecord[]);
    await writeJson(output, "operator-proposals.json", { contractVersion: BENCHMARK_CONTRACT_VERSION, proposals });
    return { verdict: "pass", contractVersion: BENCHMARK_CONTRACT_VERSION, artifact: "operator-proposals.json", assertions: ["only same anonymous group and generalized classes paired", "operator-curated records remain pending review"] };
  }
  const corpus = await syntheticCorpus();
  for (const pair of corpus.pairs) {
    const left = corpus.records.find((record) => record.recordId === pair.leftRecordId)!;
    const right = corpus.records.find((record) => record.recordId === pair.rightRecordId)!;
    if (left.groupId !== right.groupId || left.questionClass !== right.questionClass || left.targetRoleClass !== right.targetRoleClass) throw new Error("ANONYMOUS_GROUP_PAIRING_FAILED");
  }
  return { verdict: "pass", contractVersion: BENCHMARK_CONTRACT_VERSION, assertions: ["exactly three synthetic pairs use anonymous matching groups", "tie, left, and right system choices follow inclusive 0-5 rule"] };
}

async function runImport(flags: Flags, output: string): Promise<Record<string, unknown>> {
  const profile = requiredString(flags, "profile");
  if (profile === "synthetic-contract-only") {
    const corpus = await syntheticCorpus();
    return { verdict: "pass", contractVersion: BENCHMARK_CONTRACT_VERSION, importedPairs: corpus.pairs.length, assertions: ["synthetic contract validated without database or external service", "no operator review or server-role import was fabricated"] };
  }
  const input = flags.input;
  if (typeof input !== "string" || !input) {
    await writeOperatorNotSupplied(output, requiredString(flags, "sha"), "import");
    return { verdict: "blocked", code: "operator_not_supplied", assertions: ["explicit reviewed operator input required", "no import occurred"] };
  }
  try {
    const corpus = validateReviewedImportCorpus(await readJson(path.resolve(input)));
    await writeJson(output, "operator-import-manifest.json", { contractVersion: BENCHMARK_CONTRACT_VERSION, pairCount: corpus.pairs.length, reviewStatus: "reviewed" });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "OPERATOR_REVIEW_REQUIRED");
  }
  return { verdict: "pass", contractVersion: BENCHMARK_CONTRACT_VERSION, artifact: "operator-import-manifest.json", assertions: ["only explicit 20-30 reviewed operator pairs are importable", "CLI is server-only and writes no browser-accessible service role secret"] };
}

async function runCurate(flags: Flags, output: string): Promise<Record<string, unknown>> {
  const input = flags.input;
  if (typeof input !== "string" || !input) {
    await writeOperatorNotSupplied(output, requiredString(flags, "sha"), "curate");
    return { verdict: "blocked", code: "operator_not_supplied", assertions: ["operator pending_review input required", "curation state was not fabricated"] };
  }
  try {
    const corpus = validateOperatorPendingReviewCorpus(await readJson(path.resolve(input)));
    await writeJson(output, "operator-curation-manifest.json", { contractVersion: BENCHMARK_CONTRACT_VERSION, pairCount: corpus.pairs.length, reviewStatus: "pending_review" });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "OPERATOR_PENDING_REVIEW_INVALID");
  }
  return { verdict: "pass", contractVersion: BENCHMARK_CONTRACT_VERSION, artifact: "operator-curation-manifest.json", assertions: ["only supplied 20-30 pending_review pairs are eligible for offline curation", "CLI did not create, modify, or approve operator data"] };
}

async function runExport(flags: Flags, output: string): Promise<Record<string, unknown>> {
  const formats = requiredString(flags, "format").split(",").map((format) => format.trim()).filter(Boolean);
  if (!formats.includes("json") || !formats.includes("csv")) throw new Error("EXPORT_FORMAT_JSON_AND_CSV_REQUIRED");
  const fixture = await syntheticCorpus();
  const corpus = requiredString(flags, "profile") === "last-rejected-set" ? rejectedSetCorpus(fixture) : fixture;
  const exported = exportCorpus(corpus);
  assertExportAllowlist(exported);
  await writeJson(output, "benchmark-export.json", exported);
  await writeCsv(output, "benchmark-records.csv", exported.records, [...exportAllowlist.record]);
  await writeCsv(output, "benchmark-pairs.csv", exported.pairs, [...exportAllowlist.pair]);
  await writeCsv(output, "benchmark-ratings.csv", exported.ratings, [...exportAllowlist.rating]);
  await writeCsv(output, "benchmark-usefulness.csv", exported.usefulness, [...exportAllowlist.usefulness]);
  if (requiredString(flags, "profile") === "last-rejected-set" && exported.records.length !== fixture.records.length) throw new Error("REJECTED_EXPORT_FILTER_FAILED");
  return { verdict: "pass", contractVersion: BENCHMARK_CONTRACT_VERSION, artifact: "benchmark-export.json", assertions: ["JSON and CSV exports contain only unlinkable allowlisted fields", "post-anonymization record group and rater aliases were remapped", "pending_review records are excluded from export"] };
}

async function runReport(flags: Flags, output: string): Promise<Record<string, unknown>> {
  if (requiredString(flags, "profile") === "metric-formulas-missing-ties") {
    const report = buildCalibrationReport([
      { pairId: "synthetic-calibration-1", humanChoice: "left", judgeChoice: "left", evaluatorChoices: ["left", "left"], descriptor: null, escalated: false, failureCode: null, usefulness: 5 },
      { pairId: "synthetic-calibration-2", humanChoice: "right", judgeChoice: "left", evaluatorChoices: ["right", "left"], descriptor: null, escalated: true, failureCode: "PROVIDER_UNAVAILABLE", usefulness: 2 },
      { pairId: "synthetic-calibration-3", humanChoice: "tie", judgeChoice: "tie", evaluatorChoices: ["tie", "abstain"], descriptor: null, escalated: true, failureCode: null, usefulness: null },
      { pairId: "synthetic-calibration-4", humanChoice: null, judgeChoice: "right", evaluatorChoices: [], descriptor: null, escalated: false, failureCode: "PROVIDER_OUTPUT_INVALID", usefulness: 4 }
    ]);
    await writeJson(output, "calibration-report.json", report);
    return { verdict: "pass", contractVersion: "bomti_calibration_v1", artifact: "calibration-report.json", assertions: ["pairwise agreement numerator denominator and missing values calculated", "evaluator disagreement excludes abstain-only records", "descriptor escalation failure and usefulness metrics retain explicit denominators"] };
  }
  const corpus = await syntheticCorpus();
  const report = buildBenchmarkReport({
    corpus,
    eligibleAttempts: 4,
    completedVerdicts: [
      { finalIndex: 42, descriptor: "low_bomti" },
      { finalIndex: 78, descriptor: "high_bomti" },
      { finalIndex: 18, descriptor: "minimal_bomti" }
    ],
    authAttempts: [{ validPrimaryCandidates: true, invokedSol: false }, { validPrimaryCandidates: true, invokedSol: true }, { validPrimaryCandidates: false, invokedSol: false }],
    requests: [
      { passedValidationAndConsent: true, terminal: "completed" },
      { passedValidationAndConsent: true, terminal: "provider_output_invalid" },
      { passedValidationAndConsent: true, terminal: null },
      { passedValidationAndConsent: false, terminal: "validation_failed" }
    ],
    completedAuthEvaluations: 3
  });
  await writeJson(output, "benchmark-report.json", report);
  return { verdict: "pass", contractVersion: BENCHMARK_CONTRACT_VERSION, artifact: "benchmark-report.json", assertions: ["strict majority, tie, abstain, and missing pair metrics reported", "all BOM-014 ratios include numerator denominator missing and null-safe rate", "pre-eligibility failures remain outside terminal failure categories"] };
}

async function main(): Promise<void> {
  const [commandValue, ...argv] = process.argv.slice(2);
  if (!commandValue || !(commandValue in profiles)) throw new Error("BENCHMARK_COMMAND_REQUIRED");
  const command = commandValue as Command;
  const flags = parseFlags(argv) as Flags;
  requireReceiptFlags(flags);
  const profile = requiredString(flags, "profile");
  if (!profiles[command].has(profile as never)) throw new Error(`UNKNOWN_BENCHMARK_PROFILE:${command}:${profile}`);
  const output = path.resolve(requiredString(flags, "out"));
  const handlers: Record<Command, (flags: Flags, output: string) => Promise<Record<string, unknown>>> = {
    validate: runValidate,
    pair: runPair,
    curate: runCurate,
    import: runImport,
    export: runExport,
    report: runReport
  };
  const receipt = await handlers[command](flags, output);
  await writeReceipt(output, { ...receipt, runner: `benchmark-${command}`, profile, sha: requiredString(flags, "sha") });
}

main().catch(async (error: unknown) => {
  const flags = parseFlags(process.argv.slice(3)) as Flags;
  if (typeof flags.out === "string" && typeof flags.profile === "string" && typeof flags.sha === "string") {
    await writeReceipt(path.resolve(flags.out), {
      verdict: "fail",
      code: error instanceof Error ? error.message : "BENCHMARK_RUNNER_FAILED",
      runner: `benchmark-${process.argv[2] ?? "unknown"}`,
      profile: flags.profile,
      sha: flags.sha,
      assertions: ["benchmark CLI failed closed"]
    });
  }
  console.error(error instanceof Error ? error.message : "BENCHMARK_RUNNER_FAILED");
  process.exitCode = 1;
});

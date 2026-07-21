import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBenchmarkReport,
  proposeAnonymousPairs,
  strictMajorityChoice,
  validateBenchmarkCorpus
} from "../lib/dataset/jsonl";

const fixturePath = path.join(process.cwd(), "data", "benchmark", "synthetic-pairs.json");

async function fixture() {
  return JSON.parse(await readFile(fixturePath, "utf8"));
}

async function runBenchmark(command: string, profile: string, extra: readonly string[] = []) {
  const output = await mkdtemp(path.join(os.tmpdir(), "bomti-benchmark-test-"));
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "scripts/verification/benchmark.ts", command, `--profile=${profile}`, `--out=${output}`, "--sha=benchmark-test-sha", ...extra],
      { cwd: process.cwd(), stdio: "ignore" }
    );
    child.once("exit", (code) => resolve(code ?? 1));
  });
  const receipt = JSON.parse(await readFile(path.join(output, "result.json"), "utf8"));
  return { exitCode, output, receipt };
}

describe("bomti_benchmark_v1 paired corpus", () => {
  it("validates exactly three deterministic synthetic pairs and the inclusive tie rule", async () => {
    const corpus = validateBenchmarkCorpus(await fixture());

    expect(corpus.pairs).toHaveLength(3);
    expect(corpus.pairs.map((pair) => pair.systemChoice)).toEqual(["tie", "left", "right"]);
    expect(proposeAnonymousPairs(corpus.records)).toHaveLength(3);
    expect(strictMajorityChoice(corpus.ratings.filter((rating) => rating.pairId === corpus.pairs[0]?.pairId))).toBe("tie");
    expect(strictMajorityChoice(corpus.ratings.filter((rating) => rating.pairId === corpus.pairs[2]?.pairId))).toBeNull();
  });

  it("rejects linkable fields, bad aliases, rare identifiers, and duplicate records", async () => {
    const corpus = await fixture();
    const cases = [
      { ...corpus, records: [{ ...corpus.records[0], ownerId: "not-allowed" }, ...corpus.records.slice(1)] },
      { ...corpus, ratings: [{ ...corpus.ratings[0], raterAlias: "founder" }, ...corpus.ratings.slice(1)] },
      { ...corpus, records: [{ ...corpus.records[0], answerSegments: [{ segmentId: "s0001", text: "KISA SBOM 2026-07-21" }] }, ...corpus.records.slice(1)] },
      { ...corpus, records: [...corpus.records, corpus.records[0]] }
    ];

    for (const invalid of cases) expect(() => validateBenchmarkCorpus(invalid)).toThrow();
  });

  it("reports exact BOM-014 numerator denominator missing values with null-safe rates", async () => {
    const corpus = validateBenchmarkCorpus(await fixture());
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

    expect(report.pairwiseAgreement).toEqual({ numerator: 2, denominator: 2, missing: 1, rate: 1 });
    expect(report.evaluatorDisagreement).toEqual({ numerator: 1, denominator: 2, missing: 1, rate: 0.5 });
    expect(report.usefulness).toMatchObject({ positive: 1, denominator: 2, missing: 1, rate: 0.5 });
    expect(report.failureCategories).toMatchObject({ preEligibility: 1, numerator: 1, denominator: 3, missing: 1 });
  });

  it("runs server-only CLI profiles and emits an honest operator-not-supplied receipt", async () => {
    const runs = await Promise.all([
      runBenchmark("validate", "three-synthetic-operator-absent"),
      runBenchmark("pair", "synthetic-anonymous-group"),
      runBenchmark("import", "synthetic-contract-only"),
      runBenchmark("export", "synthetic-eligible", ["--format=json,csv"]),
      runBenchmark("report", "majority-tie-abstain-missing")
    ]);
    try {
      expect(runs.map((run) => run.exitCode)).toEqual([0, 0, 0, 0, 0]);
      expect(runs.map((run) => run.receipt.verdict)).toEqual(["pass", "pass", "pass", "pass", "pass"]);
      const operator = JSON.parse(await readFile(path.join(runs[0]!.output, "operator-status.json"), "utf8"));
      expect(operator).toMatchObject({ verdict: "blocked", code: "operator_not_supplied", sha: "benchmark-test-sha" });
      const exported = JSON.parse(await readFile(path.join(runs[3]!.output, "benchmark-export.json"), "utf8"));
      expect(JSON.stringify(exported)).not.toMatch(/owner|evaluation|context_hash|raw_input|provider_secret|relink/i);
      expect(JSON.stringify(exported)).not.toContain("20000000-0000-4000-8000-000000000001");
      expect(JSON.stringify(exported)).not.toContain("r101");
      const source = await readFile(path.join(process.cwd(), "scripts", "verification", "benchmark.ts"), "utf8");
      expect(source).not.toMatch(/service_role|supabase|app\/api/i);
    } finally {
      await Promise.all(runs.map((run) => rm(run.output, { recursive: true, force: true })));
    }
  });

  it("fails closed for the named negative validator profile and blocks missing operator curation/import", async () => {
    const [negative, missingImport, missingCuration] = await Promise.all([
      runBenchmark("validate", "owner-evaluation-context-hash-bad-alias-rare-duplicate"),
      runBenchmark("import", "operator-reviewed"),
      runBenchmark("curate", "pending-review-contract")
    ]);
    try {
      expect(negative.exitCode).not.toBe(0);
      expect(negative.receipt).toMatchObject({ verdict: "fail", code: "BENCHMARK_SCHEMA_INVALID" });
      expect(missingImport.exitCode).toBe(0);
      expect(missingImport.receipt).toMatchObject({ verdict: "blocked", code: "operator_not_supplied" });
      expect(missingCuration.exitCode).toBe(0);
      expect(missingCuration.receipt).toMatchObject({ verdict: "blocked", code: "operator_not_supplied" });
    } finally {
      await Promise.all([rm(negative.output, { recursive: true, force: true }), rm(missingImport.output, { recursive: true, force: true }), rm(missingCuration.output, { recursive: true, force: true })]);
    }
  });
});

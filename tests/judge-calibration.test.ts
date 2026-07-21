import { describe, expect, it } from "vitest";
import { buildCalibrationReport, calibrationReportSchema } from "../lib/judge/calibration";

const profile = process.env.BOMTI_BENCHMARK_PROFILE;

describe("BOM-014 calibration report", () => {
  it.runIf(profile === "metric-formulas-missing-ties")("keeps exact numerator, denominator, and missing values for ties, abstains, and incomplete records", () => {
    const report = buildCalibrationReport([
      {
        pairId: "pair-1",
        humanChoice: "left",
        judgeChoice: "left",
        evaluatorChoices: ["left", "left"],
        descriptor: "밤티 거의 없음",
        escalated: false,
        failureCode: null,
        usefulness: 5
      },
      {
        pairId: "pair-2",
        humanChoice: "right",
        judgeChoice: "left",
        evaluatorChoices: ["right", "left"],
        descriptor: "살짝 밤티",
        escalated: true,
        failureCode: "PROVIDER_UNAVAILABLE",
        usefulness: 2
      },
      {
        pairId: "pair-3",
        humanChoice: "tie",
        judgeChoice: "tie",
        evaluatorChoices: ["tie", "abstain"],
        descriptor: null,
        escalated: true,
        failureCode: null,
        usefulness: null
      },
      {
        pairId: "pair-4",
        humanChoice: null,
        judgeChoice: "right",
        evaluatorChoices: [],
        descriptor: "꽤 밤티",
        escalated: false,
        failureCode: "PROVIDER_OUTPUT_INVALID",
        usefulness: 4
      }
    ]);

    expect(calibrationReportSchema.parse(report)).toEqual(report);
    expect(report.pairwiseAgreement).toEqual({ numerator: 2, denominator: 3, missing: 1 });
    expect(report.evaluatorDisagreement).toEqual({ numerator: 1, denominator: 2, missing: 2 });
    expect(report.descriptorDistribution).toMatchObject({ denominator: 3, missing: 1 });
    expect(report.escalationRate).toEqual({ numerator: 2, denominator: 4, missing: 0 });
    expect(report.failureCategories).toEqual({
      denominator: 4,
      missing: 0,
      counts: { PROVIDER_UNAVAILABLE: 1, PROVIDER_OUTPUT_INVALID: 1 }
    });
    expect(report.usefulness).toEqual({ positive: 2, denominator: 3, missing: 1, total: 11 });
  });
});

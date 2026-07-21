import { z } from "zod";
const descriptors = ["밤티 거의 없음", "살짝 밤티", "꽤 밤티", "밤티 그 자체"] as const;

export const calibrationChoiceSchema = z.enum(["left", "right", "tie", "abstain"]);
export type CalibrationChoice = z.infer<typeof calibrationChoiceSchema>;

const descriptorSchema = z.enum(descriptors);
const calibrationRecordSchema = z
  .object({
    pairId: z.string().min(1).max(120),
    humanChoice: calibrationChoiceSchema.nullable(),
    judgeChoice: calibrationChoiceSchema.nullable(),
    evaluatorChoices: z.array(calibrationChoiceSchema).max(3),
    descriptor: descriptorSchema.nullable(),
    escalated: z.boolean(),
    failureCode: z.string().min(1).max(120).nullable(),
    usefulness: z.number().int().min(1).max(5).nullable()
  })
  .strict();

export const calibrationInputSchema = z
  .array(calibrationRecordSchema)
  .min(1)
  .superRefine((records, context) => {
    const ids = records.map((record) => record.pairId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate calibration pair" });
    }
  });
export type CalibrationRecord = z.infer<typeof calibrationRecordSchema>;

const ratioSchema = z.object({ numerator: z.number().int().nonnegative(), denominator: z.number().int().nonnegative(), missing: z.number().int().nonnegative() }).strict();

export const calibrationReportSchema = z
  .object({
    contractVersion: z.literal("bomti_calibration_v1"),
    recordCount: z.number().int().positive(),
    pairwiseAgreement: ratioSchema,
    evaluatorDisagreement: ratioSchema,
    descriptorDistribution: z.object({ denominator: z.number().int().nonnegative(), missing: z.number().int().nonnegative(), counts: z.record(z.number().int().nonnegative()) }).strict(),
    escalationRate: ratioSchema,
    failureCategories: z.object({ denominator: z.number().int().nonnegative(), missing: z.number().int().nonnegative(), counts: z.record(z.number().int().nonnegative()) }).strict(),
    usefulness: z.object({ positive: z.number().int().nonnegative(), denominator: z.number().int().nonnegative(), missing: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).strict()
  })
  .strict();
export type CalibrationReport = z.infer<typeof calibrationReportSchema>;

function isObservedChoice(choice: CalibrationChoice | null): choice is Exclude<CalibrationChoice, "abstain"> {
  return choice !== null && choice !== "abstain";
}

function emptyDescriptorCounts(): Record<string, number> {
  return Object.fromEntries(descriptorSchema.options.map((descriptor) => [descriptor, 0]));
}

export function buildCalibrationReport(source: unknown): CalibrationReport {
  const records = calibrationInputSchema.parse(source) as readonly CalibrationRecord[];
  const agreementRows = records.filter((record) => isObservedChoice(record.humanChoice) && isObservedChoice(record.judgeChoice));
  const evaluatorRows = records.filter((record) => record.evaluatorChoices.filter(isObservedChoice).length >= 2);
  const descriptorCounts = emptyDescriptorCounts();
  const failureCounts: Record<string, number> = {};
  let agreementNumerator = 0;
  let disagreementNumerator = 0;
  let descriptorDenominator = 0;
  let usefulnessTotal = 0;
  let usefulnessPositive = 0;
  let usefulnessDenominator = 0;

  for (const record of agreementRows) {
    if (record.humanChoice === record.judgeChoice) agreementNumerator += 1;
  }
  for (const record of evaluatorRows) {
    const choices = new Set(record.evaluatorChoices.filter(isObservedChoice));
    if (choices.size > 1) disagreementNumerator += 1;
  }
  for (const record of records) {
    if (record.descriptor) {
      descriptorCounts[record.descriptor] += 1;
      descriptorDenominator += 1;
    }
    if (record.failureCode) failureCounts[record.failureCode] = (failureCounts[record.failureCode] ?? 0) + 1;
    if (record.usefulness !== null) {
      usefulnessDenominator += 1;
      usefulnessTotal += record.usefulness;
      if (record.usefulness >= 4) usefulnessPositive += 1;
    }
  }

  return calibrationReportSchema.parse({
    contractVersion: "bomti_calibration_v1",
    recordCount: records.length,
    pairwiseAgreement: {
      numerator: agreementNumerator,
      denominator: agreementRows.length,
      missing: records.length - agreementRows.length
    },
    evaluatorDisagreement: {
      numerator: disagreementNumerator,
      denominator: evaluatorRows.length,
      missing: records.length - evaluatorRows.length
    },
    descriptorDistribution: {
      denominator: descriptorDenominator,
      missing: records.length - descriptorDenominator,
      counts: descriptorCounts
    },
    escalationRate: {
      numerator: records.filter((record) => record.escalated).length,
      denominator: records.length,
      missing: 0
    },
    failureCategories: {
      denominator: records.length,
      missing: 0,
      counts: failureCounts
    },
    usefulness: {
      positive: usefulnessPositive,
      denominator: usefulnessDenominator,
      missing: records.length - usefulnessDenominator,
      total: usefulnessTotal
    }
  });
}

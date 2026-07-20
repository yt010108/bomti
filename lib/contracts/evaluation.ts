import { z } from "zod";
import { codePointLength, normalizeText, segmentAnswer } from "./text";

export type EvaluationAudience = "guest" | "authenticated";

export type EvaluationInputErrorCode =
  | "INPUT_INVALID"
  | "QUESTION_TOO_SHORT"
  | "QUESTION_TOO_LONG"
  | "ANSWER_TOO_SHORT"
  | "ANSWER_TOO_LONG"
  | "TARGETROLE_TOO_SHORT"
  | "TARGETROLE_TOO_LONG"
  | "JOBCOMPANYCONTEXT_TOO_SHORT"
  | "JOBCOMPANYCONTEXT_TOO_LONG"
  | "EXPERIENCEEVIDENCE_TOO_SHORT"
  | "EXPERIENCEEVIDENCE_TOO_LONG";

type FieldBound = {
  readonly minimum: number;
  readonly maximum: number;
  readonly tooShort: EvaluationInputErrorCode;
  readonly tooLong: EvaluationInputErrorCode;
};

const bounds = {
  question: { minimum: 1, maximum: 1200, tooShort: "QUESTION_TOO_SHORT", tooLong: "QUESTION_TOO_LONG" },
  targetRole: { minimum: 1, maximum: 120, tooShort: "TARGETROLE_TOO_SHORT", tooLong: "TARGETROLE_TOO_LONG" },
  jobCompanyContext: {
    minimum: 1,
    maximum: 5000,
    tooShort: "JOBCOMPANYCONTEXT_TOO_SHORT",
    tooLong: "JOBCOMPANYCONTEXT_TOO_LONG"
  },
  experienceEvidence: {
    minimum: 0,
    maximum: 6000,
    tooShort: "EXPERIENCEEVIDENCE_TOO_SHORT",
    tooLong: "EXPERIENCEEVIDENCE_TOO_LONG"
  }
} as const satisfies Record<Exclude<keyof EvaluationInput, "answer">, FieldBound>;

export class EvaluationInputError extends Error {
  readonly name = "EvaluationInputError";

  constructor(readonly code: EvaluationInputErrorCode) {
    super(code);
  }
}

export const rawEvaluationInputSchema = z
  .object({
    question: z.string(),
    answer: z.string(),
    targetRole: z.string(),
    jobCompanyContext: z.string(),
    experienceEvidence: z.string().optional()
  })
  .strict();

export type EvaluationInput = z.infer<typeof rawEvaluationInputSchema>;

export type ValidatedEvaluationInput = Readonly<EvaluationInput> & {
  readonly answerSegments: ReturnType<typeof segmentAnswer>;
};

function fieldIssue(value: string, bound: FieldBound): EvaluationInputErrorCode | null {
  const length = codePointLength(value);
  if (length < bound.minimum) return bound.tooShort;
  if (length > bound.maximum) return bound.tooLong;
  return null;
}

export function validateEvaluationInput(
  source: unknown,
  audience: EvaluationAudience
): ValidatedEvaluationInput {
  const parsed = rawEvaluationInputSchema.safeParse(source);
  if (!parsed.success) throw new EvaluationInputError("INPUT_INVALID");

  const input = {
    question: normalizeText(parsed.data.question),
    answer: normalizeText(parsed.data.answer),
    targetRole: normalizeText(parsed.data.targetRole),
    jobCompanyContext: normalizeText(parsed.data.jobCompanyContext),
    experienceEvidence: parsed.data.experienceEvidence ? normalizeText(parsed.data.experienceEvidence) : undefined
  };

  const answerMax = audience === "guest" ? 1500 : 6000;
  const answerBound: FieldBound = {
    minimum: 1,
    maximum: answerMax,
    tooShort: "ANSWER_TOO_SHORT",
    tooLong: "ANSWER_TOO_LONG"
  };
  const issue = [
    fieldIssue(input.question, bounds.question),
    fieldIssue(input.answer, answerBound),
    fieldIssue(input.targetRole, bounds.targetRole),
    fieldIssue(input.jobCompanyContext, bounds.jobCompanyContext),
    fieldIssue(input.experienceEvidence ?? "", bounds.experienceEvidence)
  ].find((candidate): candidate is EvaluationInputErrorCode => candidate !== null);
  if (issue) throw new EvaluationInputError(issue);

  const answerSegments = segmentAnswer(input.answer);
  if (!answerSegments.length) throw new EvaluationInputError("ANSWER_TOO_SHORT");
  return { ...input, answerSegments };
}

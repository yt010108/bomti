import { z } from "zod";
import { codePointLength, normalizeText, segmentAnswer } from "./text";

export type EvaluationAudience = "guest" | "authenticated";

const bounds = {
  question: [1, 1200],
  targetRole: [1, 120],
  jobCompanyContext: [1, 5000],
  experienceEvidence: [0, 6000]
} as const;

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

export type ValidatedEvaluationInput = EvaluationInput & {
  answerSegments: ReturnType<typeof segmentAnswer>;
};

function fieldIssue(field: keyof EvaluationInput, value: string, min: number, max: number) {
  const length = codePointLength(value);
  if (length < min) return `${field.toUpperCase()}_TOO_SHORT`;
  if (length > max) return `${field.toUpperCase()}_TOO_LONG`;
  return null;
}

export function validateEvaluationInput(
  source: unknown,
  audience: EvaluationAudience
): ValidatedEvaluationInput {
  const parsed = rawEvaluationInputSchema.safeParse(source);
  if (!parsed.success) throw new Error("INPUT_INVALID");

  const input = {
    question: normalizeText(parsed.data.question),
    answer: normalizeText(parsed.data.answer),
    targetRole: normalizeText(parsed.data.targetRole),
    jobCompanyContext: normalizeText(parsed.data.jobCompanyContext),
    experienceEvidence: parsed.data.experienceEvidence ? normalizeText(parsed.data.experienceEvidence) : undefined
  };

  const answerMax = audience === "guest" ? 1500 : 6000;
  const issue = [
    fieldIssue("question", input.question, ...bounds.question),
    fieldIssue("answer", input.answer, 1, answerMax),
    fieldIssue("targetRole", input.targetRole, ...bounds.targetRole),
    fieldIssue("jobCompanyContext", input.jobCompanyContext, ...bounds.jobCompanyContext),
    fieldIssue("experienceEvidence", input.experienceEvidence ?? "", ...bounds.experienceEvidence)
  ].find((candidate): candidate is string => candidate !== null);
  if (issue) throw new Error(issue);

  const answerSegments = segmentAnswer(input.answer);
  if (!answerSegments.length) throw new Error("ANSWER_TOO_SHORT");
  return { ...input, answerSegments };
}

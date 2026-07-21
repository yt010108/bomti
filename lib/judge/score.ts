import type { DeepSeekCandidate } from "../contracts/verdict-candidates";
import { descriptorFor, type GuestProjection } from "../contracts/verdict-normalized";
import { dimensionAggregate } from "./aggregation";

export { dimensionAggregate, dimensionWeights, hybridIndex, requiresSol } from "./aggregation";
export { buildBaselineVerdict, mergeSolVerdict } from "./merge";
export { buildCalibrationReport, calibrationInputSchema, calibrationReportSchema } from "./calibration";
export type {
  CalibrationChoice,
  CalibrationRecord,
  CalibrationReport
} from "./calibration";

export function projectGuest(candidate: DeepSeekCandidate): GuestProjection {
  const finalIndex = Math.round((dimensionAggregate(candidate) + candidate.holisticIndex) / 2);
  return {
    contractVersion: "bomti_index_v1",
    finalIndex,
    descriptor: descriptorFor(finalIndex),
    explanation: candidate.explanation,
    evidence: candidate.evidence.slice(0, 3),
    improvements: candidate.improvements.slice(0, 3)
  };
}

import { sanitizeOutbound, PrivacyBoundaryError } from "./boundaries";

const forbiddenLogKey = /(?:request|provider)(?:Body|Payload|Response)|authorization|token|cookie|rawInput|secret/i;

export type PrivacyLogEntry = Readonly<{
  event: string;
  level: "info" | "warn" | "error";
  data: Record<string, unknown>;
  redactedKinds: readonly string[];
}>;

export function createPrivacyLogger(sink: (entry: PrivacyLogEntry) => void) {
  return function log(event: string, data: Record<string, unknown>, level: PrivacyLogEntry["level"] = "info") {
    if (Object.keys(data).some((key) => forbiddenLogKey.test(key))) {
      throw new PrivacyBoundaryError("PRIVACY_FORBIDDEN_FIELD");
    }
    const sanitized = sanitizeOutbound(data);
    sink(Object.freeze({ event, level, data: sanitized.value, redactedKinds: sanitized.redactedKinds }));
  };
}

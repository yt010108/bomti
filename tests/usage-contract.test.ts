import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  calculateAcceptedCostMicros,
  decryptProviderRequestId,
  encryptProviderRequestId,
  hmacMatchesRotation,
  kstDayBucket,
  resolveGuestIdentity,
  utcMonthBucket
} from "../lib/usage";

const currentSecret = "current-usage-hmac-secret-with-at-least-32-bytes";
const previousSecret = "previous-usage-hmac-secret-with-at-least-32-bytes";

describe("usage identity boundary", () => {
  it("uses only the production ipAddress adapter and hashes IP and cookie separately", () => {
    const request = new Request("https://bomti.test", { headers: { "x-forwarded-for": "198.51.100.99" } });
    const identity = resolveGuestIdentity(request, {
      mode: "production",
      currentSecret,
      previousSecret,
      cookieValue: "secure-browser-cookie",
      ipAddress: () => "203.0.113.8"
    });
    expect(identity.ip.current).not.toBe(identity.cookie.current);
    expect(JSON.stringify(identity)).not.toContain("203.0.113.8");
    expect(JSON.stringify(identity)).not.toContain("secure-browser-cookie");
    expect(identity.ip.previous).not.toBe(identity.ip.current);
    expect(hmacMatchesRotation(identity.ip.current, identity.ip)).toBe(true);
  });

  it("never falls back to forwarded headers and permits injection only in test mode", () => {
    const request = new Request("https://bomti.test", { headers: { "x-forwarded-for": "198.51.100.99" } });
    expect(() => resolveGuestIdentity(request, {
      mode: "production", currentSecret, cookieValue: "cookie"
    })).toThrowError("GUEST_IP_UNAVAILABLE");
    expect(resolveGuestIdentity(request, {
      mode: "test", currentSecret, cookieValue: "cookie", injectedIp: "127.0.0.1"
    }).ip.current).toHaveLength(64);
  });
});

describe("cost and time contracts", () => {
  it("uses deterministic integer half-up rounding without floating point", () => {
    expect(calculateAcceptedCostMicros(1, 1, {
      inputMicrosPerMillion: 250_000n,
      outputMicrosPerMillion: 250_000n
    })).toBe(1n);
    expect(calculateAcceptedCostMicros(1_000_000, 2_000_000, {
      inputMicrosPerMillion: 3n,
      outputMicrosPerMillion: 7n
    })).toBe(17n);
  });

  it("separates the KST daily boundary from the UTC monthly boundary", () => {
    const beforeKstMidnight = new Date("2026-01-31T14:59:59.999Z");
    const afterKstMidnight = new Date("2026-01-31T15:00:00.000Z");
    expect(kstDayBucket(beforeKstMidnight)).toBe("2026-01-31");
    expect(kstDayBucket(afterKstMidnight)).toBe("2026-02-01");
    expect(utcMonthBucket(afterKstMidnight)).toBe("2026-01-01");
    expect(utcMonthBucket(new Date("2026-02-01T00:00:00.000Z"))).toBe("2026-02-01");
  });

  it("encrypts opaque request IDs with authenticated encryption", () => {
    const key = randomBytes(32);
    const encrypted = encryptProviderRequestId("opaque-provider-request-42", key);
    expect(Buffer.from(encrypted).toString("utf8")).not.toContain("opaque-provider-request-42");
    expect(decryptProviderRequestId(encrypted, key)).toBe("opaque-provider-request-42");
    const corrupted = Buffer.from(encrypted);
    corrupted[corrupted.length - 1] ^= 1;
    expect(() => decryptProviderRequestId(corrupted, key)).toThrowError("PROVIDER_REQUEST_ID_CIPHERTEXT_INVALID");
  });
});

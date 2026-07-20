import { createHmac, timingSafeEqual } from "node:crypto";

export type HmacRotation = Readonly<{
  current: string;
  previous?: string;
}>;

export type GuestIdentity = Readonly<{
  ip: HmacRotation;
  cookie: HmacRotation;
}>;

type GuestIdentityContext = Readonly<{
  mode: "production" | "test";
  currentSecret: string;
  previousSecret?: string;
  cookieValue: string;
  ipAddress?: (request: Request) => string | undefined;
  injectedIp?: string;
}>;

function requireSecret(value: string | undefined, code: string): string {
  if (!value || Buffer.byteLength(value) < 32) throw new Error(code);
  return value;
}

export function hashUsageSubject(secret: string, namespace: "ip" | "cookie" | "account", value: string): string {
  requireSecret(secret, "USAGE_HMAC_SECRET_INVALID");
  if (!value) throw new Error("USAGE_SUBJECT_EMPTY");
  return createHmac("sha256", secret).update(`bomti:${namespace}:v1\0${value.normalize("NFC")}`).digest("hex");
}

export function resolveGuestIdentity(request: Request, context: GuestIdentityContext): GuestIdentity {
  const currentSecret = requireSecret(context.currentSecret, "USAGE_HMAC_CURRENT_SECRET_INVALID");
  const ip = context.mode === "production"
    ? context.ipAddress?.(request)
    : context.injectedIp;
  if (!ip) throw new Error("GUEST_IP_UNAVAILABLE");
  if (!context.cookieValue) throw new Error("GUEST_COOKIE_UNAVAILABLE");

  const previousSecret = context.previousSecret;
  return Object.freeze({
    ip: Object.freeze({
      current: hashUsageSubject(currentSecret, "ip", ip),
      previous: previousSecret ? hashUsageSubject(previousSecret, "ip", ip) : undefined
    }),
    cookie: Object.freeze({
      current: hashUsageSubject(currentSecret, "cookie", context.cookieValue),
      previous: previousSecret ? hashUsageSubject(previousSecret, "cookie", context.cookieValue) : undefined
    })
  });
}

export function hmacMatchesRotation(candidate: string, rotation: HmacRotation): boolean {
  return [rotation.current, rotation.previous].filter((value): value is string => Boolean(value)).some((value) => {
    const left = Buffer.from(candidate, "utf8");
    const right = Buffer.from(value, "utf8");
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

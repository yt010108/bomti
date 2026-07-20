export const requiredRuntimeEnvironment = ["SUPABASE_URL", "SUPABASE_ANON_KEY"] as const;

export type RequiredRuntimeEnvironment = (typeof requiredRuntimeEnvironment)[number];

export type EnvironmentCheck =
  | { ok: true }
  | { ok: false; code: `ENV_MISSING:${RequiredRuntimeEnvironment}` };

export function validateRuntimeEnvironment(
  source: Record<string, string | undefined> = process.env
): EnvironmentCheck {
  for (const name of requiredRuntimeEnvironment) {
    if (!source[name]?.trim()) {
      return { ok: false, code: `ENV_MISSING:${name}` };
    }
  }

  return { ok: true };
}

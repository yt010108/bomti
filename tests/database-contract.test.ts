import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nextDeletionJobUpdate } from "../lib/database/deletion";

const root = process.cwd();
const migrationPath = path.join(root, "supabase", "migrations", "20260720000000_bomti_persistence.sql");
const generatedTypesPath = path.join(root, "lib", "database", "generated.types.ts");
const migration = readFileSync(migrationPath, "utf8");
const generatedTypes = readFileSync(generatedTypesPath, "utf8");

function schemaHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("Supabase persistence contract", () => {
  it("replaces the inert SQLite draft with one migration and a current generated type snapshot", () => {
    expect(existsSync(path.join(root, "prisma", "schema.prisma"))).toBe(false);
    expect(migration).toContain("create table public.evaluations");
    expect(migration).toContain("create table public.provider_reconciliation");
    expect(migration).toContain("create table public.account_deletion_jobs");
    expect(generatedTypes).toContain(`schema-sha256: ${schemaHash(migration)}`);
  });

  it("retains exactly the linkable data needed for ownership and deletes it by evaluation", () => {
    for (const table of ["consent_records", "evaluations", "judge_runs", "usefulness_feedback"]) {
      expect(migration).toContain(`create table public.${table}`);
    }
    expect(migration).toContain("evaluation_id uuid references public.evaluations(id) on delete cascade");
    expect(migration).toContain("evaluation_id uuid not null references public.evaluations(id) on delete cascade");
    expect(migration).toContain("before delete on public.evaluations");
    expect(migration).toContain("aggregate_judge_cost_before_evaluation_delete");
    expect(migration).not.toMatch(/input_text|raw_input|answer_content|provider_response_text/i);
  });

  it("enforces owner-only history access and denies browser access to server-only stores", () => {
    expect(migration).toContain("alter table public.evaluations enable row level security");
    expect(migration).toContain('create policy "evaluation owner can list own history"');
    expect(migration).toContain('create policy "evaluation owner can delete own history"');
    expect(migration).toContain("using ((select auth.uid()) = owner_id)");
    expect(migration).toContain("revoke all on public.budget_ledger, public.provider_reconciliation");
    expect(migration).toContain("public.benchmark_pairs, public.benchmark_ratings, public.benchmark_usefulness");
  });

  it("keeps benchmark rows irreversible and deletion jobs free of retained credentials after auth deletion", () => {
    const benchmarkSlice = migration.slice(migration.indexOf("create table public.benchmark_records"), migration.indexOf("create index evaluations_owner_created_idx"));
    expect(benchmarkSlice).not.toMatch(/owner_id|evaluation_id|source_key|relink/i);
    expect(migration).toContain("ACCOUNT_DELETION_AUTH_CIPHERTEXT_REQUIRED");
    expect(migration).toContain("ACCOUNT_DELETION_AUTH_CIPHERTEXT_FORBIDDEN");
    expect(generatedTypes).toContain("encrypted_auth_user_id: string | null");
  });

  it("pins the quota, reconciliation, and terminal-state enums", () => {
    expect(migration).toContain("'failed_needs_adjudication', 'ambiguous'");
    expect(migration).toContain("'guest_ip', 'guest_cookie', 'guest_global', 'account', 'sol'");
    expect(migration).toContain("'unresolved_reserved', 'accepted_settled', 'rejected_released'");
    expect(migration).toContain("'requested', 'sessions_revoked', 'app_data_deleted', 'auth_user_deleted', 'complete'");
  });

  it("advances the server deletion saga without retaining an auth identifier after deletion", () => {
    const encryptedAuthId = new Uint8Array([1, 2, 3]);
    expect(nextDeletionJobUpdate("requested", encryptedAuthId).state).toBe("sessions_revoked");
    expect(nextDeletionJobUpdate("app_data_deleted", encryptedAuthId)).toEqual({
      state: "auth_user_deleted",
      encryptedAuthUserId: null
    });
    expect(() => nextDeletionJobUpdate("sessions_revoked", null)).toThrow("ACCOUNT_DELETION_AUTH_CIPHERTEXT_REQUIRED");
    expect(() => nextDeletionJobUpdate("complete", null)).toThrow("ACCOUNT_DELETION_ALREADY_COMPLETE");
  });
});

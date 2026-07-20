// Generated database snapshot from supabase/migrations/20260720000000_bomti_persistence.sql.
// schema-sha256: acdcd9b6af01bc9e0378996b9f39945bf1e8724a9cba77bfc99f9951e3afb71a
// Regenerate with `supabase gen types typescript --local` when a local Supabase
// stack is available; database-contract.test.ts rejects a stale schema hash.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Insert<Row> = Partial<Row>;

export type Database = {
  public: {
    Tables: {
      evaluations: {
        Row: {
          id: string;
          owner_id: string;
          campaign_id: string;
          idempotency_hash: string;
          status: Database["public"]["Enums"]["evaluation_status"];
          pseudonymized_segments: Json;
          verdict: Json | null;
          anonymization_version: string;
          created_at: string;
          completed_at: string | null;
        };
        Insert: Insert<Database["public"]["Tables"]["evaluations"]["Row"]> & { owner_id: string; campaign_id: string; idempotency_hash: string; status: Database["public"]["Enums"]["evaluation_status"]; pseudonymized_segments: Json; anonymization_version: string };
        Update: Partial<Database["public"]["Tables"]["evaluations"]["Insert"]>;
      };
      consent_records: {
        Row: { id: string; owner_id: string | null; guest_ip_hmac: string | null; guest_cookie_hmac: string | null; evaluation_id: string | null; consent_version: string; provider_id: string; purposes: string[]; created_at: string; expires_at: string | null };
        Insert: Insert<Database["public"]["Tables"]["consent_records"]["Row"]> & { consent_version: string; provider_id: string; purposes: string[] };
        Update: Partial<Database["public"]["Tables"]["consent_records"]["Insert"]>;
      };
      judge_runs: {
        Row: { id: string; evaluation_id: string; provider_role: Database["public"]["Enums"]["provider_role"]; provider_id: string; model_id: string; request_id_hash: string | null; candidate: Json | null; input_tokens: number; output_tokens: number; accepted_cost_micros: number; status: Database["public"]["Enums"]["judge_run_status"]; created_at: string };
        Insert: Insert<Database["public"]["Tables"]["judge_runs"]["Row"]> & { evaluation_id: string; provider_role: Database["public"]["Enums"]["provider_role"]; provider_id: string; model_id: string; status: Database["public"]["Enums"]["judge_run_status"] };
        Update: Partial<Database["public"]["Tables"]["judge_runs"]["Insert"]>;
      };
      usefulness_feedback: {
        Row: { id: string; evaluation_id: string; rating: number; reason_code: Database["public"]["Enums"]["feedback_reason_code"]; created_at: string };
        Insert: Insert<Database["public"]["Tables"]["usefulness_feedback"]["Row"]> & { evaluation_id: string; rating: number; reason_code: Database["public"]["Enums"]["feedback_reason_code"] };
        Update: Partial<Database["public"]["Tables"]["usefulness_feedback"]["Insert"]>;
      };
      usage_counters: {
        Row: { id: string; subject_kind: Database["public"]["Enums"]["usage_subject_kind"]; subject_hmac: string; campaign_or_bucket: string; state: Database["public"]["Enums"]["usage_state"]; count: number; reservation_expires_at: string | null; created_at: string; updated_at: string };
        Insert: Insert<Database["public"]["Tables"]["usage_counters"]["Row"]> & { subject_kind: Database["public"]["Enums"]["usage_subject_kind"]; subject_hmac: string; campaign_or_bucket: string; state: Database["public"]["Enums"]["usage_state"] };
        Update: Partial<Database["public"]["Tables"]["usage_counters"]["Insert"]>;
      };
      budget_ledger: {
        Row: { provider_id: string; model_id: string; utc_month: string; pricing_version: string; reserved_micros: number; accepted_micros: number; updated_at: string };
        Insert: Insert<Database["public"]["Tables"]["budget_ledger"]["Row"]> & { provider_id: string; model_id: string; utc_month: string; pricing_version: string };
        Update: Partial<Database["public"]["Tables"]["budget_ledger"]["Insert"]>;
      };
      provider_reconciliation: {
        Row: { id: string; provider_id: string; model_id: string; pricing_version: string; encrypted_request_id: string | null; encrypted_client_correlation_id: string; utc_month: string; reserved_micros: number; state: Database["public"]["Enums"]["reconciliation_state"]; resolution_source: Database["public"]["Enums"]["reconciliation_resolution_source"] | null; accepted_cost_micros: number | null; created_at: string; alerted_at: string | null; settled_at: string | null };
        Insert: Insert<Database["public"]["Tables"]["provider_reconciliation"]["Row"]> & { provider_id: string; model_id: string; pricing_version: string; encrypted_client_correlation_id: string; utc_month: string; reserved_micros: number; state: Database["public"]["Enums"]["reconciliation_state"] };
        Update: Partial<Database["public"]["Tables"]["provider_reconciliation"]["Insert"]>;
      };
      account_deletion_jobs: {
        Row: { id: string; subject_hmac: string; encrypted_auth_user_id: string | null; state: Database["public"]["Enums"]["account_deletion_state"]; attempts: number; next_retry_at: string; block_until: string; created_at: string };
        Insert: Insert<Database["public"]["Tables"]["account_deletion_jobs"]["Row"]> & { subject_hmac: string; state: Database["public"]["Enums"]["account_deletion_state"]; block_until: string };
        Update: Partial<Database["public"]["Tables"]["account_deletion_jobs"]["Insert"]>;
      };
      guest_attempts: {
        Row: { idempotency_hash: string; ip_hmac: string; cookie_hmac: string; day_bucket: string; state: Database["public"]["Enums"]["evaluation_status"]; reservation_expires_at: string | null; created_at: string; updated_at: string };
        Insert: Insert<Database["public"]["Tables"]["guest_attempts"]["Row"]> & { idempotency_hash: string; ip_hmac: string; cookie_hmac: string; day_bucket: string; state: Database["public"]["Enums"]["evaluation_status"] };
        Update: Partial<Database["public"]["Tables"]["guest_attempts"]["Insert"]>;
      };
      benchmark_records: {
        Row: { record_id: string; group_id: string; question_class: Database["public"]["Enums"]["question_class"]; target_role_class: Database["public"]["Enums"]["target_role_class"]; answer_segments: Json; verdict: Json; anonymization_version: string; provenance_class: Database["public"]["Enums"]["benchmark_provenance_class"]; review_status: Database["public"]["Enums"]["review_status"]; month_bucket: string };
        Insert: Insert<Database["public"]["Tables"]["benchmark_records"]["Row"]> & { group_id: string; question_class: Database["public"]["Enums"]["question_class"]; target_role_class: Database["public"]["Enums"]["target_role_class"]; answer_segments: Json; verdict: Json; anonymization_version: string; provenance_class: Database["public"]["Enums"]["benchmark_provenance_class"]; review_status: Database["public"]["Enums"]["review_status"]; month_bucket: string };
        Update: Partial<Database["public"]["Tables"]["benchmark_records"]["Insert"]>;
      };
      benchmark_pairs: {
        Row: { pair_id: string; left_record_id: string; right_record_id: string; group_id: string; system_choice: Exclude<Database["public"]["Enums"]["benchmark_choice"], "abstain"> };
        Insert: Insert<Database["public"]["Tables"]["benchmark_pairs"]["Row"]> & { left_record_id: string; right_record_id: string; group_id: string; system_choice: Exclude<Database["public"]["Enums"]["benchmark_choice"], "abstain"> };
        Update: Partial<Database["public"]["Tables"]["benchmark_pairs"]["Insert"]>;
      };
      benchmark_ratings: {
        Row: { id: string; pair_id: string; rater_alias: string; choice: Database["public"]["Enums"]["benchmark_choice"]; rationale_codes: string[] };
        Insert: Insert<Database["public"]["Tables"]["benchmark_ratings"]["Row"]> & { pair_id: string; rater_alias: string; choice: Database["public"]["Enums"]["benchmark_choice"] };
        Update: Partial<Database["public"]["Tables"]["benchmark_ratings"]["Insert"]>;
      };
      benchmark_usefulness: {
        Row: { id: string; rating: number; reason_code: Database["public"]["Enums"]["feedback_reason_code"]; month_bucket: string };
        Insert: Insert<Database["public"]["Tables"]["benchmark_usefulness"]["Row"]> & { rating: number; reason_code: Database["public"]["Enums"]["feedback_reason_code"]; month_bucket: string };
        Update: Partial<Database["public"]["Tables"]["benchmark_usefulness"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      evaluation_status: 'reserved' | 'in_flight_before_acceptance' | 'accepted' | 'completed' | 'validation_failed' | 'consent_required' | 'quota_exhausted' | 'budget_disabled' | 'provider_unavailable' | 'provider_output_invalid' | 'cancelled_before_acceptance' | 'failed_refunded' | 'failed_needs_adjudication' | 'ambiguous';
      provider_role: 'guest' | 'luna' | 'terra' | 'sol';
      judge_run_status: 'reserved' | 'accepted' | 'completed' | 'rejected_before_acceptance' | 'ambiguous' | 'invalid';
      usage_subject_kind: 'guest_ip' | 'guest_cookie' | 'guest_global' | 'account' | 'sol';
      usage_state: 'reserved' | 'consumed' | 'refunded' | 'expired' | 'ambiguous';
      reconciliation_state: 'unresolved_reserved' | 'accepted_settled' | 'rejected_released';
      reconciliation_resolution_source: 'provider_request_lookup' | 'client_correlation_lookup' | 'operator_verified_accepted' | 'operator_verified_rejected';
      account_deletion_state: 'requested' | 'sessions_revoked' | 'app_data_deleted' | 'auth_user_deleted' | 'complete';
      review_status: 'synthetic' | 'pending_review' | 'reviewed';
      benchmark_choice: 'left' | 'right' | 'tie' | 'abstain';
      question_class: 'motivation' | 'experience' | 'competency' | 'problem_solving' | 'collaboration' | 'growth_plan' | 'other_generalized';
      target_role_class: 'software_engineering' | 'data_ai' | 'design' | 'product_business' | 'marketing_sales' | 'operations_support' | 'other_generalized';
      benchmark_provenance_class: 'synthetic' | 'luna_terra' | 'luna_terra_sol';
      feedback_reason_code: 'clear_explanation' | 'useful_evidence' | 'actionable_improvement' | 'score_felt_wrong' | 'evidence_felt_wrong' | 'not_actionable';
    };
    CompositeTypes: Record<string, never>;
  };
};

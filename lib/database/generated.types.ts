export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      account_deletion_jobs: {
        Row: {
          attempts: number
          block_until: string
          created_at: string
          encrypted_auth_user_id: string | null
          id: string
          next_retry_at: string
          state: Database["public"]["Enums"]["account_deletion_state"]
          subject_hmac: string | null
        }
        Insert: {
          attempts?: number
          block_until: string
          created_at?: string
          encrypted_auth_user_id?: string | null
          id?: string
          next_retry_at?: string
          state: Database["public"]["Enums"]["account_deletion_state"]
          subject_hmac?: string | null
        }
        Update: {
          attempts?: number
          block_until?: string
          created_at?: string
          encrypted_auth_user_id?: string | null
          id?: string
          next_retry_at?: string
          state?: Database["public"]["Enums"]["account_deletion_state"]
          subject_hmac?: string | null
        }
        Relationships: []
      }
      benchmark_pairs: {
        Row: {
          group_id: string
          left_record_id: string
          pair_id: string
          right_record_id: string
          system_choice: Database["public"]["Enums"]["benchmark_choice"]
        }
        Insert: {
          group_id: string
          left_record_id: string
          pair_id?: string
          right_record_id: string
          system_choice: Database["public"]["Enums"]["benchmark_choice"]
        }
        Update: {
          group_id?: string
          left_record_id?: string
          pair_id?: string
          right_record_id?: string
          system_choice?: Database["public"]["Enums"]["benchmark_choice"]
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_pairs_left_record_id_group_id_fkey"
            columns: ["left_record_id", "group_id"]
            isOneToOne: false
            referencedRelation: "benchmark_records"
            referencedColumns: ["record_id", "group_id"]
          },
          {
            foreignKeyName: "benchmark_pairs_right_record_id_group_id_fkey"
            columns: ["right_record_id", "group_id"]
            isOneToOne: false
            referencedRelation: "benchmark_records"
            referencedColumns: ["record_id", "group_id"]
          },
        ]
      }
      benchmark_ratings: {
        Row: {
          choice: Database["public"]["Enums"]["benchmark_choice"]
          id: string
          pair_id: string
          rater_alias: string
          rationale_codes: string[]
        }
        Insert: {
          choice: Database["public"]["Enums"]["benchmark_choice"]
          id?: string
          pair_id: string
          rater_alias: string
          rationale_codes?: string[]
        }
        Update: {
          choice?: Database["public"]["Enums"]["benchmark_choice"]
          id?: string
          pair_id?: string
          rater_alias?: string
          rationale_codes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_ratings_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "benchmark_pairs"
            referencedColumns: ["pair_id"]
          },
        ]
      }
      benchmark_records: {
        Row: {
          anonymization_version: string
          answer_segments: Json
          group_id: string
          month_bucket: string
          provenance_class: Database["public"]["Enums"]["benchmark_provenance_class"]
          question_class: Database["public"]["Enums"]["question_class"]
          record_id: string
          review_status: Database["public"]["Enums"]["review_status"]
          target_role_class: Database["public"]["Enums"]["target_role_class"]
          verdict: Json
        }
        Insert: {
          anonymization_version: string
          answer_segments: Json
          group_id: string
          month_bucket: string
          provenance_class: Database["public"]["Enums"]["benchmark_provenance_class"]
          question_class: Database["public"]["Enums"]["question_class"]
          record_id?: string
          review_status: Database["public"]["Enums"]["review_status"]
          target_role_class: Database["public"]["Enums"]["target_role_class"]
          verdict: Json
        }
        Update: {
          anonymization_version?: string
          answer_segments?: Json
          group_id?: string
          month_bucket?: string
          provenance_class?: Database["public"]["Enums"]["benchmark_provenance_class"]
          question_class?: Database["public"]["Enums"]["question_class"]
          record_id?: string
          review_status?: Database["public"]["Enums"]["review_status"]
          target_role_class?: Database["public"]["Enums"]["target_role_class"]
          verdict?: Json
        }
        Relationships: []
      }
      benchmark_usefulness: {
        Row: {
          id: string
          month_bucket: string
          rating: number
          reason_code: Database["public"]["Enums"]["feedback_reason_code"]
        }
        Insert: {
          id?: string
          month_bucket: string
          rating: number
          reason_code: Database["public"]["Enums"]["feedback_reason_code"]
        }
        Update: {
          id?: string
          month_bucket?: string
          rating?: number
          reason_code?: Database["public"]["Enums"]["feedback_reason_code"]
        }
        Relationships: []
      }
      budget_ledger: {
        Row: {
          accepted_micros: number
          model_id: string
          pricing_version: string
          provider_id: string
          reserved_micros: number
          updated_at: string
          utc_month: string
        }
        Insert: {
          accepted_micros?: number
          model_id: string
          pricing_version: string
          provider_id: string
          reserved_micros?: number
          updated_at?: string
          utc_month: string
        }
        Update: {
          accepted_micros?: number
          model_id?: string
          pricing_version?: string
          provider_id?: string
          reserved_micros?: number
          updated_at?: string
          utc_month?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          consent_version: string
          created_at: string
          evaluation_id: string | null
          expires_at: string | null
          guest_cookie_hmac: string | null
          guest_ip_hmac: string | null
          id: string
          owner_id: string | null
          provider_id: string
          purposes: string[]
        }
        Insert: {
          consent_version: string
          created_at?: string
          evaluation_id?: string | null
          expires_at?: string | null
          guest_cookie_hmac?: string | null
          guest_ip_hmac?: string | null
          id?: string
          owner_id?: string | null
          provider_id: string
          purposes: string[]
        }
        Update: {
          consent_version?: string
          created_at?: string
          evaluation_id?: string | null
          expires_at?: string | null
          guest_cookie_hmac?: string | null
          guest_ip_hmac?: string | null
          id?: string
          owner_id?: string | null
          provider_id?: string
          purposes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          anonymization_version: string
          campaign_id: string
          completed_at: string | null
          created_at: string
          id: string
          idempotency_hash: string
          owner_id: string
          pseudonymized_segments: Json
          status: Database["public"]["Enums"]["evaluation_status"]
          verdict: Json | null
        }
        Insert: {
          anonymization_version: string
          campaign_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_hash: string
          owner_id: string
          pseudonymized_segments: Json
          status: Database["public"]["Enums"]["evaluation_status"]
          verdict?: Json | null
        }
        Update: {
          anonymization_version?: string
          campaign_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_hash?: string
          owner_id?: string
          pseudonymized_segments?: Json
          status?: Database["public"]["Enums"]["evaluation_status"]
          verdict?: Json | null
        }
        Relationships: []
      }
      guest_attempts: {
        Row: {
          cookie_hmac: string
          created_at: string
          day_bucket: string
          idempotency_hash: string
          ip_hmac: string
          reservation_expires_at: string | null
          state: Database["public"]["Enums"]["evaluation_status"]
          updated_at: string
        }
        Insert: {
          cookie_hmac: string
          created_at?: string
          day_bucket: string
          idempotency_hash: string
          ip_hmac: string
          reservation_expires_at?: string | null
          state: Database["public"]["Enums"]["evaluation_status"]
          updated_at?: string
        }
        Update: {
          cookie_hmac?: string
          created_at?: string
          day_bucket?: string
          idempotency_hash?: string
          ip_hmac?: string
          reservation_expires_at?: string | null
          state?: Database["public"]["Enums"]["evaluation_status"]
          updated_at?: string
        }
        Relationships: []
      }
      judge_runs: {
        Row: {
          accepted_cost_micros: number
          candidate: Json | null
          created_at: string
          evaluation_id: string
          id: string
          input_tokens: number
          model_id: string
          output_tokens: number
          provider_id: string
          provider_role: Database["public"]["Enums"]["provider_role"]
          request_id_hash: string | null
          status: Database["public"]["Enums"]["judge_run_status"]
        }
        Insert: {
          accepted_cost_micros?: number
          candidate?: Json | null
          created_at?: string
          evaluation_id: string
          id?: string
          input_tokens?: number
          model_id: string
          output_tokens?: number
          provider_id: string
          provider_role: Database["public"]["Enums"]["provider_role"]
          request_id_hash?: string | null
          status: Database["public"]["Enums"]["judge_run_status"]
        }
        Update: {
          accepted_cost_micros?: number
          candidate?: Json | null
          created_at?: string
          evaluation_id?: string
          id?: string
          input_tokens?: number
          model_id?: string
          output_tokens?: number
          provider_id?: string
          provider_role?: Database["public"]["Enums"]["provider_role"]
          request_id_hash?: string | null
          status?: Database["public"]["Enums"]["judge_run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "judge_runs_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_reconciliation: {
        Row: {
          accepted_cost_micros: number | null
          alerted_at: string | null
          created_at: string
          encrypted_client_correlation_id: string
          encrypted_request_id: string | null
          id: string
          model_id: string
          pricing_version: string
          provider_id: string
          reserved_micros: number
          resolution_source:
            | Database["public"]["Enums"]["reconciliation_resolution_source"]
            | null
          settled_at: string | null
          state: Database["public"]["Enums"]["reconciliation_state"]
          utc_month: string
        }
        Insert: {
          accepted_cost_micros?: number | null
          alerted_at?: string | null
          created_at?: string
          encrypted_client_correlation_id: string
          encrypted_request_id?: string | null
          id: string
          model_id: string
          pricing_version: string
          provider_id: string
          reserved_micros: number
          resolution_source?:
            | Database["public"]["Enums"]["reconciliation_resolution_source"]
            | null
          settled_at?: string | null
          state: Database["public"]["Enums"]["reconciliation_state"]
          utc_month: string
        }
        Update: {
          accepted_cost_micros?: number | null
          alerted_at?: string | null
          created_at?: string
          encrypted_client_correlation_id?: string
          encrypted_request_id?: string | null
          id?: string
          model_id?: string
          pricing_version?: string
          provider_id?: string
          reserved_micros?: number
          resolution_source?:
            | Database["public"]["Enums"]["reconciliation_resolution_source"]
            | null
          settled_at?: string | null
          state?: Database["public"]["Enums"]["reconciliation_state"]
          utc_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_reconciliation_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "judge_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          campaign_or_bucket: string
          count: number
          created_at: string
          id: string
          reservation_expires_at: string | null
          state: Database["public"]["Enums"]["usage_state"]
          subject_hmac: string
          subject_kind: Database["public"]["Enums"]["usage_subject_kind"]
          updated_at: string
        }
        Insert: {
          campaign_or_bucket: string
          count?: number
          created_at?: string
          id?: string
          reservation_expires_at?: string | null
          state: Database["public"]["Enums"]["usage_state"]
          subject_hmac: string
          subject_kind: Database["public"]["Enums"]["usage_subject_kind"]
          updated_at?: string
        }
        Update: {
          campaign_or_bucket?: string
          count?: number
          created_at?: string
          id?: string
          reservation_expires_at?: string | null
          state?: Database["public"]["Enums"]["usage_state"]
          subject_hmac?: string
          subject_kind?: Database["public"]["Enums"]["usage_subject_kind"]
          updated_at?: string
        }
        Relationships: []
      }
      usefulness_feedback: {
        Row: {
          created_at: string
          evaluation_id: string
          id: string
          rating: number
          reason_code: Database["public"]["Enums"]["feedback_reason_code"]
        }
        Insert: {
          created_at?: string
          evaluation_id: string
          id?: string
          rating: number
          reason_code: Database["public"]["Enums"]["feedback_reason_code"]
        }
        Update: {
          created_at?: string
          evaluation_id?: string
          id?: string
          rating?: number
          reason_code?: Database["public"]["Enums"]["feedback_reason_code"]
        }
        Relationships: [
          {
            foreignKeyName: "usefulness_feedback_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_account_deletion_job: {
        Args: {
          expected_state: Database["public"]["Enums"]["account_deletion_state"]
          target_job_id: string
          target_owner_id?: string
        }
        Returns: Database["public"]["Enums"]["account_deletion_state"]
      }
      purge_account_linkable_data: {
        Args: { target_owner_id: string; target_subject_hmac: string }
        Returns: undefined
      }
      purge_expired_account_deletion_jobs: { Args: never; Returns: number }
    }
    Enums: {
      account_deletion_state:
        | "requested"
        | "sessions_revoked"
        | "app_data_deleted"
        | "auth_user_deleted"
        | "complete"
      benchmark_choice: "left" | "right" | "tie" | "abstain"
      benchmark_provenance_class: "synthetic" | "luna_terra" | "luna_terra_sol"
      evaluation_status:
        | "reserved"
        | "in_flight_before_acceptance"
        | "accepted"
        | "completed"
        | "validation_failed"
        | "consent_required"
        | "quota_exhausted"
        | "budget_disabled"
        | "provider_unavailable"
        | "provider_output_invalid"
        | "cancelled_before_acceptance"
        | "failed_refunded"
        | "failed_needs_adjudication"
        | "ambiguous"
      feedback_reason_code:
        | "clear_explanation"
        | "useful_evidence"
        | "actionable_improvement"
        | "score_felt_wrong"
        | "evidence_felt_wrong"
        | "not_actionable"
      judge_run_status:
        | "reserved"
        | "accepted"
        | "completed"
        | "rejected_before_acceptance"
        | "ambiguous"
        | "invalid"
      provider_role: "guest" | "luna" | "terra" | "sol"
      question_class:
        | "motivation"
        | "experience"
        | "competency"
        | "problem_solving"
        | "collaboration"
        | "growth_plan"
        | "other_generalized"
      reconciliation_resolution_source:
        | "provider_request_lookup"
        | "client_correlation_lookup"
        | "operator_verified_accepted"
        | "operator_verified_rejected"
      reconciliation_state:
        | "unresolved_reserved"
        | "accepted_settled"
        | "rejected_released"
      review_status: "synthetic" | "pending_review" | "reviewed"
      target_role_class:
        | "software_engineering"
        | "data_ai"
        | "design"
        | "product_business"
        | "marketing_sales"
        | "operations_support"
        | "other_generalized"
      usage_state:
        | "reserved"
        | "consumed"
        | "refunded"
        | "expired"
        | "ambiguous"
      usage_subject_kind:
        | "guest_ip"
        | "guest_cookie"
        | "guest_global"
        | "account"
        | "sol"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_deletion_state: [
        "requested",
        "sessions_revoked",
        "app_data_deleted",
        "auth_user_deleted",
        "complete",
      ],
      benchmark_choice: ["left", "right", "tie", "abstain"],
      benchmark_provenance_class: ["synthetic", "luna_terra", "luna_terra_sol"],
      evaluation_status: [
        "reserved",
        "in_flight_before_acceptance",
        "accepted",
        "completed",
        "validation_failed",
        "consent_required",
        "quota_exhausted",
        "budget_disabled",
        "provider_unavailable",
        "provider_output_invalid",
        "cancelled_before_acceptance",
        "failed_refunded",
        "failed_needs_adjudication",
        "ambiguous",
      ],
      feedback_reason_code: [
        "clear_explanation",
        "useful_evidence",
        "actionable_improvement",
        "score_felt_wrong",
        "evidence_felt_wrong",
        "not_actionable",
      ],
      judge_run_status: [
        "reserved",
        "accepted",
        "completed",
        "rejected_before_acceptance",
        "ambiguous",
        "invalid",
      ],
      provider_role: ["guest", "luna", "terra", "sol"],
      question_class: [
        "motivation",
        "experience",
        "competency",
        "problem_solving",
        "collaboration",
        "growth_plan",
        "other_generalized",
      ],
      reconciliation_resolution_source: [
        "provider_request_lookup",
        "client_correlation_lookup",
        "operator_verified_accepted",
        "operator_verified_rejected",
      ],
      reconciliation_state: [
        "unresolved_reserved",
        "accepted_settled",
        "rejected_released",
      ],
      review_status: ["synthetic", "pending_review", "reviewed"],
      target_role_class: [
        "software_engineering",
        "data_ai",
        "design",
        "product_business",
        "marketing_sales",
        "operations_support",
        "other_generalized",
      ],
      usage_state: ["reserved", "consumed", "refunded", "expired", "ambiguous"],
      usage_subject_kind: [
        "guest_ip",
        "guest_cookie",
        "guest_global",
        "account",
        "sol",
      ],
    },
  },
} as const

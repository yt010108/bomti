-- Bomti persistence contract (BOM-004, BOM-005, BOM-007, BOM-008, BOM-009,
-- BOM-010, BOM-012). Raw evaluation input must never be inserted here.
create extension if not exists pgcrypto;

create type public.evaluation_status as enum (
  'reserved', 'in_flight_before_acceptance', 'accepted', 'completed',
  'validation_failed', 'consent_required', 'quota_exhausted', 'budget_disabled',
  'provider_unavailable', 'provider_output_invalid', 'cancelled_before_acceptance',
  'failed_refunded', 'failed_needs_adjudication', 'ambiguous'
);
create type public.provider_role as enum ('guest', 'luna', 'terra', 'sol');
create type public.judge_run_status as enum ('reserved', 'accepted', 'completed', 'rejected_before_acceptance', 'ambiguous', 'invalid');
create type public.usage_subject_kind as enum ('guest_ip', 'guest_cookie', 'guest_global', 'account', 'sol');
create type public.usage_state as enum ('reserved', 'consumed', 'refunded', 'expired', 'ambiguous');
create type public.reconciliation_state as enum ('unresolved_reserved', 'accepted_settled', 'rejected_released');
create type public.reconciliation_resolution_source as enum ('provider_request_lookup', 'client_correlation_lookup', 'operator_verified_accepted', 'operator_verified_rejected');
create type public.account_deletion_state as enum ('requested', 'sessions_revoked', 'app_data_deleted', 'auth_user_deleted', 'complete');
create type public.review_status as enum ('synthetic', 'pending_review', 'reviewed');
create type public.benchmark_choice as enum ('left', 'right', 'tie', 'abstain');
create type public.question_class as enum ('motivation', 'experience', 'competency', 'problem_solving', 'collaboration', 'growth_plan', 'other_generalized');
create type public.target_role_class as enum ('software_engineering', 'data_ai', 'design', 'product_business', 'marketing_sales', 'operations_support', 'other_generalized');
create type public.benchmark_provenance_class as enum ('synthetic', 'luna_terra', 'luna_terra_sol');
create type public.feedback_reason_code as enum ('clear_explanation', 'useful_evidence', 'actionable_improvement', 'score_felt_wrong', 'evidence_felt_wrong', 'not_actionable');

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  campaign_id text not null check (char_length(campaign_id) between 1 and 120),
  idempotency_hash text not null check (char_length(idempotency_hash) between 16 and 512),
  status public.evaluation_status not null,
  pseudonymized_segments jsonb not null,
  verdict jsonb,
  anonymization_version text not null check (char_length(anonymization_version) between 1 and 120),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (owner_id, campaign_id, idempotency_hash),
  check ((status = 'completed' and verdict is not null and completed_at is not null) or status <> 'completed'),
  check (jsonb_typeof(pseudonymized_segments) = 'array')
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  guest_ip_hmac text,
  guest_cookie_hmac text,
  evaluation_id uuid references public.evaluations(id) on delete cascade,
  consent_version text not null check (char_length(consent_version) between 1 and 120),
  provider_id text not null check (char_length(provider_id) between 1 and 240),
  purposes text[] not null check (cardinality(purposes) >= 1),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  check (
    (owner_id is not null and guest_ip_hmac is null and guest_cookie_hmac is null and expires_at is null)
    or
    (owner_id is null and guest_ip_hmac is not null and guest_cookie_hmac is not null
      and expires_at is not null and expires_at <= created_at + interval '7 days')
  )
);

create table public.judge_runs (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  provider_role public.provider_role not null,
  provider_id text not null check (char_length(provider_id) between 1 and 240),
  model_id text not null check (char_length(model_id) between 1 and 240),
  request_id_hash text,
  candidate jsonb,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  accepted_cost_micros bigint not null default 0 check (accepted_cost_micros >= 0),
  status public.judge_run_status not null,
  created_at timestamptz not null default now(),
  check (request_id_hash is null or char_length(request_id_hash) between 16 and 512)
);

create table public.usefulness_feedback (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null unique references public.evaluations(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  reason_code public.feedback_reason_code not null,
  created_at timestamptz not null default now()
);

create table public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  subject_kind public.usage_subject_kind not null,
  subject_hmac text not null check (char_length(subject_hmac) between 16 and 512),
  campaign_or_bucket text not null check (char_length(campaign_or_bucket) between 1 and 240),
  state public.usage_state not null,
  count integer not null default 0 check (count >= 0),
  reservation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_kind, subject_hmac, campaign_or_bucket)
);

create table public.budget_ledger (
  provider_id text not null check (char_length(provider_id) between 1 and 240),
  model_id text not null check (char_length(model_id) between 1 and 240),
  utc_month date not null check (utc_month = date_trunc('month', utc_month)::date),
  pricing_version text not null check (char_length(pricing_version) between 1 and 120),
  reserved_micros bigint not null default 0 check (reserved_micros >= 0),
  accepted_micros bigint not null default 0 check (accepted_micros >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider_id, model_id, utc_month, pricing_version)
);

create table public.provider_reconciliation (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null check (char_length(provider_id) between 1 and 240),
  model_id text not null check (char_length(model_id) between 1 and 240),
  pricing_version text not null check (char_length(pricing_version) between 1 and 120),
  encrypted_request_id bytea,
  encrypted_client_correlation_id bytea not null,
  utc_month date not null check (utc_month = date_trunc('month', utc_month)::date),
  reserved_micros bigint not null check (reserved_micros >= 0),
  state public.reconciliation_state not null,
  resolution_source public.reconciliation_resolution_source,
  accepted_cost_micros bigint check (accepted_cost_micros is null or accepted_cost_micros >= 0),
  created_at timestamptz not null default now(),
  alerted_at timestamptz,
  settled_at timestamptz,
  check (octet_length(encrypted_client_correlation_id) > 0),
  check ((state = 'unresolved_reserved' and resolution_source is null and settled_at is null)
    or (state <> 'unresolved_reserved' and resolution_source is not null and settled_at is not null))
);

create table public.account_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  subject_hmac text not null unique check (char_length(subject_hmac) between 16 and 512),
  encrypted_auth_user_id bytea,
  state public.account_deletion_state not null,
  attempts integer not null default 0 check (attempts >= 0),
  next_retry_at timestamptz not null default now(),
  block_until timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.guest_attempts (
  idempotency_hash text primary key check (char_length(idempotency_hash) between 16 and 512),
  ip_hmac text not null check (char_length(ip_hmac) between 16 and 512),
  cookie_hmac text not null check (char_length(cookie_hmac) between 16 and 512),
  day_bucket date not null,
  state public.evaluation_status not null,
  reservation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.benchmark_records (
  record_id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  question_class public.question_class not null,
  target_role_class public.target_role_class not null,
  answer_segments jsonb not null check (jsonb_typeof(answer_segments) = 'array'),
  verdict jsonb not null,
  anonymization_version text not null check (char_length(anonymization_version) between 1 and 120),
  provenance_class public.benchmark_provenance_class not null,
  review_status public.review_status not null,
  month_bucket date not null check (month_bucket = date_trunc('month', month_bucket)::date),
  unique (record_id, group_id)
);

create table public.benchmark_pairs (
  pair_id uuid primary key default gen_random_uuid(),
  left_record_id uuid not null,
  right_record_id uuid not null,
  group_id uuid not null,
  system_choice public.benchmark_choice not null check (system_choice <> 'abstain'),
  unique (left_record_id, right_record_id),
  check (left_record_id <> right_record_id),
  foreign key (left_record_id, group_id) references public.benchmark_records(record_id, group_id),
  foreign key (right_record_id, group_id) references public.benchmark_records(record_id, group_id)
);

create table public.benchmark_ratings (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.benchmark_pairs(pair_id) on delete cascade,
  rater_alias text not null check (rater_alias ~ '^r[0-9]{3}$'),
  choice public.benchmark_choice not null,
  rationale_codes text[] not null default '{}',
  unique (pair_id, rater_alias),
  check (rationale_codes <@ array['context_fit', 'specificity', 'credibility', 'cliche', 'tone_readability', 'other_reviewed']::text[])
);

create table public.benchmark_usefulness (
  id uuid primary key default gen_random_uuid(),
  rating smallint not null check (rating between 1 and 5),
  reason_code public.feedback_reason_code not null,
  month_bucket date not null check (month_bucket = date_trunc('month', month_bucket)::date)
);

create index evaluations_owner_created_idx on public.evaluations (owner_id, created_at desc);
create index consent_records_evaluation_idx on public.consent_records (evaluation_id);
create index judge_runs_evaluation_idx on public.judge_runs (evaluation_id);
create index guest_attempts_expiry_idx on public.guest_attempts (created_at);
create index provider_reconciliation_unresolved_idx on public.provider_reconciliation (state, created_at) where state = 'unresolved_reserved';

-- Accepted cost becomes unlinkable aggregate in the same transaction before
-- an evaluation deletion cascades its linked judge runs.
create function public.aggregate_judge_cost_before_evaluation_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.budget_ledger (
    provider_id, model_id, utc_month, pricing_version, reserved_micros, accepted_micros, updated_at
  )
  select
    run.provider_id,
    run.model_id,
    date_trunc('month', run.created_at at time zone 'UTC')::date,
    'settled-on-delete',
    0,
    sum(run.accepted_cost_micros),
    now()
  from public.judge_runs as run
  where run.evaluation_id = old.id
    and run.status in ('accepted', 'completed', 'ambiguous')
    and run.accepted_cost_micros > 0
  group by run.provider_id, run.model_id, date_trunc('month', run.created_at at time zone 'UTC')::date
  on conflict (provider_id, model_id, utc_month, pricing_version)
  do update set
    accepted_micros = public.budget_ledger.accepted_micros + excluded.accepted_micros,
    updated_at = excluded.updated_at;

  return old;
end;
$$;

create trigger evaluations_aggregate_cost_before_delete
before delete on public.evaluations
for each row execute function public.aggregate_judge_cost_before_evaluation_delete();

-- This server-only primitive is deliberately limited to the data that can
-- reconnect an evaluation to an account. The deletion-state workflow that
-- decides when to invoke it is enforced by the lifecycle migration.
create function public.purge_account_linkable_data(
  target_owner_id uuid,
  target_subject_hmac text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.evaluations where owner_id = target_owner_id;
  delete from public.consent_records where owner_id = target_owner_id;
  delete from public.usage_counters
  where subject_kind = 'account' and subject_hmac = target_subject_hmac;
end;
$$;

-- Encryption material is removed atomically when the auth user is deleted.
create function public.enforce_account_deletion_secret_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.state in ('requested', 'sessions_revoked', 'app_data_deleted') and new.encrypted_auth_user_id is null then
    raise exception 'ACCOUNT_DELETION_AUTH_CIPHERTEXT_REQUIRED';
  end if;
  if new.state in ('auth_user_deleted', 'complete') and new.encrypted_auth_user_id is not null then
    raise exception 'ACCOUNT_DELETION_AUTH_CIPHERTEXT_FORBIDDEN';
  end if;
  return new;
end;
$$;

create trigger account_deletion_secret_lifecycle
before insert or update on public.account_deletion_jobs
for each row execute function public.enforce_account_deletion_secret_lifecycle();

-- RLS exposes only an authenticated user's own evaluation list/deletion. All
-- writes, quotas, cost, reconciliation, benchmark, and export stay server-only.
alter table public.evaluations enable row level security;
alter table public.consent_records enable row level security;
alter table public.judge_runs enable row level security;
alter table public.usefulness_feedback enable row level security;
alter table public.usage_counters enable row level security;
alter table public.budget_ledger enable row level security;
alter table public.provider_reconciliation enable row level security;
alter table public.account_deletion_jobs enable row level security;
alter table public.guest_attempts enable row level security;
alter table public.benchmark_records enable row level security;
alter table public.benchmark_pairs enable row level security;
alter table public.benchmark_ratings enable row level security;
alter table public.benchmark_usefulness enable row level security;

create policy "evaluation owner can list own history"
on public.evaluations for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "evaluation owner can delete own history"
on public.evaluations for delete
to authenticated
using ((select auth.uid()) = owner_id);

grant select, delete on public.evaluations to authenticated;
grant usage on schema public to service_role;
grant all on public.evaluations, public.consent_records, public.judge_runs,
  public.usefulness_feedback, public.usage_counters, public.budget_ledger,
  public.provider_reconciliation, public.account_deletion_jobs,
  public.guest_attempts, public.benchmark_records, public.benchmark_pairs,
  public.benchmark_ratings, public.benchmark_usefulness to service_role;
grant execute on function public.purge_account_linkable_data(uuid, text) to service_role;

revoke all on public.budget_ledger, public.provider_reconciliation,
  public.account_deletion_jobs, public.guest_attempts, public.benchmark_records,
  public.benchmark_pairs, public.benchmark_ratings, public.benchmark_usefulness
from anon, authenticated;

revoke all on function public.purge_account_linkable_data(uuid, text)
from public, anon, authenticated;

-- Atomic quota, idempotency, refund, and monthly budget state machine
-- (BOM-004, BOM-005, BOM-010). Only service-role RPCs may mutate it.

create type public.evaluation_reservation_state as enum (
  'reserved',
  'completed',
  'refunded',
  'ambiguous',
  'failed_needs_adjudication',
  'provider_output_invalid',
  'expired'
);

create type public.cost_reservation_state as enum (
  'reserved',
  'accepted_settled',
  'rejected_released',
  'ambiguous_held'
);

create table public.usage_subject_aliases (
  subject_kind public.usage_subject_kind not null,
  alias_hmac text not null check (char_length(alias_hmac) between 16 and 512),
  canonical_hmac text not null check (char_length(canonical_hmac) between 16 and 512),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (subject_kind, alias_hmac)
);

create table public.evaluation_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  idempotency_hash text not null unique check (char_length(idempotency_hash) between 16 and 512),
  request_fingerprint text check (request_fingerprint is null or char_length(request_fingerprint) between 16 and 512),
  audience text not null check (audience in ('guest', 'authenticated')),
  account_hmac text check (account_hmac is null or char_length(account_hmac) between 16 and 512),
  campaign_id text not null check (char_length(campaign_id) between 1 and 120),
  state public.evaluation_reservation_state not null default 'reserved',
  reservation_expires_at timestamptz not null,
  terminal_outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (audience = 'guest' and account_hmac is null)
    or (audience = 'authenticated' and (account_hmac is not null or state <> 'reserved'))
  ),
  check (
    (state = 'reserved' and terminal_outcome is null and request_fingerprint is not null)
    or state <> 'reserved'
  )
);

create table public.usage_reservation_buckets (
  reservation_id uuid not null references public.evaluation_usage_reservations(id) on delete cascade,
  subject_kind public.usage_subject_kind not null,
  canonical_hmac text not null check (char_length(canonical_hmac) between 16 and 512),
  campaign_or_bucket text not null check (char_length(campaign_or_bucket) between 1 and 240),
  state public.usage_state not null default 'reserved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (reservation_id, subject_kind, campaign_or_bucket)
);

create table public.cost_reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.evaluation_usage_reservations(id) on delete cascade,
  provider_role public.provider_role not null,
  provider_id text not null check (char_length(provider_id) between 1 and 240),
  model_id text not null check (char_length(model_id) between 1 and 240),
  pricing_version text not null check (char_length(pricing_version) between 1 and 120),
  utc_month date not null check (utc_month = date_trunc('month', utc_month)::date),
  reserved_micros bigint not null check (reserved_micros >= 0),
  accepted_micros bigint check (accepted_micros is null or accepted_micros >= 0),
  state public.cost_reservation_state not null default 'reserved',
  encrypted_request_id bytea,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  alerted_at timestamptz,
  unique (reservation_id, provider_role),
  check (
    (state = 'reserved' and accepted_micros is null and encrypted_request_id is null and settled_at is null)
    or (state = 'ambiguous_held' and accepted_micros is null and encrypted_request_id is not null and settled_at is null)
    or (state = 'accepted_settled' and accepted_micros is not null and settled_at is not null)
    or (state = 'rejected_released' and accepted_micros is null and settled_at is not null)
  )
);

create index evaluation_usage_reservations_expiry_idx
on public.evaluation_usage_reservations (reservation_expires_at)
where state = 'reserved';

create index cost_reservations_reconciliation_idx
on public.cost_reservations (state, created_at)
where state = 'ambiguous_held';

create function public.resolve_usage_subject(
  target_kind public.usage_subject_kind,
  current_hmac text,
  previous_hmac text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_canonical text;
  previous_canonical text;
  resolved text;
begin
  if current_hmac is null or char_length(current_hmac) < 16 then
    raise exception 'USAGE_CURRENT_HMAC_INVALID';
  end if;
  if previous_hmac is not null and char_length(previous_hmac) < 16 then
    raise exception 'USAGE_PREVIOUS_HMAC_INVALID';
  end if;

  if previous_hmac is null or current_hmac <= previous_hmac then
    perform pg_advisory_xact_lock(hashtextextended(target_kind::text || ':' || current_hmac, 0));
    if previous_hmac is not null then
      perform pg_advisory_xact_lock(hashtextextended(target_kind::text || ':' || previous_hmac, 0));
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended(target_kind::text || ':' || previous_hmac, 0));
    perform pg_advisory_xact_lock(hashtextextended(target_kind::text || ':' || current_hmac, 0));
  end if;

  select canonical_hmac into current_canonical
  from public.usage_subject_aliases
  where subject_kind = target_kind and alias_hmac = current_hmac;

  if previous_hmac is not null then
    select canonical_hmac into previous_canonical
    from public.usage_subject_aliases
    where subject_kind = target_kind and alias_hmac = previous_hmac;
  end if;

  if current_canonical is not null and previous_canonical is not null
    and current_canonical <> previous_canonical
  then
    raise exception 'USAGE_IDENTITY_ALIAS_CONFLICT';
  end if;

  resolved := coalesce(current_canonical, previous_canonical, current_hmac);
  insert into public.usage_subject_aliases(subject_kind, alias_hmac, canonical_hmac)
  values (target_kind, current_hmac, resolved)
  on conflict (subject_kind, alias_hmac) do update set last_seen_at = now();

  if previous_hmac is not null then
    insert into public.usage_subject_aliases(subject_kind, alias_hmac, canonical_hmac)
    values (target_kind, previous_hmac, resolved)
    on conflict (subject_kind, alias_hmac) do update set last_seen_at = now();
  end if;

  return resolved;
end;
$$;

create function public.reserve_usage_bucket(
  target_reservation_id uuid,
  target_kind public.usage_subject_kind,
  current_hmac text,
  previous_hmac text,
  target_bucket text,
  target_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical text;
begin
  if target_limit < 1 then
    raise exception 'USAGE_LIMIT_INVALID';
  end if;
  canonical := public.resolve_usage_subject(target_kind, current_hmac, previous_hmac);

  insert into public.usage_counters(subject_kind, subject_hmac, campaign_or_bucket, state, count)
  values (target_kind, canonical, target_bucket, 'reserved', 0)
  on conflict (subject_kind, subject_hmac, campaign_or_bucket) do nothing;

  update public.usage_counters
  set count = count + 1, state = 'reserved', updated_at = now()
  where subject_kind = target_kind
    and subject_hmac = canonical
    and campaign_or_bucket = target_bucket
    and count < target_limit;

  if not found then
    return false;
  end if;

  insert into public.usage_reservation_buckets(
    reservation_id, subject_kind, canonical_hmac, campaign_or_bucket
  ) values (target_reservation_id, target_kind, canonical, target_bucket);
  return true;
end;
$$;

create function public.release_usage_bucket(
  target_reservation_id uuid,
  target_kind public.usage_subject_kind,
  target_bucket text,
  target_state public.usage_state
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket public.usage_reservation_buckets%rowtype;
begin
  select * into bucket
  from public.usage_reservation_buckets
  where reservation_id = target_reservation_id
    and subject_kind = target_kind
    and campaign_or_bucket = target_bucket
  for update;

  if not found or bucket.state <> 'reserved' then
    return false;
  end if;

  if target_state in ('refunded', 'expired') then
    update public.usage_counters
    set count = count - 1, updated_at = now(),
      state = case when count - 1 = 0 then target_state else state end
    where subject_kind = bucket.subject_kind
      and subject_hmac = bucket.canonical_hmac
      and campaign_or_bucket = bucket.campaign_or_bucket
      and count > 0;
    if not found then
      raise exception 'USAGE_COUNTER_RELEASE_FAILED';
    end if;
  end if;

  update public.usage_reservation_buckets
  set state = target_state, updated_at = now()
  where reservation_id = target_reservation_id
    and subject_kind = target_kind
    and campaign_or_bucket = target_bucket;
  return true;
end;
$$;

create function public.reserve_evaluation_allowance(
  target_idempotency_hash text,
  target_request_fingerprint text,
  target_audience text,
  target_account_hmac text,
  target_campaign_id text,
  target_ip_current_hmac text,
  target_ip_previous_hmac text,
  target_cookie_current_hmac text,
  target_cookie_previous_hmac text,
  target_now timestamptz,
  target_guest_global_limit integer,
  target_sol_daily_limit integer,
  target_monthly_budget_micros bigint,
  target_provider_costs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.evaluation_usage_reservations%rowtype;
  reservation_id uuid;
  kst_day date := (target_now at time zone 'Asia/Seoul')::date;
  utc_day date := (target_now at time zone 'UTC')::date;
  target_utc_month date := date_trunc('month', target_now at time zone 'UTC')::date;
  cost jsonb;
  planned_micros bigint := 0;
  has_sol boolean := false;
begin
  if char_length(target_idempotency_hash) < 16 or char_length(target_request_fingerprint) < 16 then
    raise exception 'IDEMPOTENCY_INPUT_INVALID';
  end if;
  if target_audience not in ('guest', 'authenticated') then
    raise exception 'USAGE_AUDIENCE_INVALID';
  end if;
  if jsonb_typeof(target_provider_costs) <> 'array' then
    raise exception 'PROVIDER_COSTS_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('idempotency:' || target_idempotency_hash, 0));
  select * into existing
  from public.evaluation_usage_reservations
  where idempotency_hash = target_idempotency_hash;

  if found then
    if existing.request_fingerprint is distinct from target_request_fingerprint then
      return jsonb_build_object(
        'decision', 'rejected', 'code', 'IDEMPOTENCY_BODY_MISMATCH',
        'reservationId', existing.id, 'isDuplicate', true, 'providerCallAllowed', false
      );
    end if;
    return jsonb_build_object(
      'decision', case when existing.state = 'reserved' then 'in_flight' else 'terminal' end,
      'code', case
        when existing.state = 'reserved' then 'EVALUATION_IN_PROGRESS'
        when existing.audience = 'guest' then 'GUEST_ATTEMPT_ALREADY_USED'
        else 'IDEMPOTENT_REPLAY'
      end,
      'reservationId', existing.id, 'isDuplicate', true, 'providerCallAllowed', false
    );
  end if;

  begin
    insert into public.evaluation_usage_reservations(
      idempotency_hash, request_fingerprint, audience, account_hmac,
      campaign_id, reservation_expires_at, created_at, updated_at
    ) values (
      target_idempotency_hash, target_request_fingerprint, target_audience,
      case when target_audience = 'authenticated' then target_account_hmac else null end,
      target_campaign_id, target_now + interval '600 seconds', target_now, target_now
    ) returning id into reservation_id;

    if target_audience = 'guest' then
      if target_ip_current_hmac is null or target_cookie_current_hmac is null then
        raise exception 'GUEST_IDENTITY_REQUIRED';
      end if;
      if not public.reserve_usage_bucket(
        reservation_id, 'guest_ip', target_ip_current_hmac, target_ip_previous_hmac,
        'guest:' || kst_day::text, 1
      ) then raise exception 'GUEST_LIMIT'; end if;
      if not public.reserve_usage_bucket(
        reservation_id, 'guest_cookie', target_cookie_current_hmac, target_cookie_previous_hmac,
        'guest:' || kst_day::text, 1
      ) then raise exception 'GUEST_LIMIT'; end if;
      if not public.reserve_usage_bucket(
        reservation_id, 'guest_global', repeat('g', 64), null,
        'guest:' || kst_day::text, target_guest_global_limit
      ) then raise exception 'GLOBAL_LIMIT'; end if;
    else
      if target_account_hmac is null then raise exception 'ACCOUNT_IDENTITY_REQUIRED'; end if;
      if not public.reserve_usage_bucket(
        reservation_id, 'account', target_account_hmac, null,
        'campaign:' || target_campaign_id, 3
      ) then raise exception 'ACCOUNT_LIMIT'; end if;
    end if;

    for cost in select value from jsonb_array_elements(target_provider_costs)
    loop
      if (cost->>'providerRole') not in ('guest', 'luna', 'terra', 'sol')
        or coalesce(cost->>'providerId', '') = ''
        or coalesce(cost->>'modelId', '') = ''
        or coalesce(cost->>'pricingVersion', '') = ''
        or (cost->>'reservedMicros') is null
        or (cost->>'reservedMicros')::bigint < 0
      then
        raise exception 'PROVIDER_COSTS_INVALID';
      end if;
      planned_micros := planned_micros + (cost->>'reservedMicros')::bigint;
      has_sol := has_sol or (cost->>'providerRole') = 'sol';
    end loop;
    if exists (
      select 1 from jsonb_array_elements(target_provider_costs) as item
      group by item->>'providerRole' having count(*) > 1
    ) then raise exception 'PROVIDER_COSTS_INVALID'; end if;

    if has_sol and not public.reserve_usage_bucket(
      reservation_id, 'sol', repeat('s', 64), null,
      'sol:' || utc_day::text, target_sol_daily_limit
    ) then raise exception 'SOL_LIMIT'; end if;

    perform pg_advisory_xact_lock(hashtextextended('budget:' || target_utc_month::text, 0));
    if target_monthly_budget_micros < 0 or (planned_micros > 0 and (
      select coalesce(sum(reserved_micros + accepted_micros), 0)
      from public.budget_ledger where budget_ledger.utc_month = target_utc_month
    ) + planned_micros > target_monthly_budget_micros) then
      raise exception 'PAID_EVALUATION_DISABLED';
    end if;

    for cost in select value from jsonb_array_elements(target_provider_costs)
    loop
      insert into public.budget_ledger(
        provider_id, model_id, utc_month, pricing_version, reserved_micros, accepted_micros, updated_at
      ) values (
        cost->>'providerId', cost->>'modelId', target_utc_month, cost->>'pricingVersion',
        (cost->>'reservedMicros')::bigint, 0, target_now
      )
      on conflict (provider_id, model_id, utc_month, pricing_version)
      do update set
        reserved_micros = public.budget_ledger.reserved_micros + excluded.reserved_micros,
        updated_at = excluded.updated_at;

      insert into public.cost_reservations(
        reservation_id, provider_role, provider_id, model_id, pricing_version,
        utc_month, reserved_micros, created_at
      ) values (
        reservation_id, (cost->>'providerRole')::public.provider_role,
        cost->>'providerId', cost->>'modelId', cost->>'pricingVersion',
        target_utc_month, (cost->>'reservedMicros')::bigint, target_now
      );
    end loop;
  exception when raise_exception then
    if sqlerrm in (
      'GUEST_LIMIT', 'GLOBAL_LIMIT', 'ACCOUNT_LIMIT', 'SOL_LIMIT',
      'PAID_EVALUATION_DISABLED', 'PROVIDER_COSTS_INVALID',
      'GUEST_IDENTITY_REQUIRED', 'ACCOUNT_IDENTITY_REQUIRED',
      'USAGE_IDENTITY_ALIAS_CONFLICT'
    ) then
      return jsonb_build_object(
        'decision', 'rejected', 'code', sqlerrm,
        'reservationId', null, 'isDuplicate', false, 'providerCallAllowed', false
      );
    end if;
    raise;
  end;

  return jsonb_build_object(
    'decision', 'reserved', 'code', null,
    'reservationId', reservation_id, 'isDuplicate', false, 'providerCallAllowed', true
  );
end;
$$;

create function public.finalize_evaluation_allowance(
  target_idempotency_hash text,
  target_outcome text,
  target_cost_results jsonb,
  target_now timestamptz
)
returns public.evaluation_reservation_state
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation public.evaluation_usage_reservations%rowtype;
  bucket public.usage_reservation_buckets%rowtype;
  cost public.cost_reservations%rowtype;
  result jsonb;
  result_outcome text;
  accepted bigint;
  desired public.evaluation_reservation_state;
  bucket_state public.usage_state;
begin
  select * into reservation
  from public.evaluation_usage_reservations
  where idempotency_hash = target_idempotency_hash
  for update;
  if not found then raise exception 'USAGE_RESERVATION_NOT_FOUND'; end if;

  desired := case target_outcome
    when 'completed' then 'completed'
    when 'rejected_before_acceptance' then 'refunded'
    when 'cancelled_before_acceptance' then 'refunded'
    when 'ambiguous_after_acceptance' then 'ambiguous'
    when 'failed_needs_adjudication' then 'failed_needs_adjudication'
    when 'provider_output_invalid' then 'provider_output_invalid'
    else null
  end;
  if desired is null then raise exception 'USAGE_OUTCOME_INVALID'; end if;
  if jsonb_typeof(target_cost_results) <> 'array' then raise exception 'COST_RESULTS_INVALID'; end if;
  if reservation.state <> 'reserved' then
    if reservation.state = desired and reservation.terminal_outcome = target_outcome then
      for cost in select * from public.cost_reservations where reservation_id = reservation.id
      loop
        select value into result from jsonb_array_elements(target_cost_results)
        where value->>'providerRole' = cost.provider_role::text;
        if result is null
          or (cost.state = 'accepted_settled' and (
            result->>'outcome' <> 'accepted'
            or (result->>'acceptedMicros')::bigint is distinct from cost.accepted_micros
          ))
          or (cost.state = 'rejected_released' and result->>'outcome' <> 'rejected')
          or (cost.state = 'ambiguous_held' and (
            result->>'outcome' <> 'ambiguous'
            or encode(cost.encrypted_request_id, 'hex') is distinct from lower(result->>'encryptedRequestIdHex')
          ))
        then raise exception 'USAGE_FINALIZE_NON_IDEMPOTENT'; end if;
      end loop;
      return reservation.state;
    end if;
    raise exception 'USAGE_RESERVATION_ALREADY_FINALIZED';
  end if;

  for cost in select * from public.cost_reservations where reservation_id = reservation.id for update
  loop
    select value into result
    from jsonb_array_elements(target_cost_results)
    where value->>'providerRole' = cost.provider_role::text;
    if result is null then raise exception 'COST_RESULT_MISSING'; end if;
    result_outcome := result->>'outcome';

    if result_outcome = 'accepted' then
      accepted := (result->>'acceptedMicros')::bigint;
      if accepted < 0 or accepted > cost.reserved_micros then raise exception 'ACCEPTED_COST_INVALID'; end if;
      update public.budget_ledger set
        reserved_micros = reserved_micros - cost.reserved_micros,
        accepted_micros = accepted_micros + accepted,
        updated_at = target_now
      where provider_id = cost.provider_id and model_id = cost.model_id
        and utc_month = cost.utc_month and pricing_version = cost.pricing_version
        and reserved_micros >= cost.reserved_micros;
      if not found then raise exception 'BUDGET_RESERVATION_MISSING'; end if;
      update public.cost_reservations set
        state = 'accepted_settled', accepted_micros = accepted, settled_at = target_now
      where id = cost.id;
    elsif result_outcome = 'rejected' then
      update public.budget_ledger set
        reserved_micros = reserved_micros - cost.reserved_micros,
        updated_at = target_now
      where provider_id = cost.provider_id and model_id = cost.model_id
        and utc_month = cost.utc_month and pricing_version = cost.pricing_version
        and reserved_micros >= cost.reserved_micros;
      if not found then raise exception 'BUDGET_RESERVATION_MISSING'; end if;
      update public.cost_reservations set state = 'rejected_released', settled_at = target_now
      where id = cost.id;
    elsif result_outcome = 'ambiguous' then
      if coalesce(result->>'encryptedRequestIdHex', '') !~ '^[0-9a-fA-F]+$'
        or length(result->>'encryptedRequestIdHex') % 2 <> 0
      then raise exception 'ENCRYPTED_REQUEST_ID_REQUIRED'; end if;
      update public.cost_reservations set
        state = 'ambiguous_held', encrypted_request_id = decode(result->>'encryptedRequestIdHex', 'hex')
      where id = cost.id;
    else
      raise exception 'COST_RESULT_INVALID';
    end if;
  end loop;

  if desired = 'completed' and exists (
    select 1 from public.cost_reservations
    where reservation_id = reservation.id and state = 'ambiguous_held'
  ) then raise exception 'COMPLETED_COST_AMBIGUOUS'; end if;
  if desired = 'refunded' and exists (
    select 1 from public.cost_reservations
    where reservation_id = reservation.id and state <> 'rejected_released'
  ) then raise exception 'PREACCEPTANCE_COST_NOT_REJECTED'; end if;

  for bucket in select * from public.usage_reservation_buckets where reservation_id = reservation.id for update
  loop
    if desired = 'completed' then
      bucket_state := 'consumed';
    elsif desired = 'refunded' then
      bucket_state := 'refunded';
    elsif bucket.subject_kind in ('guest_ip', 'guest_cookie', 'guest_global') then
      bucket_state := 'consumed';
    elsif bucket.subject_kind = 'account' then
      bucket_state := 'refunded';
    elsif bucket.subject_kind = 'sol' then
      select case state
        when 'accepted_settled' then 'consumed'::public.usage_state
        when 'ambiguous_held' then 'ambiguous'::public.usage_state
        else 'refunded'::public.usage_state
      end into bucket_state
      from public.cost_reservations
      where reservation_id = reservation.id and provider_role = 'sol';
      bucket_state := coalesce(bucket_state, 'refunded');
    end if;
    perform public.release_usage_bucket(reservation.id, bucket.subject_kind, bucket.campaign_or_bucket, bucket_state);
  end loop;

  update public.evaluation_usage_reservations set
    state = desired,
    terminal_outcome = target_outcome,
    account_hmac = null,
    updated_at = target_now
  where id = reservation.id;
  return desired;
end;
$$;

create function public.expire_stale_evaluation_reservations(target_now timestamptz)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation public.evaluation_usage_reservations%rowtype;
  bucket public.usage_reservation_buckets%rowtype;
  cost public.cost_reservations%rowtype;
  expired_count bigint := 0;
begin
  for reservation in
    select * from public.evaluation_usage_reservations
    where state = 'reserved' and reservation_expires_at <= target_now
    for update skip locked
  loop
    if exists (
      select 1 from public.cost_reservations
      where reservation_id = reservation.id and state = 'ambiguous_held'
    ) then continue; end if;

    for cost in select * from public.cost_reservations where reservation_id = reservation.id and state = 'reserved' for update
    loop
      update public.budget_ledger set
        reserved_micros = reserved_micros - cost.reserved_micros,
        updated_at = target_now
      where provider_id = cost.provider_id and model_id = cost.model_id
        and utc_month = cost.utc_month and pricing_version = cost.pricing_version
        and reserved_micros >= cost.reserved_micros;
      if not found then raise exception 'BUDGET_RESERVATION_MISSING'; end if;
      update public.cost_reservations set state = 'rejected_released', settled_at = target_now where id = cost.id;
    end loop;

    for bucket in select * from public.usage_reservation_buckets where reservation_id = reservation.id for update
    loop
      perform public.release_usage_bucket(reservation.id, bucket.subject_kind, bucket.campaign_or_bucket, 'expired');
    end loop;
    update public.evaluation_usage_reservations set
      state = 'expired', terminal_outcome = 'expired_before_acceptance',
      account_hmac = null, updated_at = target_now
    where id = reservation.id;
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;

create function public.mark_ambiguous_cost_alerts(target_now timestamptz)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  marked bigint;
begin
  update public.cost_reservations set alerted_at = target_now
  where state = 'ambiguous_held'
    and alerted_at is null
    and created_at + interval '7 days' <= target_now;
  get diagnostics marked = row_count;
  return marked;
end;
$$;

create function public.resolve_ambiguous_cost(
  target_cost_id uuid,
  target_resolution text,
  target_accepted_micros bigint,
  target_now timestamptz
)
returns public.cost_reservation_state
language plpgsql
security definer
set search_path = public
as $$
declare
  cost public.cost_reservations%rowtype;
  desired public.cost_reservation_state;
begin
  select * into cost from public.cost_reservations where id = target_cost_id for update;
  if not found then raise exception 'COST_RESERVATION_NOT_FOUND'; end if;
  desired := case target_resolution
    when 'accepted' then 'accepted_settled'
    when 'rejected' then 'rejected_released'
    else null
  end;
  if desired is null then raise exception 'COST_RESOLUTION_INVALID'; end if;
  if cost.state = desired then
    if desired = 'accepted_settled' and cost.accepted_micros is distinct from target_accepted_micros then
      raise exception 'COST_RESOLUTION_NON_IDEMPOTENT';
    end if;
    return cost.state;
  end if;
  if cost.state <> 'ambiguous_held' then raise exception 'COST_NOT_AMBIGUOUS'; end if;
  if desired = 'accepted_settled'
    and (target_accepted_micros is null or target_accepted_micros < 0 or target_accepted_micros > cost.reserved_micros)
  then raise exception 'ACCEPTED_COST_INVALID'; end if;

  update public.budget_ledger set
    reserved_micros = reserved_micros - cost.reserved_micros,
    accepted_micros = accepted_micros + case when desired = 'accepted_settled' then target_accepted_micros else 0 end,
    updated_at = target_now
  where provider_id = cost.provider_id and model_id = cost.model_id
    and utc_month = cost.utc_month and pricing_version = cost.pricing_version
    and reserved_micros >= cost.reserved_micros;
  if not found then raise exception 'BUDGET_RESERVATION_MISSING'; end if;

  update public.cost_reservations set
    state = desired,
    accepted_micros = case when desired = 'accepted_settled' then target_accepted_micros else null end,
    encrypted_request_id = null,
    settled_at = target_now
  where id = target_cost_id;
  return desired;
end;
$$;

create function public.purge_expired_guest_usage(target_now timestamptz)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  delete from public.usage_counters
  where subject_kind in ('guest_ip', 'guest_cookie', 'guest_global')
    and campaign_or_bucket like 'guest:%'
    and substring(campaign_or_bucket from 7)::date < (target_now at time zone 'Asia/Seoul')::date - 7;
  get diagnostics removed = row_count;
  delete from public.usage_subject_aliases as alias
  where alias.subject_kind in ('guest_ip', 'guest_cookie', 'guest_global')
    and alias.last_seen_at <= target_now - interval '7 days'
    and not exists (
      select 1 from public.usage_counters as counter
      where counter.subject_kind = alias.subject_kind
        and counter.subject_hmac = alias.canonical_hmac
    );
  return removed;
end;
$$;

-- Extend the account-deletion primitive after the usage tables exist. Active
-- pre-acceptance reservations are refunded; already terminal cost rows are
-- ownerless because finalize_evaluation_allowance scrubs account_hmac.
create or replace function public.purge_account_linkable_data(
  target_owner_id uuid,
  target_subject_hmac text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation public.evaluation_usage_reservations%rowtype;
  bucket public.usage_reservation_buckets%rowtype;
  cost public.cost_reservations%rowtype;
begin
  for reservation in
    select * from public.evaluation_usage_reservations
    where account_hmac = target_subject_hmac
    for update
  loop
    if exists (
      select 1 from public.cost_reservations
      where reservation_id = reservation.id and state = 'ambiguous_held'
    ) then
      raise exception 'ACCOUNT_DELETION_RECONCILIATION_INVARIANT';
    end if;

    for cost in
      select * from public.cost_reservations
      where reservation_id = reservation.id and state = 'reserved'
      for update
    loop
      update public.budget_ledger set
        reserved_micros = reserved_micros - cost.reserved_micros,
        updated_at = now()
      where provider_id = cost.provider_id and model_id = cost.model_id
        and utc_month = cost.utc_month and pricing_version = cost.pricing_version
        and reserved_micros >= cost.reserved_micros;
      if not found then raise exception 'BUDGET_RESERVATION_MISSING'; end if;
      update public.cost_reservations set
        state = 'rejected_released', settled_at = now()
      where id = cost.id;
    end loop;

    for bucket in
      select * from public.usage_reservation_buckets
      where reservation_id = reservation.id
      for update
    loop
      if bucket.state = 'reserved' then
        perform public.release_usage_bucket(
          reservation.id, bucket.subject_kind, bucket.campaign_or_bucket, 'refunded'
        );
      end if;
    end loop;

    delete from public.usage_reservation_buckets where reservation_id = reservation.id;
    update public.evaluation_usage_reservations set
      state = case when state = 'reserved' then 'refunded' else state end,
      terminal_outcome = case when state = 'reserved' then 'account_deleted_before_acceptance' else terminal_outcome end,
      account_hmac = null,
      updated_at = now()
    where id = reservation.id;
  end loop;

  delete from public.usage_counters
  where subject_kind = 'account' and subject_hmac = target_subject_hmac;
  delete from public.usage_subject_aliases
  where subject_kind = 'account' and canonical_hmac = target_subject_hmac;
  delete from public.evaluations where owner_id = target_owner_id;
  delete from public.consent_records where owner_id = target_owner_id;
end;
$$;

alter table public.usage_subject_aliases enable row level security;
alter table public.evaluation_usage_reservations enable row level security;
alter table public.usage_reservation_buckets enable row level security;
alter table public.cost_reservations enable row level security;

grant select on public.usage_subject_aliases, public.evaluation_usage_reservations,
  public.usage_reservation_buckets, public.cost_reservations to service_role;

grant execute on function public.reserve_evaluation_allowance(
  text, text, text, text, text, text, text, text, text, timestamptz, integer, integer, bigint, jsonb
) to service_role;
grant execute on function public.finalize_evaluation_allowance(text, text, jsonb, timestamptz) to service_role;
grant execute on function public.expire_stale_evaluation_reservations(timestamptz) to service_role;
grant execute on function public.mark_ambiguous_cost_alerts(timestamptz) to service_role;
grant execute on function public.resolve_ambiguous_cost(uuid, text, bigint, timestamptz) to service_role;
grant execute on function public.purge_expired_guest_usage(timestamptz) to service_role;

revoke all on public.usage_subject_aliases, public.evaluation_usage_reservations,
  public.usage_reservation_buckets, public.cost_reservations from anon, authenticated;

revoke all on function public.resolve_usage_subject(public.usage_subject_kind, text, text)
from public, anon, authenticated;
revoke all on function public.reserve_usage_bucket(uuid, public.usage_subject_kind, text, text, text, integer)
from public, anon, authenticated;
revoke all on function public.release_usage_bucket(uuid, public.usage_subject_kind, text, public.usage_state)
from public, anon, authenticated;
revoke all on function public.reserve_evaluation_allowance(
  text, text, text, text, text, text, text, text, text, timestamptz, integer, integer, bigint, jsonb
) from public, anon, authenticated;
revoke all on function public.finalize_evaluation_allowance(text, text, jsonb, timestamptz)
from public, anon, authenticated;
revoke all on function public.expire_stale_evaluation_reservations(timestamptz)
from public, anon, authenticated;
revoke all on function public.mark_ambiguous_cost_alerts(timestamptz)
from public, anon, authenticated;
revoke all on function public.resolve_ambiguous_cost(uuid, text, bigint, timestamptz)
from public, anon, authenticated;
revoke all on function public.purge_expired_guest_usage(timestamptz)
from public, anon, authenticated;

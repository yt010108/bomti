-- Disposable local rollback companion for 20260721000000.
-- Execute only after the corresponding forward migration in an isolated DB.
drop table if exists public.cost_reservations cascade;
drop table if exists public.usage_reservation_buckets cascade;
drop table if exists public.evaluation_usage_reservations cascade;
drop table if exists public.usage_subject_aliases cascade;
drop type if exists public.cost_reservation_state cascade;
drop type if exists public.evaluation_reservation_state cascade;

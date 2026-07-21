-- Disposable local rollback companion for 20260720000000.
-- The initial persistence migration owns every public object, so its rollback
-- removes the schema as a unit. `supabase db reset --local` reapplies the
-- forward migrations to a fresh public schema for the required down/up proof.
drop schema if exists public cascade;
create schema public;

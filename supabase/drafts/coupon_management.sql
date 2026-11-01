-- ANVAYA coupon management: PROPOSAL FOR REVIEW, NOT APPLIED
-- Run after products_schema.sql and orders_schema.sql, as the whole file in the Supabase SQL
-- Editor (nothing selected), BEFORE deploying the website version that uses it.
-- All or nothing, and safe to run again.
--
-- What it changes:
-- 1. Admins can add, edit and delete rows in public.offers from the dashboard. Signed-in
--    non-admins and visitors still can't read or change the table.
-- 2. public.coupon_lookup: what the bag asks. It says whether any coupon is active and
--    returns one coupon only when given its exact code, so visitors can't list codes.
-- 3. The two demo coupons are switched off (not deleted), because customers don't need
--    coupons yet. An admin can switch them on, edit or delete them from the dashboard.
--
-- Checkout is unchanged: quote_order and place_order still decide every discount from
-- public.offers. Past orders keep the discount recorded on them, so deleting or editing a
-- coupon never changes an existing order.
--
-- Success shows one row: lookup_exists = true, anon_can_lookup = true,
-- authenticated_writes = 3, anon_writes = 0, offer_policies = 4, enabled_offers = 0

begin;

grant insert, update, delete on public.offers to authenticated;

drop policy if exists "Admins can add offers" on public.offers;
create policy "Admins can add offers"
on public.offers for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists "Admins can edit offers" on public.offers;
create policy "Admins can edit offers"
on public.offers for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Admins can delete offers" on public.offers;
create policy "Admins can delete offers"
on public.offers for delete to authenticated
using ((select public.is_admin()));

-- {"available": true|false, "offer": {...}|null}
create or replace function public.coupon_lookup(p_code text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'available', exists (select 1 from public.offers where enabled),
    'offer', (
      select jsonb_build_object('code', o.code, 'title', o.title, 'kind', o.kind, 'value', o.value, 'min_spend', o.min_spend)
      from public.offers o
      where o.enabled and o.code = upper(btrim(p_code))
    )
  );
$$;

revoke all on function public.coupon_lookup(text) from public, anon, authenticated;
grant execute on function public.coupon_lookup(text) to anon, authenticated;

-- Customers don't need coupons yet: the demo codes are kept, switched off
update public.offers set enabled = false where code in ('ALANKRITHA10', 'FESTIVE500');

commit;

notify pgrst, 'reload schema';

-- Confirmation
select
  to_regprocedure('public.coupon_lookup(text)') is not null as lookup_exists,
  has_function_privilege('anon', 'public.coupon_lookup(text)', 'execute') as anon_can_lookup,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'offers' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) as authenticated_writes,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'offers' and grantee = 'anon'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) as anon_writes,
  (select count(*) from pg_policy where polrelid = 'public.offers'::regclass) as offer_policies,
  (select count(*) from public.offers where enabled) as enabled_offers;

-- ---------------------------------------------------------------------------
-- Undo (only if needed; redeploy the previous website version with it):
-- ---------------------------------------------------------------------------
-- begin;
-- drop function if exists public.coupon_lookup(text);
-- drop policy if exists "Admins can add offers" on public.offers;
-- drop policy if exists "Admins can edit offers" on public.offers;
-- drop policy if exists "Admins can delete offers" on public.offers;
-- revoke insert, update, delete on public.offers from authenticated;
-- commit;
-- notify pgrst, 'reload schema';

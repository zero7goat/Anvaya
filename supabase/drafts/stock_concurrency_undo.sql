-- ANVAYA safe admin stock saves: UNDO (only if the release has to be rolled back)
-- Run the whole file in the Supabase SQL Editor (nothing selected). All or nothing, and
-- safe to run again. It touches no data: no stock, product or order row changes.
--
-- Puts the database back to how it was before STEP A and STEP D:
--   * gives signed-in users INSERT, UPDATE and DELETE on product_stock again (what
--     products_schema.sql grants; admins are still the only ones RLS lets write)
--   * removes public.admin_set_stock
--
-- Only the website from before this change works with the undone database (it writes
-- stock directly). The new dashboard can't save stock without admin_set_stock, so redeploy
-- the previous commit at the same time. If only STEP D needs undoing (the new dashboard
-- stays), run just the GRANT line below on its own and leave the function in place.
--
-- Success shows one row: function_exists = false, authenticated_stock_writes = 3,
-- anon_stock_writes = 0, authenticated_stock_select = true

begin;

grant insert, update, delete on public.product_stock to authenticated;
drop function if exists public.admin_set_stock(text, jsonb, boolean);

commit;

notify pgrst, 'reload schema';

-- Confirmation
select
  to_regprocedure('public.admin_set_stock(text, jsonb, boolean)') is not null as function_exists,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'product_stock' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) as authenticated_stock_writes,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'product_stock' and grantee = 'anon'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) as anon_stock_writes,
  has_table_privilege('authenticated', 'public.product_stock', 'select') as authenticated_stock_select;

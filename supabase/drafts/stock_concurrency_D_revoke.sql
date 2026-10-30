-- ANVAYA safe admin stock saves, STEP D of 2: stop direct stock writes from the website
-- Run only after STEP A (stock_concurrency_A_function.sql) is applied AND the new admin
-- dashboard (which saves stock through public.admin_set_stock) is live and has been checked.
-- Run the whole file in the Supabase SQL Editor (nothing selected). All or nothing, and
-- safe to run again.
--
-- Signed-in users (including admins) and visitors lose INSERT, UPDATE, DELETE and TRUNCATE
-- on public.product_stock, so an old browser tab or a hand-made request can't write stock
-- around admin_set_stock. After this, stock changes only through:
--   admin_set_stock (admins), place_order (checkout), admin_update_order_status (cancel/return)
-- These run as the table owner, so they are unaffected. Deleting a product still removes its
-- stock rows: the foreign key's ON DELETE CASCADE is carried out by the database itself.
--
-- Unchanged: SELECT on product_stock and both of its policies (visitors read published
-- stock, admins read all), every other table, function and policy.
--
-- It refuses to run (and changes nothing) if STEP A hasn't been applied.
--
-- Success shows one row:
--   function_exists = true, authenticated_can_execute = true, anon_can_execute = false,
--   authenticated_stock_writes = 0, anon_stock_writes = 0,
--   authenticated_stock_select = true, anon_stock_select = true, stock_policies = 2

begin;

do $$
begin
  if to_regprocedure('public.admin_set_stock(text, jsonb, boolean)') is null then
    raise exception 'STEP A (public.admin_set_stock) is not applied. Nothing was changed.';
  end if;
end;
$$;

-- Stock is now changed only by admin_set_stock, place_order and admin_update_order_status.
-- SELECT stays, with its policies: visitors read published stock, admins read all of it.
revoke insert, update, delete, truncate on public.product_stock from anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Confirmation
select
  exists (select 1 from pg_proc where oid = 'public.admin_set_stock(text, jsonb, boolean)'::regprocedure) as function_exists,
  has_function_privilege('authenticated', 'public.admin_set_stock(text, jsonb, boolean)', 'execute') as authenticated_can_execute,
  has_function_privilege('anon', 'public.admin_set_stock(text, jsonb, boolean)', 'execute') as anon_can_execute,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'product_stock' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) as authenticated_stock_writes,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'product_stock' and grantee = 'anon'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) as anon_stock_writes,
  has_table_privilege('authenticated', 'public.product_stock', 'select') as authenticated_stock_select,
  has_table_privilege('anon', 'public.product_stock', 'select') as anon_stock_select,
  (select count(*) from pg_policy where polrelid = 'public.product_stock'::regclass) as stock_policies;

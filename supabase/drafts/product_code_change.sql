-- ANVAYA product code change: NOT APPLIED yet
--
-- Adds public.admin_change_product_id(old, new), used by the admin dashboard's "Change code"
-- button. A product's code is its id (shown in capitals, e.g. ALK3K01). Product stock,
-- reviews and order lines point at the id, and their links don't follow an id change, so this
-- function moves everything in one transaction:
--   1. copies the product row under the new id (every column, created_at kept),
--   2. points its stock rows, reviews and past order lines at the new id,
--   3. deletes the old row (nothing points at it any more, so nothing is deleted with it).
-- Either all of it happens or none of it. Photo files keep their addresses, so photos
-- still show. A shopper's bag holding the old code loses that piece (codes rarely change).
--
-- It touches nothing else: no table, column, constraint, policy or other function.
-- Only admins can run it (public.is_admin(), checked inside; shoppers can't call it).
--
-- HOW TO USE
--   Part 1 (the change): run it as a whole (nothing selected). Running it again replaces
--     the function with the same one.
--   Part 2 (read-only): run it afterwards; every check should say PASS.
--   If any statement fails, run `rollback;` on its own before anything else.
--
-- Replies (jsonb): {"ok": true, "id": "<new id>"}, or {"ok": false, "reason": ...} with
-- reason invalid (bad format), same, taken (another product has it) or not_found.
-- Codes: 3 to 40 lowercase letters, digits and hyphens, starting with a letter or digit.
--
-- Locking: the old product row FOR UPDATE, then its stock rows FOR UPDATE ordered by size
-- (product before stock, the order the order and stock functions use), with a 2 s lock wait.


-- =============================================================================
-- PART 1: the change (run as a whole)
-- =============================================================================

begin;

create or replace function public.admin_change_product_id(p_old_id text, p_new_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_new text := lower(btrim(coalesce(p_new_id, '')));
begin
  if not public.is_admin() then
    raise exception 'Only admins can change product codes.' using errcode = '42501';
  end if;

  if v_new !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if v_new = p_old_id then
    return jsonb_build_object('ok', false, 'reason', 'same');
  end if;

  perform 1 from public.products where id = p_old_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if exists (select 1 from public.products where id = v_new) then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  perform 1 from public.product_stock where product_id = p_old_id order by size for update;

  insert into public.products (id, name, description, collection, category, subcategory, price, sale_price,
                               image, additional_images, is_featured, is_new_arrival, status, created_at, updated_at)
  select v_new, name, description, collection, category, subcategory, price, sale_price,
         image, additional_images, is_featured, is_new_arrival, status, created_at, now()
  from public.products where id = p_old_id;

  update public.product_stock set product_id = v_new where product_id = p_old_id;
  update public.product_reviews set product_id = v_new where product_id = p_old_id;
  update public.order_items set product_id = v_new where product_id = p_old_id;

  delete from public.products where id = p_old_id;

  return jsonb_build_object('ok', true, 'id', v_new);
end;
$$;

revoke all on function public.admin_change_product_id(text, text) from public, anon, authenticated;
grant execute on function public.admin_change_product_id(text, text) to authenticated;

commit;


-- =============================================================================
-- PART 2: read-only verification (each check should be PASS)
-- =============================================================================

with f as (
  select p.oid, p.prosecdef, p.proconfig, p.proacl
  from pg_proc p
  where p.oid = 'public.admin_change_product_id(text, text)'::regprocedure
),
checks(check_name, ok, detail) as (
  select 'function exists', exists (select 1 from f), null
  union all select 'runs as owner with an empty search path', (select prosecdef and proconfig @> array['search_path=""'] from f),
    (select proconfig::text from f)
  union all select 'signed-in users may call it (it checks is_admin itself)',
    has_function_privilege('authenticated', 'public.admin_change_product_id(text, text)', 'execute'), null
  union all select 'visitors (anon) may not call it',
    not has_function_privilege('anon', 'public.admin_change_product_id(text, text)', 'execute'), null
)
select check_name, case when ok then 'PASS' else 'CHECK' end as result, detail from checks;


-- =============================================================================
-- UNDO (only if needed)
-- =============================================================================
-- drop function if exists public.admin_change_product_id(text, text);

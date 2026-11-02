-- ANVAYA product photo deletes: APPLIED to the live project on 2026-11-02 (all Part 3 checks PASS)
--
-- Lets signed-in admins delete product photos from the "product-images" bucket, so a photo
-- removed in the admin dashboard (or a deleted product's photos) is deleted from storage too
-- (src/services/imageUpload.ts, deleteProductImages). Supabase Storage needs both a SELECT
-- and a DELETE policy on storage.objects to delete a file.
-- It touches nothing else: no bucket setting, table, function or other policy.
--
-- HOW TO USE
--   Part 1 (read-only): run it first. It lists every policy on storage.objects.
--   Part 2 (the change): run it as a whole (nothing selected). Each policy is created only if
--     no policy with its name exists; an existing policy is never dropped, replaced or
--     altered (storage.objects belongs to supabase_storage_admin, so a script here may create
--     policies but not alter or drop them). Running Part 2 again changes nothing.
--   Part 3 (read-only): run it afterwards; every check should say PASS.
--   If any statement fails, run `rollback;` on its own before anything else.
--
-- WHAT THE TWO POLICIES ALLOW (admins only: signed in and listed in admin_users)
--   * SELECT: admins can see the file records under products/ in this bucket (the dashboard
--     needs this to delete). Shoppers still can't list the bucket; they view photos only by
--     their public address, as before.
--   * DELETE: admins can delete files under products/ in this bucket. Nobody else can.
--   Nothing allows replacing a file (UPDATE), so uploads still never overwrite anything.


-- =============================================================================
-- PART 1: read-only, before the change
-- =============================================================================

select polname as policy, polcmd as cmd, polpermissive as permissive,
       (select array_agg(r::regrole::text order by 1) from unnest(polroles) r) as roles,
       pg_get_expr(polqual, polrelid) as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy
where polrelid = 'storage.objects'::regclass
order by polname;


-- =============================================================================
-- PART 2: the change (run as a whole)
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'Admins can see product photo files') then
    create policy "Admins can see product photo files"
    on storage.objects as permissive for select to authenticated
    using (
      bucket_id = 'product-images'
      and (select public.is_admin())
      and (storage.foldername(name))[1] = 'products'
    );
  end if;

  if not exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'Admins can delete product photos') then
    create policy "Admins can delete product photos"
    on storage.objects as permissive for delete to authenticated
    using (
      bucket_id = 'product-images'
      and (select public.is_admin())
      and (storage.foldername(name))[1] = 'products'
    );
  end if;
end;
$$;

commit;


-- =============================================================================
-- PART 3: read-only verification, after the change (each check should be PASS)
-- =============================================================================

with pol as (
  select polname, polcmd, polpermissive, (select array_agg(r::regrole::text) from unnest(polroles) r) as roles,
         regexp_replace(coalesce(pg_get_expr(polqual, polrelid), ''), '\m(public|storage)\.', '', 'g') as using_expr,
         pg_get_expr(polwithcheck, polrelid) as check_expr
  from pg_policy
  where polrelid = 'storage.objects'::regclass
),
expected(using_expr) as (
  select '((bucket_id = ''product-images''::text) AND ( SELECT is_admin() AS is_admin) AND ((foldername(name))[1] = ''products''::text))'
),
checks(check_name, ok, detail) as (
  select 'select policy: admins only, product-images/products only',
    exists (select 1 from pol, expected e where polname = 'Admins can see product photo files' and polcmd = 'r' and polpermissive
            and roles = array['authenticated'] and pol.using_expr = e.using_expr and check_expr is null),
    (select format('cmd=%s roles=%s using=%s', polcmd, roles, using_expr) from pol where polname = 'Admins can see product photo files')
  union all select 'delete policy: admins only, product-images/products only',
    exists (select 1 from pol, expected e where polname = 'Admins can delete product photos' and polcmd = 'd' and polpermissive
            and roles = array['authenticated'] and pol.using_expr = e.using_expr and check_expr is null),
    (select format('cmd=%s roles=%s using=%s', polcmd, roles, using_expr) from pol where polname = 'Admins can delete product photos')
  union all select 'no UPDATE/ALL policy names this bucket (files still can''t be replaced)',
    not exists (select 1 from pol where polcmd in ('w', '*') and (using_expr || ' ' || coalesce(check_expr, '')) like '%product-images%'),
    (select string_agg(polname, ', ') from pol where polcmd in ('w', '*') and (using_expr || ' ' || coalesce(check_expr, '')) like '%product-images%')
  union all select 'upload policy from product_images_storage.sql is still there',
    exists (select 1 from pol where polname = 'Admins can add product photos' and polcmd = 'a'), null
  union all select 'Row Level Security is on for storage.objects',
    (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass), null
)
select check_name, case when ok then 'PASS' else 'CHECK' end as result, detail from checks;


-- =============================================================================
-- UNDO (only if needed)
-- =============================================================================
-- drop policy if exists "Admins can see product photo files" on storage.objects;
-- drop policy if exists "Admins can delete product photos" on storage.objects;

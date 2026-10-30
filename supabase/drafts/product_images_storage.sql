-- ANVAYA product photo storage: APPLIED to the live project on 2026-10-31 (all Part 3 checks PASS)
--
-- Creates the public "product-images" bucket used by the admin dashboard's "Upload photo"
-- button (src/services/imageUpload.ts) and lets only admins add new photos.
-- It touches nothing outside Supabase Storage: no table, function, policy or data elsewhere.
--
-- HOW TO USE
--   Part 1 (read-only): run it first and keep the output. It shows what already exists.
--   Part 2 (the change): run it as a whole (nothing selected). It is all or nothing:
--     * the bucket is created only if no bucket with this id exists; an existing bucket is
--       never modified. If one exists with different settings, Part 2 stops with an error
--       and changes nothing (decide in the dashboard first);
--     * the upload policy is created only if it doesn't exist. If a policy with that name
--       exists, it is compared in full with the one below (command, permissive, roles, USING,
--       the whole WITH CHECK condition and the functions it calls); any difference stops Part 2 with an error
--       and changes nothing. An existing policy is never dropped, replaced or altered.
--     Running Part 2 again after it succeeded changes nothing.
--   Part 3 (read-only): run it afterwards; every check should say PASS.
--   If any statement fails, run `rollback;` on its own before anything else.
--
-- PERMISSIONS (Supabase Storage access control)
--   * Viewing a photo by its public address: allowed by the bucket being public. No SELECT
--     policy is needed for that, and none is created, so nobody can list the bucket's files.
--   * Uploading a new file: needs only an INSERT policy on storage.objects. The dashboard
--     uploads with "x-upsert: false" and a new file name every time.
--   * Overwriting (upsert) would also need SELECT and UPDATE policies; deleting would need
--     a DELETE policy. None are created, so photos can't be replaced or deleted through the
--     API. Old photos can be removed by hand in the Supabase dashboard (Storage).
--   * Upload rule: signed in, listed in admin_users (public.is_admin()), into
--     products/<product id>/<name>.webp only. The bucket itself allows WebP only, up to 5 MB
--     (the dashboard converts every photo to WebP under 5 MB before uploading).
--   Note: a broad policy someone added earlier on storage.objects (one that doesn't name a
--   bucket) would also apply to this bucket. Part 1 lists all of them; review before Part 2.


-- =============================================================================
-- PART 1: read-only, before the change
-- =============================================================================

-- 1a. Existing buckets
select id, public, file_size_limit, allowed_mime_types, created_at
from storage.buckets
order by id;

-- 1b. Every policy on storage.objects (cmd: r = select, a = insert, w = update, d = delete, * = all)
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

-- Create the bucket only if there is none with this id (an existing bucket is left as it is)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/webp'])
on conflict (id) do nothing;

-- An existing bucket with other settings: stop, nothing is changed
do $$
declare
  b record;
begin
  select public, file_size_limit, allowed_mime_types into b from storage.buckets where id = 'product-images';
  if b.public is distinct from true
     or b.file_size_limit is distinct from 5242880
     or b.allowed_mime_types is distinct from array['image/webp'] then
    raise exception 'A product-images bucket already exists with different settings (public=%, file_size_limit=%, allowed_mime_types=%). Nothing was changed.',
      b.public, b.file_size_limit, b.allowed_mime_types;
  end if;
end;
$$;

-- Admins may add new photos (INSERT only). If the policy doesn't exist it is created. If it
-- exists it must match in every part, or Part 2 stops here and the whole transaction is
-- undone; an existing policy is never dropped, replaced or altered. (storage.objects belongs
-- to supabase_storage_admin, so a script here may create policies but not alter or drop them.)
do $$
declare
  p record;
  has_policy boolean;
  calls_expected_functions boolean;
  expected_check constant text :=
    '((bucket_id = ''product-images''::text) AND ( SELECT is_admin() AS is_admin) AND '
    || '((foldername(name))[1] = ''products''::text) AND (array_length(foldername(name), 1) = 2) AND '
    || '(extension(name) = ''webp''::text))';
begin
  select oid, polcmd, polpermissive, (select array_agg(r::regrole::text) from unnest(polroles) r) as roles,
         pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as check_expr
  into p
  from pg_policy
  where polrelid = 'storage.objects'::regclass and polname = 'Admins can add product photos';
  has_policy := found;

  if not has_policy then
    create policy "Admins can add product photos"
    on storage.objects as permissive for insert to authenticated
    with check (
      bucket_id = 'product-images'
      and (select public.is_admin())
      and (storage.foldername(name))[1] = 'products'
      and array_length(storage.foldername(name), 1) = 2
      and storage.extension(name) = 'webp'
    );
    return;
  end if;

  -- Schema prefixes depend on the search path, so they are ignored in the text and the
  -- functions are checked by identity
  select count(distinct d.refobjid) = 3 into calls_expected_functions
  from pg_depend d
  where d.classid = 'pg_policy'::regclass and d.objid = p.oid and d.refclassid = 'pg_proc'::regclass
    and d.refobjid in ('public.is_admin()'::regprocedure, 'storage.foldername(text)'::regprocedure, 'storage.extension(text)'::regprocedure);

  if p.polcmd <> 'a'
     or not p.polpermissive
     or p.roles is distinct from array['authenticated']
     or p.using_expr is not null
     or regexp_replace(p.check_expr, '\m(public|storage)\.', '', 'g') is distinct from expected_check
     or not calls_expected_functions then
    raise exception 'A policy named "Admins can add product photos" already exists but differs from the expected one. Nothing was changed. Existing: cmd=%, permissive=%, roles=%, using=%, check=%.',
      p.polcmd, p.polpermissive, p.roles, p.using_expr, p.check_expr;
  end if;
end;
$$;

commit;


-- =============================================================================
-- PART 3: read-only verification, after the change (each check should be PASS)
-- =============================================================================

with b as (
  select * from storage.buckets where id = 'product-images'
),
pol as (
  select polname, polcmd, polpermissive, (select array_agg(r::regrole::text) from unnest(polroles) r) as roles,
         pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as check_expr,
         coalesce(pg_get_expr(polqual, polrelid), '') || ' ' || coalesce(pg_get_expr(polwithcheck, polrelid), '') as expr
  from pg_policy
  where polrelid = 'storage.objects'::regclass
),
upload as (
  select * from pol where polname = 'Admins can add product photos'
),
-- Functions the upload policy calls, by identity (not by how their names are printed)
upload_functions as (
  select d.refobjid as fn_oid, d.refobjid::regprocedure::text as fn
  from pg_policy p
  join pg_depend d on d.classid = 'pg_policy'::regclass and d.objid = p.oid and d.refclassid = 'pg_proc'::regclass
  where p.polrelid = 'storage.objects'::regclass and p.polname = 'Admins can add product photos'
),
checks(check_name, ok, detail) as (
  select 'bucket exists', exists (select 1 from b), (select count(*)::text from b)
  union all select 'bucket is public (photos viewable by address)', (select public from b) is true, (select public::text from b)
  union all select 'file size limit is 5 MB', (select file_size_limit from b) = 5242880, (select file_size_limit::text from b)
  union all select 'only WebP accepted', (select allowed_mime_types from b) = array['image/webp'], (select allowed_mime_types::text from b)
  union all select 'upload policy exists: INSERT, permissive, for authenticated only, no USING clause',
    exists (select 1 from upload where polcmd = 'a' and polpermissive and roles = array['authenticated'] and using_expr is null),
    (select format('cmd=%s permissive=%s roles=%s using=%s', polcmd, polpermissive, roles, using_expr) from upload)
  -- The whole WITH CHECK condition, exactly; only the schema prefixes Postgres prints
  -- (which depend on the search path) are ignored, and the functions are checked by identity
  union all select 'upload policy condition is exactly: bucket, admin, products folder, 2 levels, webp',
    exists (select 1 from upload
            where regexp_replace(check_expr, '\m(public|storage)\.', '', 'g') =
                  '((bucket_id = ''product-images''::text) AND ( SELECT is_admin() AS is_admin) AND '
                  || '((foldername(name))[1] = ''products''::text) AND (array_length(foldername(name), 1) = 2) AND '
                  || '(extension(name) = ''webp''::text))')
    and exists (select 1 from upload_functions where fn_oid = 'public.is_admin()'::regprocedure)
    and exists (select 1 from upload_functions where fn_oid = 'storage.foldername(text)'::regprocedure)
    and exists (select 1 from upload_functions where fn_oid = 'storage.extension(text)'::regprocedure),
    (select check_expr || '  calls: ' || (select string_agg(fn, ', ' order by fn) from upload_functions) from upload)
  union all select 'no SELECT/UPDATE/DELETE/ALL policy names this bucket (no listing, replacing or deleting)',
    not exists (select 1 from pol where polcmd in ('r', 'w', 'd', '*') and expr like '%product-images%'),
    (select string_agg(polname, ', ') from pol where polcmd in ('r', 'w', 'd', '*') and expr like '%product-images%')
  union all select 'no SELECT/UPDATE/DELETE/ALL policy covers every bucket (review any listed)',
    not exists (select 1 from pol where polcmd in ('r', 'w', 'd', '*') and expr not like '%bucket_id%'),
    (select string_agg(polname, ', ') from pol where polcmd in ('r', 'w', 'd', '*') and expr not like '%bucket_id%')
  union all select 'Row Level Security is on for storage.objects',
    (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass), null
)
select check_name, case when ok then 'PASS' else 'CHECK' end as result, detail from checks;


-- =============================================================================
-- UNDO (only if needed)
-- Remove the policy here; then empty and delete the bucket in the Supabase dashboard
-- (Storage). Supabase may refuse direct SQL deletes on its storage tables.
-- =============================================================================
-- drop policy if exists "Admins can add product photos" on storage.objects;

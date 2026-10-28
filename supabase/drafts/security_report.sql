-- ANVAYA security report (READ-ONLY: changes nothing)
-- Run in the Supabase SQL Editor and copy the single JSON result.
-- Lists RLS status, every policy, table grants for the API roles, public
-- functions and who can call them, and how many admins exist.

select json_build_object(
  'rls', (
    select json_agg(json_build_object('table', c.relname, 'rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity) order by c.relname)
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  ),
  'policies', (
    select json_agg(json_build_object(
      'table', p.tablename, 'policy', p.policyname, 'permissive', p.permissive,
      'roles', p.roles, 'command', p.cmd, 'using', p.qual, 'with_check', p.with_check
    ) order by p.tablename, p.policyname)
    from pg_policies p
    where p.schemaname = 'public'
  ),
  'grants', (
    select json_agg(g order by g.table_name, g.grantee)
    from (
      select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
      group by table_name, grantee
    ) g
  ),
  'functions', (
    select json_agg(json_build_object(
      'function', f.proname, 'security_definer', f.prosecdef, 'config', f.proconfig,
      'anon_can_call', has_function_privilege('anon', f.oid, 'execute'),
      'authenticated_can_call', has_function_privilege('authenticated', f.oid, 'execute')
    ) order by f.proname)
    from pg_proc f
    where f.pronamespace = 'public'::regnamespace
  ),
  'admin_count', (select count(*) from public.admin_users)
) as security_report;

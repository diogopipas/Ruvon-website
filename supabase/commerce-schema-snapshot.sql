-- Read-only metadata snapshot. Store remote output in an ignored private file.
select jsonb_build_object(
  'tables', coalesce((select jsonb_agg(jsonb_build_object(
    'name', c.relname, 'rls', c.relrowsecurity,
    'columns', (select jsonb_agg(jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
    'constraints', (select jsonb_agg(jsonb_build_object('name',x.conname,'definition',pg_catalog.pg_get_constraintdef(x.oid)) order by x.conname) from pg_catalog.pg_constraint x where x.conrelid=c.oid and x.contype<>'n'),
    'indexes', (select jsonb_agg(jsonb_build_object('name',i.indexname,'definition',i.indexdef) order by i.indexname) from pg_catalog.pg_indexes i where i.schemaname='public' and i.tablename=c.relname),
    'triggers', (select jsonb_agg(pg_catalog.pg_get_triggerdef(t.oid) order by t.tgname) from pg_catalog.pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),
    'acl', c.relacl::text
  ) order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),'[]'::jsonb),
  'functions', coalesce((select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_catalog.pg_get_functiondef(p.oid),'security_definer',p.prosecdef,'acl',p.proacl::text) order by p.oid::regprocedure::text) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and (p.proname like '%payment%' or p.proname like '%mbway%' or p.proname like 'commerce_%' or p.proname like 'merchant_%' or p.proname like 'operations_%' or p.proname like 'save_%' or p.proname like 'upsert_%')),'[]'::jsonb)
) as snapshot;

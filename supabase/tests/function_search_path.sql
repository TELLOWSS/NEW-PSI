-- Synthetic settings and TEMP rows only; rolled back without touching customer data.
begin;
do $$ begin
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.pronargs=0
  and p.proname=any(array['psi_is_admin_request','training_sessions_set_updated_at','set_training_ack_updated_at',
   'set_record_master_updated_at','set_predictive_plan_status_updated_at','set_updated_at'])
  and p.proconfig @> array['search_path=pg_catalog, pg_temp'])<>6 then raise exception 'Fixed search path missing'; end if;
end $$;
select set_config('app.settings.psi_admin_secret','synthetic-fixture-secret',true);
select set_config('request.headers','{}',true);
do $$ begin if public.psi_is_admin_request() then raise exception 'Missing header allowed'; end if; end $$;
select set_config('request.headers','{"x-psi-admin-secret":"wrong"}',true);
do $$ begin if public.psi_is_admin_request() then raise exception 'Wrong header allowed'; end if; end $$;
select set_config('request.headers','{"x-psi-admin-secret":"synthetic-fixture-secret"}',true);
do $$ begin if not public.psi_is_admin_request() then raise exception 'Correct header rejected'; end if; end $$;
do $$ declare fn text; valid boolean; begin
 foreach fn in array array['training_sessions_set_updated_at','set_training_ack_updated_at',
  'set_record_master_updated_at','set_predictive_plan_status_updated_at','set_updated_at'] loop
  execute format('create temporary table %I(id int primary key,updated_at timestamptz) on commit drop','fixture_'||fn);
  execute format('insert into %I values(1,''2000-01-01'')','fixture_'||fn);
  execute format('create trigger stamp before update on %I for each row execute function public.%I()','fixture_'||fn,fn);
  execute format('update %I set updated_at=''1900-01-01'' where id=1 returning updated_at>''2020-01-01''::timestamptz','fixture_'||fn) into valid;
  if not valid then raise exception 'Timestamp trigger failed'; end if;
 end loop;
end $$;
rollback;
select 'PASS: six fixed search paths, admin header verification and timestamp triggers; all fixtures rolled back' as result;

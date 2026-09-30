import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {expect,it} from 'vitest';

it('keeps admin-header verification and timestamp triggers correct under a hostile caller search path without changing bodies or privileges',async()=>{
 const db=new PGlite();
 const timestamps=['training_sessions_set_updated_at','set_training_ack_updated_at','set_record_master_updated_at','set_predictive_plan_status_updated_at','set_updated_at'];
 try {
  await db.exec(`create role authenticated; create schema attacker;
   grant usage on schema public,attacker to authenticated;
   create function attacker.now() returns timestamptz language sql as $$select '1900-01-01'::timestamptz$$;
   create function attacker.current_setting(text,boolean) returns text language sql as $$select case when $1='request.headers' then '{"x-psi-admin-secret":"spoof"}' else 'spoof' end$$;
   create function public.psi_is_admin_request() returns boolean language sql stable as $$
    select coalesce((current_setting('request.headers',true)::jsonb->>'x-psi-admin-secret')=current_setting('app.settings.psi_admin_secret',true),false);$$;`);
  for(const name of timestamps) await db.exec(`create function public.${name}() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end;$$;
   create table public.test_${name}(id int primary key,updated_at timestamptz);
   insert into public.test_${name} values(1,'2000-01-01');
   create trigger stamp before update on public.test_${name} for each row execute function public.${name}();
   grant select,update on public.test_${name} to authenticated;`);
  const snapshot=()=>db.query('select oid,prosrc,proacl,prosecdef from pg_proc where pronamespace=\'public\'::regnamespace order by oid');
  const before=await snapshot();
  const migration=await readFile('supabase/migrations/20260930003000_function_search_path.sql','utf8');
  await db.exec(migration); await db.exec(migration);
  expect((await snapshot()).rows).toEqual(before.rows);
  await db.exec("set role authenticated; set search_path=attacker,public; set app.settings.psi_admin_secret='correct-fixture-secret'; set request.headers='{}'");
  expect((await db.query('select public.psi_is_admin_request() as allowed')).rows).toEqual([{allowed:false}]);
  await db.exec(`set request.headers='{"x-psi-admin-secret":"wrong"}'`);
  expect((await db.query('select public.psi_is_admin_request() as allowed')).rows).toEqual([{allowed:false}]);
  await db.exec(`set request.headers='{"x-psi-admin-secret":"correct-fixture-secret"}'`);
  expect((await db.query('select public.psi_is_admin_request() as allowed')).rows).toEqual([{allowed:true}]);
  for(const name of timestamps) {
   const rows=await db.query<{valid:boolean}>(`update public.test_${name} set updated_at='1900-01-01' where id=1 returning updated_at>'2020-01-01'::timestamptz as valid`);
   expect(rows.rows).toEqual([{valid:true}]);
  }
  await db.exec('reset role');
  const rows=await db.query<{proconfig:string[]}>('select proconfig from pg_proc where pronamespace=\'public\'::regnamespace');
  expect(rows.rows).toHaveLength(6);
  expect(rows.rows.every(row=>row.proconfig.includes('search_path=pg_catalog, pg_temp'))).toBe(true);
 } finally {await db.close();}
},30_000);

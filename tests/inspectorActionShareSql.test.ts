import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {it,expect} from 'vitest';
it('executes the share, receipt, explicit adoption and cascade contract in PostgreSQL without persistent writes',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to service_role;grant select on storage.objects to service_role;`);
 for(const f of ['20261019120720_inspector_dedicated_foundation.sql','20261020001752_inspector_simple_assets.sql','20261023110141_inspector_action_share_reply.sql'])await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await db.exec(await readFile('supabase/tests/inspector_action_share.sql','utf8'));
 expect((await db.query('select * from public.psi_inspector_shares')).rows).toHaveLength(0);
 for(const role of ['anon','authenticated']){
  expect((await db.query(`select has_table_privilege('${role}','public.psi_inspector_shares','select') as allowed`)).rows).toEqual([{allowed:false}]);
  expect((await db.query(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'psi_inspector_share_%' and (p.prosecdef or has_function_privilege('${role}',p.oid,'execute'))`)).rows).toEqual([{n:0}]);
 }
 }finally{await db.close();}
},30000);

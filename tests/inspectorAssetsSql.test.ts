import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,it,expect} from 'vitest';
let db:PGlite;const id='b0190000-0000-4000-8000-000000000001';
beforeAll(async()=>{db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;`);for(const file of ['20261019120720_inspector_dedicated_foundation.sql','20261020001752_inspector_simple_assets.sql'])await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));},30000);
afterAll(()=>db.close());
async function denied(sql:string){await db.exec('savepoint blocked');await expect(db.exec(sql)).rejects.toBeDefined();await db.exec('rollback to blocked;release blocked');}
it('fences deletion, waits for inflight work, verifies storage and purges all snapshots through a narrow RPC',async()=>{
 await db.exec('begin;set local role service_role');await db.query('insert into public.psi_inspector_inspections(id,document) values($1,$2)',[id,{apiEnabled:true}]);
 expect((await db.query("select public.psi_inspector_reserve($1,'lease','upload',100) as ok",[id])).rows).toEqual([{ok:true}]);
 await db.query("select public.psi_inspector_begin_delete($1,'all',1)",[id]);
 expect((await db.query("select public.psi_inspector_reserve($1,'late','upload',100) as ok",[id])).rows).toEqual([{ok:false}]);
 await denied(`update public.psi_inspector_inspections set document='{}' where id='${id}'`);
 await denied(`select public.psi_inspector_complete_delete('${id}','{}')`);
 await db.exec("select public.psi_inspector_finish('lease');reset role");
 await db.query("insert into storage.objects values(gen_random_uuid(),'psi-inspector-evidence',$1,'{\"size\":100}')",[id+'/photo/a.jpg']);await db.exec('set local role service_role');await denied(`select public.psi_inspector_complete_delete('${id}','{}')`);
 await db.exec('reset role;delete from storage.objects;set local role service_role');await db.query("select public.psi_inspector_complete_delete($1,'{\"managedResidualFiles\":0}')",[id]);
 for(const t of ['inspections','events','reports','evidence'])expect((await db.query(`select * from public.psi_inspector_${t}`)).rows).toHaveLength(0);
 await denied(`insert into public.psi_inspector_inspections(id,document) values('${id}','{}')`);
 for(const role of ['anon','authenticated']){await db.exec(`set local role ${role}`);await denied('select public.psi_inspector_usage()');await denied(`select public.psi_inspector_begin_delete('${id}','all',1)`);await denied('select * from public.psi_inspector_controls');}
 await db.exec('rollback');
});
it('limits analysis once per fingerprint and to 20 attempts without enabling automatic paid calls',async()=>{
 await db.exec('begin;set local role service_role');await db.query('insert into public.psi_inspector_inspections(id,document) values($1,$2)',[id,{apiEnabled:false}]);
 expect((await db.query("select public.psi_inspector_reserve($1,'a0','analysis',0) as ok",[id])).rows).toEqual([{ok:false}]);await db.query("update public.psi_inspector_inspections set document='{\"apiEnabled\":true}' where id=$1",[id]);
 for(let i=0;i<20;i++){expect((await db.query('select public.psi_inspector_reserve($1,$2,\'analysis\',0) as ok',[id,'a'+i])).rows).toEqual([{ok:true}]);await db.query('select public.psi_inspector_finish($1)',['a'+i]);}
 for(const op of ['a0','a20'])expect((await db.query("select public.psi_inspector_reserve($1,$2,'analysis',0) as ok",[id,op])).rows).toEqual([{ok:false}]);
 await denied('delete from public.psi_inspector_operations');await db.exec('rollback');
});
it('keeps records in files-only mode and permits a later explicit full purge',async()=>{
 await db.exec('begin;set local role service_role');await db.query('insert into public.psi_inspector_inspections(id,document) values($1,$2)',[id,{}]);await db.query("select public.psi_inspector_begin_delete($1,'files',1)",[id]);await db.query("select public.psi_inspector_complete_delete($1,'{}')",[id]);expect((await db.query('select * from public.psi_inspector_events')).rows).toHaveLength(1);await db.query("select public.psi_inspector_begin_delete($1,'all',1)",[id]);await db.query("select public.psi_inspector_complete_delete($1,'{}')",[id]);expect((await db.query('select * from public.psi_inspector_events')).rows).toHaveLength(0);await db.exec('rollback');
});

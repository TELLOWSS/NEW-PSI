import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
let db:PGlite;
const id='a0190000-0000-4000-8000-000000000001';
async function denied(sql:string){await db.exec('savepoint forbidden');await expect(db.exec(sql)).rejects.toBeDefined();await db.exec('rollback to forbidden;release forbidden');}
beforeAll(async()=>{
    db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
        create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
        create table storage.objects(id uuid,bucket_id text);alter table storage.objects enable row level security;
        grant usage on schema storage to anon,authenticated;grant select,insert on storage.objects to anon,authenticated;
        create policy legacy_broad_storage on storage.objects for all to anon,authenticated using(true) with check(true);`);
    await db.exec(await readFile('supabase/migrations/20261019120720_inspector_dedicated_foundation.sql','utf8'));
},30000);
afterAll(async()=>{await db.close();});
describe('dedicated inspector real PostgreSQL isolation',()=>{
    it('denies browser roles, keeps originals and reports immutable, and appends revisions atomically',async()=>{
        await db.exec('begin;set local role service_role');
        await db.query('insert into public.psi_inspector_inspections(id,document) values($1,$2)',[id,{notes:'original user description'}]);
        await db.query("update public.psi_inspector_inspections set document=$1 where id=$2 and revision=1",[{notes:'amended description'},id]);
        expect((await db.query('select revision,document_snapshot from public.psi_inspector_events order by revision')).rows).toEqual([{revision:1,document_snapshot:{notes:'original user description'}},{revision:2,document_snapshot:{notes:'amended description'}}]);
        expect((await db.query("update public.psi_inspector_inspections set document='{}' where id=$1 and revision=1 returning id",[id])).rows).toHaveLength(0);
        for(const sql of ["update public.psi_inspector_inspections set revision=99",'delete from public.psi_inspector_inspections','delete from public.psi_inspector_events',"update public.psi_inspector_events set document_snapshot='{}'",'delete from public.psi_inspector_evidence','delete from public.psi_inspector_reports'])await denied(sql);
        for(const role of ['anon','authenticated']){await db.exec(`set local role ${role}`);for(const table of ['inspections','evidence','events','reports'])await denied(`select * from public.psi_inspector_${table}`);await denied(`insert into storage.objects values(gen_random_uuid(),'psi-inspector-evidence')`);}
        await db.exec('reset role');expect((await db.query("select public from storage.buckets where id='psi-inspector-evidence'")).rows).toEqual([{public:false}]);
        await db.exec('rollback');
    });
    it('rejects fabricated report revisions and retains original audit when append fails',async()=>{
        await db.exec('begin;set local role service_role');await db.query('insert into public.psi_inspector_inspections(id,document) values($1,$2)',[id,{notes:'original'}]);
        await denied(`insert into public.psi_inspector_reports(id,inspection_id,inspection_revision,snapshot,snapshot_sha256) values(gen_random_uuid(),'${id}',99,'{}','${'a'.repeat(64)}')`);
        await db.exec('reset role;alter table public.psi_inspector_events add constraint synthetic_failure check(revision<>2);set local role service_role');
        await denied(`update public.psi_inspector_inspections set document='{"notes":"changed"}' where id='${id}'`);
        expect((await db.query('select revision,document from public.psi_inspector_inspections')).rows).toEqual([{revision:1,document:{notes:'original'}}]);await db.exec('rollback');
    });
});

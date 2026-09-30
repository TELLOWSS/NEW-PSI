import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect,it } from 'vitest';

it('denies worker access and audio metadata/mutations, keeps server operations and unrelated bucket policy, and resists future broad policies',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create table public.workers(id int primary key,name text);
   insert into public.workers values(1,'Existing fixture');
   grant all on public.workers to anon,authenticated,service_role;
   alter table public.workers enable row level security;
   create policy "Enable ALL for authenticated and anon" on public.workers for all using(true) with check(true);
   create schema storage; grant usage on schema storage to anon,authenticated,service_role;
   create table storage.objects(id int primary key,bucket_id text,name text);
   grant all on storage.objects to anon,authenticated,service_role;
   alter table storage.objects enable row level security;
   create policy "오디오_누구나_조회" on storage.objects for select using(bucket_id='training_audio');
   create policy "오디오_누구나_업로드" on storage.objects for insert with check(bucket_id='training_audio');
   create policy signatures_anon_insert on storage.objects for insert with check(bucket_id='signatures');
   insert into storage.objects values(1,'training_audio','Existing audio');`);
  const sql=await readFile('supabase/migrations/20260930002000_worker_audio_server_boundary.sql','utf8');
  await db.exec(sql); await db.exec(sql);
  // A broad future policy cannot reopen this bucket's metadata or writes.
  await db.exec('create policy accidental_broad on storage.objects for all using(true) with check(true)');
  for(const role of ['anon','authenticated']) {
   await db.exec(`set role ${role}`);
   for(const query of ['select name from public.workers',"insert into public.workers values(2,'Forbidden')",
    "update public.workers set name='Forbidden' where id=1",'delete from public.workers where id=1'])
    await expect(db.exec(query)).rejects.toBeDefined();
   expect((await db.query("select name from storage.objects where bucket_id='training_audio'")).rows).toEqual([]);
   await expect(db.exec("insert into storage.objects values(9,'training_audio','Forbidden')")).rejects.toBeDefined();
   expect((await db.query("update storage.objects set name='Forbidden' where id=1 returning id")).rows).toEqual([]);
   expect((await db.query('delete from storage.objects where id=1 returning id')).rows).toEqual([]);
   await db.exec('reset role');
  }
  await db.exec('drop policy accidental_broad on storage.objects; set role anon');
  await db.exec("insert into storage.objects values(2,'signatures','Unrelated fixture')");
  await db.exec('reset role; set role service_role');
  expect((await db.query('select name from public.workers')).rows).toEqual([{name:'Existing fixture'}]);
  expect((await db.query('select name from storage.objects where id=1')).rows).toEqual([{name:'Existing audio'}]);
  await db.exec("update public.workers set name='Server edit' where id=1; insert into storage.objects values(3,'training_audio','Server upload'); update storage.objects set name='Server overwrite' where id=3; delete from storage.objects where id=3");
 } finally { await db.close(); }
},30_000);

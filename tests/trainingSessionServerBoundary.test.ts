import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('blocks table and column grants, preserves education and server CRUD, and withstands future broad policies', async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create table public.training_sessions(id int primary key, source_text_ko text, audio_urls jsonb);
   insert into public.training_sessions values(1,'Existing education','{"ko-KR":"existing-locator"}');
   grant all on public.training_sessions to public,anon,authenticated,service_role;
   grant select(source_text_ko),update(audio_urls) on public.training_sessions to anon,authenticated;
   alter table public.training_sessions enable row level security;
   create policy training_sessions_select_public on public.training_sessions for select to anon,authenticated using(true);`);
  const migration = await readFile('supabase/migrations/20260930004000_training_session_server_boundary.sql','utf8');
  await db.exec(migration); await db.exec(migration);
  expect((await db.query("select count(*)::int as n from pg_policy where polname='training_sessions_select_public'")).rows).toEqual([{n:1}]);
  for(const role of ['anon','authenticated']) {
   await db.exec(`set role ${role}`);
   for(const sql of ['select source_text_ko from public.training_sessions',"insert into public.training_sessions values(2,'Forbidden','{}')", "update public.training_sessions set audio_urls='{}' where id=1",'delete from public.training_sessions where id=1','truncate public.training_sessions']) await expect(db.exec(sql)).rejects.toBeDefined();
   await db.exec('reset role');
  }
  await db.exec('grant all on public.training_sessions to anon,authenticated; create policy accidental_broad on public.training_sessions for all using(true) with check(true)');
  for(const role of ['anon','authenticated']) {
   await db.exec(`set role ${role}`);
   expect((await db.query('select * from public.training_sessions')).rows).toEqual([]);
   await expect(db.exec("insert into public.training_sessions values(2,'Forbidden','{}')")).rejects.toBeDefined();
   expect((await db.query("update public.training_sessions set source_text_ko='Forbidden' returning id")).rows).toEqual([]);
   expect((await db.query('delete from public.training_sessions returning id')).rows).toEqual([]);
   await db.exec('reset role');
  }
  await db.exec(migration);
  await db.exec('set role service_role');
  expect((await db.query('select source_text_ko,audio_urls from public.training_sessions')).rows).toEqual([{source_text_ko:'Existing education',audio_urls:{'ko-KR':'existing-locator'}}]);
  await db.exec("insert into public.training_sessions values(2,'Server create','{}'); update public.training_sessions set source_text_ko='Server edit' where id=2; delete from public.training_sessions where id=2");
 } finally { await db.close(); }
}, 30_000);

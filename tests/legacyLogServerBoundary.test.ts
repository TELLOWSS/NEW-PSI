import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('blocks public log reads and writes, preserves server summaries and existing records, and supports missing optional views', async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create table training_access_attempts(id int primary key,worker_name text);
   create table report_message_logs(id int primary key,status text);
   insert into training_access_attempts values(1,'Fixture');
   insert into report_message_logs values(1,'SUCCESS');
   create policy legacy_authenticated on report_message_logs for select to authenticated using(true);
   grant all on training_access_attempts,report_message_logs to anon,authenticated,service_role;
   create view report_message_monthly_summary as select count(*)::int as total_count from report_message_logs;
   create view report_message_team_summary as select * from report_message_logs;
   create view report_message_failure_summary as select * from report_message_logs where status='FAILED';
   create view report_message_retry_queue as select * from report_message_logs;
   grant select on report_message_monthly_summary,report_message_team_summary,report_message_failure_summary,report_message_retry_queue to public,service_role;`);
  const migration=await readFile('supabase/migrations/20260930001000_legacy_log_server_boundary.sql','utf8');
  await db.exec(migration);
  await db.exec(migration); // Safe to reapply; does not add any grants.
  for(const role of ['anon','authenticated']) {
   await db.exec(`set role ${role}`);
   for(const sql of ['select * from training_access_attempts','select worker_name from training_access_attempts',
    'select * from report_message_logs','select * from report_message_monthly_summary',
    'select * from report_message_team_summary','select * from report_message_retry_queue',
    "insert into training_access_attempts values(2,'Forbidden')","update report_message_logs set status='FAILED'",
    'delete from training_access_attempts']) await expect(db.exec(sql)).rejects.toBeDefined();
   await db.exec('reset role');
  }
  await db.exec('set role service_role');
  expect((await db.query('select total_count from report_message_monthly_summary')).rows).toEqual([{total_count:1}]);
  await db.exec("insert into training_access_attempts values(2,'Server fixture'); update report_message_logs set status='FAILED' where id=1;");
  expect((await db.query('select id from report_message_failure_summary')).rows).toEqual([{id:1}]);
  expect((await db.query('select worker_name from training_access_attempts where id=1')).rows).toEqual([{worker_name:'Fixture'}]);
  await db.exec('reset role');
  const tables=await db.query('select relrowsecurity,relforcerowsecurity from pg_class where relname in (\'training_access_attempts\',\'report_message_logs\')');
  expect(tables.rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true},{relrowsecurity:true,relforcerowsecurity:true}]);
 } finally { await db.close(); }
},30_000);

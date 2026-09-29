-- Hosted PostgreSQL smoke test. All fixtures and changes are rolled back.
begin;
insert into auth.users(id) values
 ('a9300000-0000-4000-8000-000000000001'),
 ('a9300000-0000-4000-8000-000000000002'),
 ('a9300000-0000-4000-8000-000000000003');
insert into public.psi_tenants(id,name) values
 ('b9300000-0000-4000-8000-000000000001','Rollback test A'),
 ('b9300000-0000-4000-8000-000000000002','Rollback test B');
insert into public.psi_tenant_memberships(tenant_id,user_id,role) values
 ('b9300000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001','owner'),
 ('b9300000-0000-4000-8000-000000000002','a9300000-0000-4000-8000-000000000002','owner'),
 ('b9300000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000003','reviewer');
set local role authenticated;
select set_config('request.jwt.claim.sub','a9300000-0000-4000-8000-000000000001',true);
insert into public.psi_tenant_actions(tenant_id,title,site_name,description)
 values('b9300000-0000-4000-8000-000000000001','Guardrail','Test site','Repair guardrail');
select set_config('request.jwt.claim.sub','a9300000-0000-4000-8000-000000000002',true);
insert into public.psi_tenant_actions(tenant_id,title,site_name,description)
 values('b9300000-0000-4000-8000-000000000002','Guardrail B','Test site B','Repair guardrail B');
do $$ begin
 if (select count(*) from public.psi_tenant_actions) <> 1 then raise exception 'Reverse isolation failed'; end if;
 if exists(select 1 from public.psi_tenant_actions where tenant_id='b9300000-0000-4000-8000-000000000001') then raise exception 'Tenant A leaked'; end if;
 if (select count(*) from public.psi_tenant_action_events) <> 1 then raise exception 'Audit isolation failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','a9300000-0000-4000-8000-000000000003',true);
do $$ begin
 if (select count(*) from public.psi_tenant_actions) <> 1 then raise exception 'Forward isolation failed'; end if;
 begin
  insert into public.psi_tenant_actions(tenant_id,title,site_name,description)
   values('b9300000-0000-4000-8000-000000000002','Forbidden','Test','Forbidden');
  raise exception 'Foreign insert allowed';
 exception when insufficient_privilege then null; end;
end $$;
update public.psi_tenant_actions set status='in-progress' where tenant_id='b9300000-0000-4000-8000-000000000001';
update public.psi_tenant_actions set status='review-requested' where tenant_id='b9300000-0000-4000-8000-000000000001';
do $$ begin
 begin
  update public.psi_tenant_actions set status='closed',verification_note='Reviewer cannot close' where tenant_id='b9300000-0000-4000-8000-000000000001';
  raise exception 'Reviewer closure allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a9300000-0000-4000-8000-000000000001',true);
do $$ begin
 begin
  update public.psi_tenant_actions set status='closed',verification_note='' where tenant_id='b9300000-0000-4000-8000-000000000001';
  raise exception 'Closure without evidence allowed';
 exception when check_violation then null; end;
end $$;
update public.psi_tenant_actions set status='closed',verification_note='Guardrail verified on site' where tenant_id='b9300000-0000-4000-8000-000000000001' and revision=3;
do $$ begin
 if not exists(select 1 from public.psi_tenant_actions where status='closed' and revision=4) then raise exception 'Revision failure'; end if;
 if (select count(*) from public.psi_tenant_action_events) <> 4 then raise exception 'Atomic audit failure'; end if;
 if not exists(select 1 from public.psi_tenant_action_events where action_revision=4 and actor_id=auth.uid()) then raise exception 'Verified actor failure'; end if;
 begin
  update public.psi_tenant_action_events set verification_note='Forged' where tenant_id='b9300000-0000-4000-8000-000000000001';
  raise exception 'Audit mutation allowed';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.psi_tenant_actions where tenant_id='b9300000-0000-4000-8000-000000000001';
  raise exception 'Record deletion allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.psi_tenant_memberships set status='suspended' where user_id='a9300000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.psi_tenant_actions) then raise exception 'Suspended access allowed'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform 1 from public.psi_tenant_actions;
  raise exception 'Anonymous access allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: tenant isolation, workflow, audit, suspension and anonymous denial; fixtures rolled back' as result;

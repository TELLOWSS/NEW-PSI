-- Reviewed zero-argument helpers use only built-in functions/types/operators.
-- Preserve bodies, ACLs, security mode, trigger wiring and all existing records.
begin;
alter function public.psi_is_admin_request() set search_path=pg_catalog,pg_temp;
alter function public.training_sessions_set_updated_at() set search_path=pg_catalog,pg_temp;
alter function public.set_training_ack_updated_at() set search_path=pg_catalog,pg_temp;
alter function public.set_record_master_updated_at() set search_path=pg_catalog,pg_temp;
alter function public.set_predictive_plan_status_updated_at() set search_path=pg_catalog,pg_temp;
alter function public.set_updated_at() set search_path=pg_catalog,pg_temp;
notify pgrst,'reload schema';
commit;

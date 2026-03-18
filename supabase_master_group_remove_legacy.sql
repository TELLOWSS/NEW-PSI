-- PSI Record Master Group Remove Legacy Artifacts (2026-03-18)
-- 목적:
-- - 최종 전환 안정화 이후 company 레거시 객체 완전 제거
--
-- 선행 조건:
-- 1) supabase_master_group_final_cutover.sql 적용 완료
-- 2) OCR 운영 1~2일 이상 무장애 확인
-- 3) group 전용 경로 운영 확인

begin;

-- 1) assignments.company_id 참조 객체 제거
alter table public.record_master_assignments
    drop constraint if exists record_master_assignments_company_id_fkey;

drop index if exists public.record_master_assignments_company_idx;

drop index if exists public.record_master_assignments_company_template_uidx;

-- 2) compatibility view 제거
drop view if exists public.record_master_companies;

-- 3) assignments 레거시 컬럼 제거
alter table public.record_master_assignments
    drop column if exists company_id;

commit;

-- 실행 후 점검(선택)
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='record_master_assignments';

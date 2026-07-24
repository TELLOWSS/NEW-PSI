-- PSI training signature integrity and private storage (2026-07-17)

begin;

alter table public.training_logs
    add column if not exists signature_path text,
    add column if not exists signature_evidence_hash text,
    add column if not exists engagement_proof jsonb not null default '{}'::jsonb;

alter table public.training_acknowledgements
    add column if not exists worker_id uuid,
    add column if not exists signature_evidence_hash text;

create index if not exists training_ack_session_worker_lookup_idx
    on public.training_acknowledgements (session_id, worker_id)
    where worker_id is not null;

update storage.buckets
   set public = false
 where id = 'signatures';

drop policy if exists storage_signatures_insert_anon_or_auth on storage.objects;
drop policy if exists storage_signatures_select_admin_only on storage.objects;
drop policy if exists storage_signatures_update_admin_only on storage.objects;
drop policy if exists storage_signatures_delete_admin_only on storage.objects;

create or replace function public.psi_commit_training_signature(
    p_session_id text,
    p_case_id text,
    p_worker_id uuid,
    p_worker_name text,
    p_nationality text,
    p_signature_path text,
    p_signature_evidence_hash text,
    p_audio_url text,
    p_selected_language_code text,
    p_is_manager_proxy boolean,
    p_signature_method text,
    p_reviewed_guidance boolean,
    p_checklist jsonb,
    p_comprehension_complete boolean,
    p_submitted_at timestamptz
)
returns table(training_log_id text, comprehension_complete boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_log_id text;
begin
    if coalesce(trim(p_session_id), '') = ''
       or coalesce(trim(p_worker_name), '') = ''
       or coalesce(trim(p_signature_path), '') = ''
       or coalesce(trim(p_signature_evidence_hash), '') = '' then
        raise exception 'missing signature evidence fields';
    end if;

    insert into public.training_logs (
        session_id,
        case_id,
        worker_id,
        worker_name,
        nationality,
        signature_url,
        signature_path,
        signature_evidence_hash,
        audio_url,
        selected_language_code,
        is_manager_proxy,
        signature_method,
        engagement_proof,
        submitted_at
    ) values (
        p_session_id,
        nullif(trim(p_case_id), ''),
        p_worker_id,
        trim(p_worker_name),
        nullif(trim(p_nationality), ''),
        'private://signatures/' || p_signature_path,
        p_signature_path,
        p_signature_evidence_hash,
        nullif(trim(p_audio_url), ''),
        nullif(trim(p_selected_language_code), ''),
        coalesce(p_is_manager_proxy, false),
        p_signature_method,
        coalesce(p_checklist, '{}'::jsonb),
        coalesce(p_submitted_at, now())
    ) returning id::text into v_log_id;

    if p_worker_id is not null then
        update public.training_acknowledgements
           set worker_name = trim(p_worker_name),
               selected_language_code = nullif(trim(p_selected_language_code), ''),
               reviewed_guidance = coalesce(p_reviewed_guidance, false),
               checklist = coalesce(p_checklist, '{}'::jsonb),
               comprehension_complete = coalesce(p_comprehension_complete, false),
               signature_evidence_hash = p_signature_evidence_hash,
               submitted_at = coalesce(p_submitted_at, now()),
               updated_at = now()
         where session_id = p_session_id
           and worker_id = p_worker_id;

        if not found then
            insert into public.training_acknowledgements (
                session_id, case_id, worker_id, worker_name,
                selected_language_code, reviewed_guidance, checklist,
                comprehension_complete, signature_evidence_hash, submitted_at
            ) values (
                p_session_id, nullif(trim(p_case_id), ''), p_worker_id, trim(p_worker_name),
                nullif(trim(p_selected_language_code), ''), coalesce(p_reviewed_guidance, false),
                coalesce(p_checklist, '{}'::jsonb), coalesce(p_comprehension_complete, false),
                p_signature_evidence_hash, coalesce(p_submitted_at, now())
            );
        end if;
    else
        update public.training_acknowledgements
           set selected_language_code = nullif(trim(p_selected_language_code), ''),
               reviewed_guidance = coalesce(p_reviewed_guidance, false),
               checklist = coalesce(p_checklist, '{}'::jsonb),
               comprehension_complete = coalesce(p_comprehension_complete, false),
               signature_evidence_hash = p_signature_evidence_hash,
               submitted_at = coalesce(p_submitted_at, now()),
               updated_at = now()
         where session_id = p_session_id
           and worker_name = trim(p_worker_name);

        if not found then
            insert into public.training_acknowledgements (
                session_id, case_id, worker_name, selected_language_code,
                reviewed_guidance, checklist, comprehension_complete,
                signature_evidence_hash, submitted_at
            ) values (
                p_session_id, nullif(trim(p_case_id), ''), trim(p_worker_name),
                nullif(trim(p_selected_language_code), ''), coalesce(p_reviewed_guidance, false),
                coalesce(p_checklist, '{}'::jsonb), coalesce(p_comprehension_complete, false),
                p_signature_evidence_hash, coalesce(p_submitted_at, now())
            );
        end if;
    end if;

    return query select v_log_id, coalesce(p_comprehension_complete, false);
end;
$$;

revoke all on function public.psi_commit_training_signature(
    text, text, uuid, text, text, text, text, text, text,
    boolean, text, boolean, jsonb, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.psi_commit_training_signature(
    text, text, uuid, text, text, text, text, text, text,
    boolean, text, boolean, jsonb, boolean, timestamptz
) to service_role;

commit;

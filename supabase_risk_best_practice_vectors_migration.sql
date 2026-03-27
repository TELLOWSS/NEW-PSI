-- ============================================================
-- OCR 우수사례 벡터 저장소 + 매칭 함수
-- 목적: 승인(또는 저장)된 80점 이상 우수 기록을 RAG 검색용으로 적재
-- ============================================================

begin;

create extension if not exists vector;

create table if not exists public.risk_best_practice_vectors (
    id uuid primary key default gen_random_uuid(),
    source_record_id text not null unique,
    safety_score integer not null check (safety_score between 0 and 100),
    original_language text not null default 'ko',
    ko_text text not null,
    actionable_coaching text,
    job_field text,
    nationality text,
    approved_at timestamptz not null default now(),
    embedding vector(768) not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists rbpv_score_idx
    on public.risk_best_practice_vectors (safety_score desc, approved_at desc);

create index if not exists rbpv_language_idx
    on public.risk_best_practice_vectors (original_language);

create index if not exists rbpv_embedding_cosine_idx
    on public.risk_best_practice_vectors
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

create or replace function public.set_rbpv_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists rbpv_set_updated_at on public.risk_best_practice_vectors;

create trigger rbpv_set_updated_at
before update on public.risk_best_practice_vectors
for each row
execute function public.set_rbpv_updated_at();

create or replace function public.match_risk_best_practice_vectors(
    query_embedding_text text,
    match_count int default 3,
    min_score int default 80
)
returns table (
    id uuid,
    source_record_id text,
    safety_score integer,
    original_language text,
    ko_text text,
    actionable_coaching text,
    similarity double precision,
    approved_at timestamptz
)
language sql
stable
as $$
    select
        rbpv.id,
        rbpv.source_record_id,
        rbpv.safety_score,
        rbpv.original_language,
        rbpv.ko_text,
        rbpv.actionable_coaching,
        1 - (rbpv.embedding <=> (query_embedding_text::vector)) as similarity,
        rbpv.approved_at
    from public.risk_best_practice_vectors rbpv
    where rbpv.safety_score >= greatest(min_score, 0)
    order by rbpv.embedding <=> (query_embedding_text::vector)
    limit greatest(match_count, 1);
$$;

commit;

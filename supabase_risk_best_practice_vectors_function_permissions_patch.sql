-- ============================================================
-- risk_best_practice_vectors: 권한/함수 갱신용 최소 패치
-- 용도: 기존 테이블/인덱스는 유지하고, RPC 함수 정의와 실행 권한만 안전하게 갱신
-- ============================================================

begin;

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
security definer
set search_path = public
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

revoke all on function public.match_risk_best_practice_vectors(text, int, int) from public;
grant execute on function public.match_risk_best_practice_vectors(text, int, int) to anon;
grant execute on function public.match_risk_best_practice_vectors(text, int, int) to authenticated;

commit;

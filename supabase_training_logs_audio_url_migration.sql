-- PSI Training Logs Audio URL Migration (2026-03-20)
-- 목적:
-- - training_logs 테이블에 audio_url 컬럼 추가
-- - 오디오 청취 이력 링크 저장 스키마 정합성 확보

begin;

alter table public.training_logs
    add column if not exists audio_url text;

create index if not exists training_logs_audio_url_idx
    on public.training_logs (audio_url);

commit;

-- 선택 검증
-- select id, session_id, worker_id, audio_url from public.training_logs order by submitted_at desc nulls last limit 20;

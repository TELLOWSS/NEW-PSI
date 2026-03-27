-- ============================================================
-- pgvector + 다국어 의미검색 준비 마이그레이션
-- 대상: public.training_sessions (위험성평가 전파교육 원문/번역 저장 테이블)
-- 실행 위치: Supabase Dashboard > SQL Editor
-- ============================================================

begin;

-- 0) pgvector 확장 활성화 (무료 티어에서도 사용 가능)
create extension if not exists vector;

-- 1) 대상 테이블 존재 확인
--    없으면 에러를 내서 초보자도 원인 파악이 쉽도록 처리
DO $$
BEGIN
  IF to_regclass('public.training_sessions') IS NULL THEN
    RAISE EXCEPTION 'Table public.training_sessions not found. 테이블명을 확인하세요.';
  END IF;
END $$;

-- 2) 원본 언어 컬럼 추가
--    예: ko, ru, vi, zh-CN 등 BCP-47 또는 ISO 코드 저장
alter table public.training_sessions
  add column if not exists original_language text;

-- 기존 데이터는 한국어로 가정 (필요 시 다른 값으로 변경)
update public.training_sessions
set original_language = 'ko'
where original_language is null;

alter table public.training_sessions
  alter column original_language set default 'ko';

alter table public.training_sessions
  alter column original_language set not null;

comment on column public.training_sessions.original_language is
  '작성 원본 언어 코드 (예: ko, ru, vi, zh-CN)';

-- 3) 임베딩 컬럼 추가
--    vector(1536): OpenAI text-embedding-3-small 기준
--    다른 모델 사용 시 차원 변경 필요 (예: 3072)
alter table public.training_sessions
  add column if not exists embedding vector(1536);

comment on column public.training_sessions.embedding is
  '의미 검색용 임베딩 벡터';

-- 4) 벡터 검색 인덱스 (코사인 유사도)
--    주의: ivfflat 인덱스는 데이터가 너무 적으면 체감이 작을 수 있음
--    그래도 미리 생성해두면 데이터 증가 시 유리
create index if not exists training_sessions_embedding_cosine_idx
  on public.training_sessions
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 5) 원본 언어 필터용 보조 인덱스
create index if not exists training_sessions_original_language_idx
  on public.training_sessions (original_language);

commit;

-- ============================================================
-- 실행 후 검증 쿼리 (선택)
-- ============================================================
-- select extname from pg_extension where extname = 'vector';
--
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'training_sessions'
--   and column_name in ('original_language', 'embedding');
--
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and tablename = 'training_sessions'
--   and indexname in (
--     'training_sessions_embedding_cosine_idx',
--     'training_sessions_original_language_idx'
--   );

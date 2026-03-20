-- training_logs 중복 제출 방지 마이그레이션
-- 목적:
-- 1) 기존 중복 데이터 정리(최신 1건 유지)
-- 2) 세션+근로자 기준 유니크 인덱스로 중복 물리 차단

-- 1-A) worker_id 기준 중복 제거 (최신 submitted_at, 최신 id 우선)
WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY session_id, worker_id
      ORDER BY submitted_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.training_logs
  WHERE worker_id IS NOT NULL AND btrim(worker_id::text) <> ''
)
DELETE FROM public.training_logs t
USING ranked r
WHERE t.ctid = r.ctid
  AND r.rn > 1;

-- 1-B) worker_id가 비어있는 레거시 행은 worker_name 기준으로 중복 제거
WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY session_id, worker_name
      ORDER BY submitted_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.training_logs
  WHERE (worker_id IS NULL OR btrim(worker_id::text) = '')
    AND worker_name IS NOT NULL
    AND btrim(worker_name) <> ''
)
DELETE FROM public.training_logs t
USING ranked r
WHERE t.ctid = r.ctid
  AND r.rn > 1;

-- 2-A) worker_id가 있는 경우 세션+worker_id 유니크
CREATE UNIQUE INDEX IF NOT EXISTS training_logs_session_worker_id_uniq
ON public.training_logs (session_id, worker_id)
WHERE worker_id IS NOT NULL AND btrim(worker_id::text) <> '';

-- 2-B) worker_id가 없는 레거시 행은 세션+worker_name 유니크
CREATE UNIQUE INDEX IF NOT EXISTS training_logs_session_worker_name_legacy_uniq
ON public.training_logs (session_id, worker_name)
WHERE (worker_id IS NULL OR btrim(worker_id::text) = '')
  AND worker_name IS NOT NULL
  AND btrim(worker_name) <> '';

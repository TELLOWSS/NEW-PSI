-- training_sessions 캠페인/대상자 관리 확장
-- 목적:
-- 1) 월별/특별 교육명을 세션에 명시 저장
-- 2) 이수 대상 산정 방식을 선택 가능하게 구성
--    - submitted_only: 실제 제출자만 모수로 계산 (기본)
--    - attendance_only: 당일 출근자 명단(target_worker_names)만 모수로 계산

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS training_title text;

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS training_category text;

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS target_mode text;

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS target_worker_names jsonb;

UPDATE public.training_sessions
SET training_category = COALESCE(training_category, 'monthly_risk')
WHERE training_category IS NULL;

UPDATE public.training_sessions
SET target_mode = COALESCE(target_mode, 'submitted_only')
WHERE target_mode IS NULL;

UPDATE public.training_sessions
SET target_worker_names = '[]'::jsonb
WHERE target_worker_names IS NULL
   OR jsonb_typeof(target_worker_names) <> 'array';

ALTER TABLE public.training_sessions
  ALTER COLUMN training_category SET DEFAULT 'monthly_risk';

ALTER TABLE public.training_sessions
  ALTER COLUMN target_mode SET DEFAULT 'submitted_only';

ALTER TABLE public.training_sessions
  ALTER COLUMN target_worker_names SET DEFAULT '[]'::jsonb;

ALTER TABLE public.training_sessions
  DROP CONSTRAINT IF EXISTS training_sessions_target_mode_check;

ALTER TABLE public.training_sessions
  ADD CONSTRAINT training_sessions_target_mode_check
  CHECK (target_mode IN ('submitted_only', 'attendance_only'));

ALTER TABLE public.training_sessions
  DROP CONSTRAINT IF EXISTS training_sessions_training_category_check;

ALTER TABLE public.training_sessions
  ADD CONSTRAINT training_sessions_training_category_check
  CHECK (training_category IN ('monthly_risk', 'special_safety'));

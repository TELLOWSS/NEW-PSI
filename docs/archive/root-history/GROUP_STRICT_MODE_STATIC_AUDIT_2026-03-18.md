# Group Strict Mode 정적 점검 보고서 (2026-03-18)

## 1) 점검 목적
- group 전용 운영 전환 전, 코드/문서/SQL에 남아 있는 `company` 참조를 분류하여 운영 리스크를 사전에 제거합니다.

## 2) 점검 결과 요약
- UI 문구(`업체`, `업체명`) 잔재: **핵심 앱 코드 기준 0건**
- 프론트 런타임 코드의 `company` 참조: **의도된 폴백 경로만 존재**
- SQL/운영문서의 `company` 참조: **호환/컷오버/롤백 절차 설명용으로 존재**

## 3) 런타임(프론트) 분류
### A. 의도된 참조 (정상)
- [pages/OcrAnalysis.tsx](pages/OcrAnalysis.tsx)
  - group 전용 조회/저장 경로 사용
  - group 경로 실패 시 명시 에러 안내

### B. strict 전환 후 제거 후보
- [pages/OcrAnalysis.tsx](pages/OcrAnalysis.tsx)
  - fallback OFF를 고정할 경우, `record_master_companies`/`company_id` 폴백 분기 전체 제거 가능

## 4) DB/문서 분류
### A. 호환/전환 필수
- [supabase_master_group_compat_migration.sql](supabase_master_group_compat_migration.sql)
- [supabase_master_group_final_cutover.sql](supabase_master_group_final_cutover.sql)
- [supabase_master_group_cutover_rollback.sql](supabase_master_group_cutover_rollback.sql)
- [supabase_master_group_postcheck.sql](supabase_master_group_postcheck.sql)

### B. 운영 안내 문서
- [OCR_운영_쉬운가이드.md](OCR_%EC%9A%B4%EC%98%81_%EC%89%AC%EC%9A%B4%EA%B0%80%EC%9D%B4%EB%93%9C.md)
- [SUPABASE_GROUP_MIGRATION_CHECKLIST.md](SUPABASE_GROUP_MIGRATION_CHECKLIST.md)
- [SUPABASE_GROUP_CUTOVER_RUNBOOK.md](SUPABASE_GROUP_CUTOVER_RUNBOOK.md)
- [DEPLOYMENT_ENV_CHECKLIST.md](DEPLOYMENT_ENV_CHECKLIST.md)

## 5) strict 모드 전환 체크 (권장)
1. group 전용 코드 배포 확인
2. OCR 화면에서 아래 5개 기능 확인
   - 그룹 조회
   - 그룹 추가
   - 그룹 삭제
   - 배정 저장
   - 배정 상태 전환
3. 장애 시 [supabase_master_group_cutover_rollback.sql](supabase_master_group_cutover_rollback.sql) 기준으로 복구

## 6) 최종 정리 단계
- 운영 안정화가 확인되면 [supabase_master_group_remove_legacy.sql](supabase_master_group_remove_legacy.sql) 실행
- 이후 프론트 폴백 분기 제거(코드 정리 패치) 진행

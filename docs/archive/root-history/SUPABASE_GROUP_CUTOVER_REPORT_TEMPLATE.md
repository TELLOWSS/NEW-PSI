# Supabase Group 전환 실행 결과 보고서 템플릿

작성일: YYYY-MM-DD  
작성자:  
검토자:  
대상 프로젝트: 

---

## 1) 실행 개요
- 전환 유형: `호환 적용` / `최종 컷오버` / `레거시 제거`
- 실행 시간(시작~종료): 
- 영향 범위: OCR 기록 양식/그룹/배정 관리
- 운영 중단 여부: 없음 / 있음(분)

## 2) 사전 조건 확인
- [ ] [supabase_master_template_migration.sql](supabase_master_template_migration.sql) 적용 완료
- [ ] [supabase_master_group_compat_migration.sql](supabase_master_group_compat_migration.sql) 적용 완료
- [ ] [supabase_master_group_postcheck.sql](supabase_master_group_postcheck.sql) 사전 점검 통과
- [ ] [SUPABASE_GROUP_CUTOVER_RUNBOOK.md](SUPABASE_GROUP_CUTOVER_RUNBOOK.md) 기준 절차 확인

## 3) 실행 로그
| 순번 | 실행 SQL/작업 | 시작 시각 | 종료 시각 | 결과(PASS/FAIL) | 비고 |
|---|---|---|---|---|---|
| 1 | supabase_master_group_final_cutover.sql |  |  |  |  |
| 2 | supabase_master_group_postcheck.sql(재검증) |  |  |  |  |
| 3 | OCR 기능 수동 점검(5항목) |  |  |  |  |

## 4) postcheck 결과 기록
### 4-1 핵심 객체 존재
- record_master_templates: 
- record_master_assignments: 
- record_master_groups: 
- record_master_assignment_groups: 

### 4-2 무결성 수치
- total_rows: 
- null_group_id_rows: 
- mismatch_rows: 
- duplicate(group_id+template_id): 

### 4-3 트리거/제약 확인
- trg_record_master_assignments_sync_group_company: 존재 / 미존재
- group_id FK: 정상 / 비정상

## 5) 애플리케이션 검증 결과 (OCR 화면)
- [ ] 그룹 목록 조회
- [ ] 그룹 추가
- [ ] 그룹 삭제
- [ ] 배정 저장
- [ ] 배정 상태 전환

실패 항목 상세:

## 6) 증적(캡처/로그) 첨부 목록
| 구분 | 파일명/링크 | 설명 |
|---|---|---|
| SQL 결과 캡처 |  | 사전 postcheck |
| SQL 결과 캡처 |  | 컷오버 실행 |
| SQL 결과 캡처 |  | 사후 postcheck |
| 화면 캡처 |  | OCR 그룹 목록 |
| 화면 캡처 |  | 배정 저장 완료 |

## 7) 장애 및 복구 이력
- 장애 발생 여부: 없음 / 있음
- 발생 시간:
- 증상:
- 조치:
- 롤백 실행 여부: 아니오 / 예([supabase_master_group_cutover_rollback.sql](supabase_master_group_cutover_rollback.sql))

## 8) 최종 판정
- 최종 상태: 성공 / 조건부 성공 / 실패
- 후속 조치 필요사항:
- 차기 작업 예정:
  - [ ] [supabase_master_group_remove_legacy.sql](supabase_master_group_remove_legacy.sql) 실행
  - [ ] 운영 문서 업데이트 반영

## 9) 후속 공유 문서
- 1페이지 요약본: [SUPABASE_GROUP_CUTOVER_REPORT_ONEPAGE.md](SUPABASE_GROUP_CUTOVER_REPORT_ONEPAGE.md)
- 주간 운영 현황: [SUPABASE_GROUP_WEEKLY_STATUS_TEMPLATE.md](SUPABASE_GROUP_WEEKLY_STATUS_TEMPLATE.md)
- 내부용 1페이지 요약(본사/현장/PM): [SUPABASE_GROUP_CUTOVER_REPORT_ONEPAGE_INTERNAL.md](SUPABASE_GROUP_CUTOVER_REPORT_ONEPAGE_INTERNAL.md)
- 내부용 주간 현황(본사/현장/PM): [SUPABASE_GROUP_WEEKLY_STATUS_INTERNAL.md](SUPABASE_GROUP_WEEKLY_STATUS_INTERNAL.md)
- 결재형 보고서: [SUPABASE_GROUP_CUTOVER_APPROVAL_FORM.md](SUPABASE_GROUP_CUTOVER_APPROVAL_FORM.md)

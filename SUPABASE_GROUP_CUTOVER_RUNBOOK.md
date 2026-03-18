# Supabase Group 최종 전환 런북 (Cutover Day)

목표: `company` 용어 기반 DB 객체를 `group` 기준으로 최종 전환하고, OCR 운영 중단 시간을 최소화합니다.

## A. 적용 전(30분 전)
- [ ] 운영 공지: OCR 관리 기능 10~15분 점검 예정 안내
- [ ] 관리자 1명(실행) + 검증자 1명(화면 확인) 배정
- [ ] Supabase SQL Editor 접속 및 프로젝트 권한 확인
- [ ] 정적 점검 보고서 확인: [GROUP_STRICT_MODE_STATIC_AUDIT_2026-03-18.md](GROUP_STRICT_MODE_STATIC_AUDIT_2026-03-18.md)
- [ ] 아래 파일 준비
  - [supabase_master_group_postcheck.sql](supabase_master_group_postcheck.sql)
  - [supabase_master_group_final_cutover.sql](supabase_master_group_final_cutover.sql)
  - [supabase_master_group_cutover_rollback.sql](supabase_master_group_cutover_rollback.sql)

## B. 사전 게이트(컷오버 직전)
1) [supabase_master_group_postcheck.sql](supabase_master_group_postcheck.sql) 실행
2) 다음 조건이 모두 만족되면 진행
- `has_group_id = true`
- `mismatch_rows = 0`
- `null_group_id_rows = 0`
- `view.record_master_groups = true`
- `view.record_master_assignment_groups = true`

조건 미충족 시 컷오버 중지하고 호환 모드 유지

## C. 본 실행(약 3~5분)
1) [supabase_master_group_final_cutover.sql](supabase_master_group_final_cutover.sql) 실행
2) 에러가 없으면 즉시 postcheck 재실행
3) OCR 화면 새로고침 후 아래 기능 확인
- [ ] 그룹 목록 조회
- [ ] 그룹 추가
- [ ] 그룹 삭제
- [ ] 배정 저장
- [ ] 배정 상태 전환

## D. 승인 기준(Go)
- SQL 실행 에러 없음
- postcheck에서 무결성 경고 없음
- OCR 기능 5개 시나리오 통과

모두 통과하면 전환 완료 공지

## E. 실패 기준(No-Go) 및 복구
아래 중 1개라도 발생하면 즉시 롤백
- cutover SQL 실행 에러로 트랜잭션 중단
- OCR 화면에서 그룹 조회/배정 저장 실패 지속
- postcheck에서 치명 무결성 경고 발생

복구 절차
1) [supabase_master_group_cutover_rollback.sql](supabase_master_group_cutover_rollback.sql) 실행
2) [supabase_master_group_postcheck.sql](supabase_master_group_postcheck.sql) 재실행
3) OCR 화면 기능 재확인 후 호환 모드로 운영 지속

## F. 사후(30분 이내)
- [ ] 운영 완료 공지
- [ ] 실행 로그(시간/실행자/결과) 기록
- [ ] 재배포 후 OCR 화면 그룹 조회/배정 저장 재검증
- [ ] 문제 시 [supabase_master_group_cutover_rollback.sql](supabase_master_group_cutover_rollback.sql) 실행
- [ ] 실행 결과 보고서 작성: [SUPABASE_GROUP_CUTOVER_REPORT_TEMPLATE.md](SUPABASE_GROUP_CUTOVER_REPORT_TEMPLATE.md)
- [ ] 경영/현장 공유용 1페이지 요약 작성: [SUPABASE_GROUP_CUTOVER_REPORT_ONEPAGE.md](SUPABASE_GROUP_CUTOVER_REPORT_ONEPAGE.md)
- [ ] 내부 보고 체계용 요약 작성(본사/현장/PM): [SUPABASE_GROUP_CUTOVER_REPORT_ONEPAGE_INTERNAL.md](SUPABASE_GROUP_CUTOVER_REPORT_ONEPAGE_INTERNAL.md)
- [ ] 결재 필요 시 결재형 문서 작성: [SUPABASE_GROUP_CUTOVER_APPROVAL_FORM.md](SUPABASE_GROUP_CUTOVER_APPROVAL_FORM.md)

## G. 안정화 후 후속 정리(선택)
- [ ] [supabase_master_group_remove_legacy.sql](supabase_master_group_remove_legacy.sql) 실행
- [ ] OCR 화면 주요 기능 재검증(그룹 조회/추가/삭제/배정)

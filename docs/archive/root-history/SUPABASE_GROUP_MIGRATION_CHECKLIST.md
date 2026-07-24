# Supabase Group 전환 체크리스트 (운영용)

목표: OCR 기록 양식/배정 기능을 company 용어에서 group 용어로 안전하게 전환하고, 현장 운영 중단 없이 검증까지 완료합니다.

## 0) 사전 준비
- [ ] Supabase 프로젝트 관리자 권한 확인
- [ ] 운영 시간대 영향 최소 구간(점심/교대 직후 제외) 확보
- [ ] 기존 SQL 백업 또는 스냅샷 확보
- [ ] 현재 프론트 버전이 group 우선 + company 폴백 코드인지 확인

## 1) 적용 순서 (필수)
1. [ ] [supabase_master_template_migration.sql](supabase_master_template_migration.sql) 실행
2. [ ] [supabase_master_group_compat_migration.sql](supabase_master_group_compat_migration.sql) 실행
3. [ ] [supabase_master_group_postcheck.sql](supabase_master_group_postcheck.sql) 실행

## 1-1) 최종 전환 (선택, 안정화 후)
아래 단계는 호환 운영이 충분히 안정화된 뒤에만 실행합니다.

1. [ ] [supabase_master_group_final_cutover.sql](supabase_master_group_final_cutover.sql) 실행
2. [ ] [supabase_master_group_postcheck.sql](supabase_master_group_postcheck.sql) 재실행
3. [ ] OCR 화면에서 그룹 조회/추가/삭제/배정 저장 재검증
4. [ ] 장애 대비 롤백 SQL 준비: [supabase_master_group_cutover_rollback.sql](supabase_master_group_cutover_rollback.sql)
5. [ ] 당일 절차 문서 기준으로 실행: [SUPABASE_GROUP_CUTOVER_RUNBOOK.md](SUPABASE_GROUP_CUTOVER_RUNBOOK.md)
6. [ ] 안정화 후 레거시 제거: [supabase_master_group_remove_legacy.sql](supabase_master_group_remove_legacy.sql)

## 2) SQL 실행 시 기대 결과
- 1단계 실행 후:
  - record_master_templates / record_master_companies / record_master_assignments 테이블 존재
  - RLS 정책 생성
- 2단계 실행 후:
  - assignments 테이블에 group_id 추가
  - company_id ↔ group_id 동기화 트리거 생성
  - record_master_groups, record_master_assignment_groups 뷰 생성

## 3) 애플리케이션 기능 확인 (OCR 화면)
- [ ] 기록 양식 목록 조회 정상
- [ ] 공종/팀 그룹 목록 조회 정상
- [ ] 배정 등록 정상 (그룹 + 템플릿 + 적용일)
- [ ] 배정 상태 전환 정상
- [ ] 그룹 삭제 시 해당 그룹 배정 정리 정상

## 4) 데이터 무결성 확인
- [ ] assignments 전체 건수에서 group_id null 0건
- [ ] company_id와 group_id 불일치 0건
- [ ] 중복 배정 없음 (group_id + template_id)

## 5) 장애 시 즉시 조치
- 증상: OCR 화면에서 배정 목록이 비어 보임
  - 조치 1: postcheck SQL 재실행해 뷰/컬럼 존재 확인
  - 조치 2: 브라우저 새로고침 후 재로그인
  - 조치 3: Supabase RLS 정책/권한 확인
- 증상: 배정 저장 실패
  - 조치 1: group_id 유니크 인덱스/FK 생성 여부 확인
  - 조치 2: 동기화 트리거 존재 여부 확인

## 6) 롤백 가이드 (긴급)
원칙: 데이터 삭제 롤백은 지양하고, 호환 모드(company)로 즉시 복귀합니다.

- 앱 측: 이미 company 폴백이 있으므로 별도 배포 없이 운영 가능
- DB 측: group 관련 뷰/컬럼 이슈가 있어도 company 컬럼 기준으로 즉시 동작 가능
- 장애가 지속되면 신규 배정 작업만 일시 중지하고 조회/기존 운영 우선 유지

## 7) 완료 기준
- [ ] postcheck SQL의 에러/경고 항목 없음
- [ ] OCR 화면 기능 5개 시나리오 모두 성공
- [ ] 운영 담당자에게 용어 전환 안내 완료
- [ ] [OCR_운영_쉬운가이드.md](OCR_%EC%9A%B4%EC%98%81_%EC%89%AC%EC%9A%B4%EA%B0%80%EC%9D%B4%EB%93%9C.md) 공유 완료
- [ ] [SUPABASE_GROUP_CUTOVER_REPORT_TEMPLATE.md](SUPABASE_GROUP_CUTOVER_REPORT_TEMPLATE.md) 기준 실행 결과 보고 완료
- [ ] 결재 라인 필요 시 [SUPABASE_GROUP_CUTOVER_APPROVAL_FORM.md](SUPABASE_GROUP_CUTOVER_APPROVAL_FORM.md) 작성/승인 완료

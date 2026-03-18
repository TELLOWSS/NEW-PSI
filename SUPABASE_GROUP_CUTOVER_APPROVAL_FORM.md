# Supabase Group 전환 결재 보고서 (결재형)

문서번호:  
작성일: YYYY-MM-DD  
보안등급: 내부  

## 1) 결재 정보
- 기안(작성): 
- 검토(PM): 
- 승인(본사): 
- 시행 책임자: 
- 시행 예정일/시간: 

결재 서명
| 구분 | 성명 | 부서 | 서명/날인 | 일시 |
|---|---|---|---|---|
| 기안 |  |  |  |  |
| 검토 |  |  |  |  |
| 승인 |  |  |  |  |

## 2) 전환 목적
- OCR 기록 양식/그룹/배정 관리의 용어/스키마를 group 기준으로 통일
- 운영 중단 최소화 및 복구 경로 확보

## 3) 변경 범위
- DB: cutover SQL / postcheck SQL / rollback SQL
- 앱: OCR 그룹 조회/추가/삭제/배정 관리
- 문서: 런북, 체크리스트, 보고서 템플릿

## 4) 실행 계획
- 기준 절차: [SUPABASE_GROUP_CUTOVER_RUNBOOK.md](SUPABASE_GROUP_CUTOVER_RUNBOOK.md)
- 사전 점검: [supabase_master_group_postcheck.sql](supabase_master_group_postcheck.sql)
- 본 실행: [supabase_master_group_final_cutover.sql](supabase_master_group_final_cutover.sql)
- 장애 복구: [supabase_master_group_cutover_rollback.sql](supabase_master_group_cutover_rollback.sql)

## 5) 리스크 및 대응
| 리스크 | 영향도 | 대응 방안 | 책임자 |
|---|---|---|---|
| group 뷰/컬럼 미적용 | 높음 | postcheck 사전 게이트 | PM |
| 전환 후 배정 저장 실패 | 높음 | 즉시 rollback + 재검증 | PM/현장 |
| 현장 혼선 | 중간 | 1페이지 요약 공유 | 현장 관리자 |

## 6) 승인 조건 (Go/No-Go)
- [ ] postcheck 사전 게이트 통과
- [ ] 컷오버 SQL 에러 없음
- [ ] OCR 핵심 5기능 점검 통과
- [ ] 보고서 작성 완료

## 7) 시행 결과 기입 (사후)
- 시행 일시: 
- 결과: 성공 / 조건부 성공 / 실패
- 장애 여부: 없음 / 있음
- 조치 요약: 
- 상세 보고서: [SUPABASE_GROUP_CUTOVER_REPORT_TEMPLATE.md](SUPABASE_GROUP_CUTOVER_REPORT_TEMPLATE.md)

## 8) 배포/공유 확인
- [ ] 본사 공유 완료
- [ ] PM 공유 완료
- [ ] 현장 공유 완료
- [ ] 주간 현황 반영 완료([SUPABASE_GROUP_WEEKLY_STATUS_INTERNAL.md](SUPABASE_GROUP_WEEKLY_STATUS_INTERNAL.md))

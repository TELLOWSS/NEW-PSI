# MOBILE P1(5/9/11) RUNTIME QA RUNLOG (2026-05-21)

- 대상 화면: 5) 현장 컨텍스트 / 9) 수기 데이터 입력 / 11) 분석 리포트(OPS Alert Sync)
- 기준 문서:
  - `MOBILE_MOCKUP_REALITY_AUDIT_2026-05-20.md`
  - `REPORTS_OPS_ALERT_SYNC_QA_CHECKLIST_2026-05-20.md`
  - `REPORTS_OPS_ALERT_SYNC_QA_RUNLOG_2026-05-20.md`
- 기준 뷰포트: 320x568 / 360x800 / 375x812 / 390x844

---

## 1) 사전검증 (코드/빌드)

### 5번 `field-context-input`
- [x] 저장 전 필수값 검증(공정명/인원 수) 반영
- [x] 저장 상태 피드백(`저장 중`/`저장됨`/`저장 실패`) 반영
- [x] 성공 시 마지막 저장시각 표시 반영

### 9번 `judgment-tagging-input`
- [x] 현재 입력 검증 상태(원문/위험 분류/판단 태그/권장 조치) 표시
- [x] 누락 항목 라벨 가시화 반영
- [x] 입력 완료율 + 검증 상태(PASS/FAIL) + 누락 경고 건수 표시 반영

### 11번 `reports` (OPS Alert Sync)
- [x] API 액션 3종 존재 확인
  - `append-ops-alert-click-log`
  - `list-ops-alert-click-logs`
  - `clear-ops-alert-click-logs`
- [x] `schemaReady` 기반 서버/폴백 분기 코드 존재 확인
- [ ] Supabase SQL 적용 확인(수동 필요)

### 빌드 검증
- [ ] `npm run build` (반영 후 최종 확인)

---

## 2) 런타임 수동 QA 체크리스트

### 2-1) 3분 초단축 실행 순서
- 0:00~0:40: `field-context-input` 진입(320x568) → 공정명 빈값 저장/인원 0 저장으로 오류 피드백 확인
- 0:40~1:30: 정상값 입력 후 저장 → `저장됨` 피드백 + 마지막 저장시각 갱신 확인
- 1:30~2:20: `judgment-tagging-input`에서 원문/위험분류/태그/권장조치 순으로 입력하며 4항목 검증 상태 즉시 갱신 확인
- 2:20~2:50: 기록 1건 추가 후 완료율/검증상태/누락경고 건수 동기화 확인
- 2:50~3:00: 11번은 Reports runlog(A~D)로 이관 체크 후 320 판정란(PASS/FAIL) 입력

### 5번 현장 컨텍스트 (`field-context-input`)
- [ ] 공정명 빈값 상태 저장 시 오류 피드백 노출
- [ ] 인원 0 또는 음수 저장 시 오류 피드백 노출
- [ ] 정상값 입력 후 저장 시 성공 피드백 + 마지막 저장시각 갱신
- [ ] 320 폭에서 저장 버튼/피드백 문구 가독성 유지

### 9번 수기 데이터 입력 (`judgment-tagging-input`)
- [ ] 입력 검증 상태 4항목이 입력 즉시 갱신됨
- [ ] 누락 항목 문구가 현재 입력 상태와 일치함
- [ ] 기록 추가 후 완료율/검증 상태/누락 경고 건수가 동기화됨
- [ ] 320 폭에서 태그 버튼/현황 카드 오터치 없이 동작

### 11번 분석 리포트 (`reports`) · OPS Alert Sync
- [ ] Supabase SQL 적용 후 동기화 상태 `서버 연결` 확인
- [ ] 시나리오 A/B/C/D는 `REPORTS_OPS_ALERT_SYNC_QA_RUNLOG_2026-05-20.md`에 판정 기록
- [ ] 실패 시 `로컬 폴백` 유지 및 앱 비중단 확인

---

## 3) 뷰포트별 판정 기록

### 320x568
- 판정: [ ] PASS  [ ] FAIL
- 메모:
  - 

### 360x800
- 판정: [ ] PASS  [ ] FAIL
- 메모:
  - 

### 375x812
- 판정: [ ] PASS  [ ] FAIL
- 메모:
  - 

### 390x844
- 판정: [ ] PASS  [ ] FAIL
- 메모:
  - 

---

## 4) 최종 판정
- 전체 판정: [ ] PASS  [ ] FAIL  [ ] 보류(수동 런타임 미실행)
- 블로커/이슈:
  - 
- 후속 조치:
  - 
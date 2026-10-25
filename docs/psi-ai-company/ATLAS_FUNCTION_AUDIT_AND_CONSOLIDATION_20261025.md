# PSI 기능별 점검·중복 후보·고도화 1차 (아틀라스 · 2026-10-25)

소스 기준: GitHub main `1ea709535a2d3a592983055cc0fb1883c3ca8d9c`, 17개 제품 영역을 `config/psi-function-inventory.json`에 나열. 이 결과는 이용자별 실제 사용빈도 분석이 아니며 **삭제 확정 기능 0건**이다.

## 실제 수정한 위험
1. `IntegratedWorkBoard` 공종별 우선 점수: `Number(null)`과 `Number('')`는 가짜 0으로 환산됐고, 과거 동일 근로자 기록을 중복 포함했으며 전부 100점이면 공종 미선정. 공식 `coreMetrics` 최근기록·유효점수 규칙으로 단일화. 진짜 0은 유지.
2. 현장 이슈 노트는 `localStorage.psi_site_issues`에만 저장되며 실패·손상 시 사용자 경고가 없었다. 원본 읽기 실패 시 **쓰기 차단**, 저장 완료 응답 후에만 상태 변경, 실패 경고, 기존 기록 키 보존. PC 교차 동기화나 암호화 백업으로 오인하지 말 것.
3. '심각도 높음 {검토 필요 총건수}'와 '실시간 추적' 오해를 수정. 현재 브라우저 노트와 Inspector 서버 조치는 별도 시스템이며 완료/재점검 확인 상태의 자동 연결 없음. **이동 버튼만** 제공.
4. 안전관리비/신호수 인건비 협력사 독립 프로그램을 PSI로 통합하지 않음. 안전관리자·운영 담당자에게만 본프로그램 제공, 근로자의 기존 제한 QR 응답 경로는 별개.

## 정밀 검토만 하고 삭제하지 않은 중복 가능 영역
- 대시보드 `Dashboard.tsx` (4,803줄) vs 작업보드 `IntegratedWorkBoard.tsx`: 데이터와 계산 기준은 한 군데로, 표현/업무 진입점은 서로 목적이 다르면 유지.
- `Reports.tsx`(5,139줄) vs `MonthlyGuidanceReport`, `A4EducationMaterial`, `EducationReturn`: 파일 산출물·승인 상태·이전 링크·현장 교육 실제 사용 확인 후 UI 병합 판정.
- `SafetyChecks` vs `SiteIssueManagement` vs `Inspector`: 인지확인/브라우저 지적노트/증거 기반 조치라는 세 저장·검증 범위가 달라 임의 병합 불가.
- `Settings.tsx`(2,830줄): 설정 UI 모듈별 점진 추출 후보. 삭제·기본설정 초기화 금지.

## 개발 통제
`npm run check:feature-inventory`와 점수·보관 회귀 Vitest, GitHub 전체 CI, 실제 배포 SHA 일치 검증. 유료 AI 호출·Supabase 스키마·데이터 삭제·승인/법적 판단 자동 변경 없음. 아틀라스/나비/루미/코어/세이프/키퍼/프루프는 역할별 검토 관점이며 독립 7-AI 회의 완료를 뜻하지 않음.

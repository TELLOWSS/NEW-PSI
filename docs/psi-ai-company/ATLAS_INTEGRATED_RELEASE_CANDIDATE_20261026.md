# ATLAS 통합 릴리즈 후보 — PR #89 #90 #91 #92 (2026-10-26)

## 목적
Vercel Hobby 일일 100회 배포 한도하에서 미배포 된 네 개의 상호 보완 변경을 **하나의 코드 후보, 한 번의 SHA 일치 미리보기/운영 출고**로 묶어 검증한다. 개발 브랜치에 통합한 것이 실제 운영 배포나 남은 무료 자원 확보를 의미하지 않는다.

## 포함 항목
1. #89: 한도/네트워크/시간초과 상황을 구분하는 친숙한 안내, 저장 결과가 불명확하면 자동 POST 재전송 금지, 비식별 현재 탭 요청 결과.
2. #90: 사용자용 프로그램은 **안전관리자·운영 담당자용**. 근로자는 기존 제한 QR 기록/교육 응답만 별도. 관리자 화면의 Git SHA/백업 확인 (코드 출처이며 배포 성공 아님).
3. #91: 공종 위험인식 신호의 공식 지표 단일화, 현장 로컬 이슈 저장 실패·손상 방지, Inspector 이동 동선. **로컬 노트와 Inspector 서버 DB 자동 이관/상태 연동 없음**.
4. #92: PerformanceAnalysis의 최신 유효 0~100점·공종/팀/표준편차 규칙 단일화, MonthlyGuidance의 EducationReturn/A4/Reports 이동. 출력물 자동 승인·자료 공유 없음.

## 충돌 해결 증명
- `App.tsx`에 #91 현장 지적 → Inspector 이동과 #92 MonthlyGuidance → 교육/보고서 이동을 **둘 다 유지**.
- `package.json`에 #88 기존 무료 용량 검사 + #90 운영자 출고 검사 + #91 17개 기능 인벤토리 검사 + 새 통합 회귀검사 포함.
- `scripts/audit-core-metrics.mjs`은 새 성과분석 helper도 검사함. 검사 비활성화하지 않는다.
- 원본 PRs의 다른 파일은 그대로 합쳤으며, 협력사 안전시설비·신호수 인건비 및 SMART TBM / ZERO DAY 수정하지 않음.

## 릴리즈 게이트
- 소스 단위 검증, 릴리즈 전체 CI, PSI 7개 synthetic journey 통과.
- 동일 SHA의 Vercel Preview READY 확인, 실제 runtime 점검 후 main 병합.
- main 배포 production READY, `new-psi-eta.vercel.app` 운영 도메인 alias SHA 비교. API 402면 배포를 보류하며 한도 우회/자동 유료 전환하지 않는다.
- 월별 PC 암호화 보관함과 Inspector의 실제 Supabase DB/Storage 복구는 별개. 실기기 Android는 추가 검증 항목.

## 중복 판단
기능마다 산출물과 보관 책임이 다르므로 무용 기능 삭제는 없음. 지표 계산은 공통 유효 규칙을 재사용하고, 다른 관리자 업무는 명시적으로 이동한다.

## 역할별 검토 관점
ATLAS 비용·제품 경계 / NAVI 초보자 동선 / LUMI 가시성 / CORE 저장 안정성과 함수 재사용 / SAFI 인간 재점검 승인 / KEEPER 보안·비용 분리 / PROOF 회귀검증. 독립 일곱 AI 실시간 회의가 실제 열렸다는 뜻은 아니다.

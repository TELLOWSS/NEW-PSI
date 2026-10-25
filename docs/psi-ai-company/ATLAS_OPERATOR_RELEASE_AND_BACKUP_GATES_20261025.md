# ATLAS | 운영자 전용 제품 · 무료 Vercel 배포·자료 복구 판정 기준 (2026-10-25)

## 사용자 요구사항
NEW-PSI 및 PSI Inspector는 안전관리자·운영자가 사용하는 **업무 프로그램**이며, 근로자를 대상으로 전체 프로그램을 공유·배포하지 않는다.
기존 근로자 대상 위험성평가 QR·교육 응답은 '제한된 입력 채널'로서 프로그램 공유와 구별한다. 기존 링크 경로를 삭제·무효화하거나 별도 권한을 추가하는 변경은 이 작업에 포함하지 않는다.
협력사의 산업안전보건관리비, 안전시설비·신호수 인건비 원장은 독립 관리 제품으로 그대로 유지한다.

## 실제 기존 확인
- 암호화 PC 보관함 및 전체 복원 무결성 검증: `components/LocalBackupArchivePanel.tsx`, `utils/encryptedLocalBackupArchive.ts`.
- **이 복원 검증은 월별 PC 자료 범위**: 실제 Supabase Inspector DB/스토리지 사진의 재해 복구·RPO/RTO를 입증하지 않는다.
- GitHub Actions 릴리즈 검증과 전제품 검증은 이미 PR 및 main에서 실행.
- `vercel.json`은 `npm run build:verified`를 유지하며, CI/배포 정책이 강제됐는지 별도 확인 전까지 중복 검증을 제거하지 않는다.
- Vercel Hobby는 반복 Preview/Production 배포로 100/day 제한이 실제 발생했다. 관련 수정 묶음 PR과 승인 후 병합으로 횟수를 줄일 필요가 있다.

## 이번 실제 적용
1. `vite.config.ts`가 빌드 때 공개 Git SHA(40자리만)를 **클라이언트 코드의 비밀값 없는 식별자**로 포함; Vercel/GitHub Git SHA 환경값이 없다면 '미확인'이라고 표시.
2. `OperatorReleaseProof`를 관리자 Settings에 추가. 현재 실행 코드와 복사, GitHub/Vercel 확인 링크, 월별 PC 백업 vs Inspector 서버 백업의 범위를 명확히 안내.
3. 인스펙터 독립 화면은 로그인 후 실행 버전 라벨을 보여줌. 인증이나 데이터 범위를 변경하지 않는다.
4. `utils/releaseGate.ts`: CI/Preview/production 비교의 **증거 기반 순수 판정**. Github/Provider 실사용 상태 자동 조회, 저장, 배포, 승인 요청은 실행하지 않음.
5. `scripts/check-operator-release-contract.mjs`와 Vitest를 릴리즈 사전 검증에 추가. Product 계약에서 근로자에게 전체 프로그램 배포를 전제로 하는 변경을 막는다.
6. PR 템플릿에 통합 검증 후보 SHA·백업 영향·제품 경계·운영 별칭 사후 검증을 명시. **실제 자동 Git/Vercel 배포 횟수가 감소했다는 관측 결과는 아님.** 단지 사람의 잦은 배포를 줄이기 위한 절차.

## 출고 판단
- PR head CI PASS + exact SHA Preview READY까지 통과해도 `main`/운영 도메인은 다른 단계.
- 데이터·사진/DB 구조를 수정하는 출고라면 운영 데이터의 **별도 복원 훈련**이 필요하다. 파일 검증은 대체 증거가 아니다.
- 프리뷰 한도 402 시 준비완료/운영반영으로 표시하지 않는다.
- 유료 플랜·테넌트·영업 규모/계약 범위의 판단은 별도 검토. 개발 중 서비스가 근로자 대상 앱이라고 주장하지 않는다.

## 역할별 책임 관점 (독립 7-AI 회의 실행이라는 주장이 아님)
ATLAS 통합·승인근거 | NAVI 관리자 혼란 제거 | LUMI 짧은 버전·접기 UI | CORE 무단 API/저장 없는 빌드 식별 | SAFI 위험성평가/사진 검사와 백업 판단 분리 | KEEPER 근로자·안전관리비 원장 경계와 비밀값 미노출 | PROOF 허위 READY/운영/복원완료를 테스트로 방지.

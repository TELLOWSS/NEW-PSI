# Vercel 배포 프리플라이트 핸드오프 (2026-04-11)

## 1. 현재 상태 요약

현재 PSI 배포 준비 상태는 아래처럼 정리된다.

- 코드 상태: `npx tsc --noEmit` 오류 0건 정리 완료
- 빌드 상태: `npm run build` 성공 확인
- 함수 수 상태: `admin 10 + gateway 1`
- 직접 블로커: `VERCEL_TOKEN` 무효로 `vercel build` 인증 실패

즉, 현재 남은 핵심 이슈는 코드가 아니라 Vercel 인증이다.

---

## 2. 마지막 확인 결과

마지막 로컬 시도 결과:

- 실행 위치: `C:\Users\user\OneDrive\Desktop\개발실\new-psi\NEW-PSI`
- 실행 명령: `npx vercel build`
- 결과: 실패
- 실패 원인: `The specified token is not valid. Use vercel login to generate a new token.`

해석:
- 함수 수 초과 이슈는 gateway 통합으로 1차 정리됨
- TypeScript 오류도 정리 완료
- 현재는 인증 토큰이 유효하지 않아 실제 Vercel preflight가 끝까지 진행되지 못한 상태다

---

## 3. 재검증 선행 조건

아래 3개가 먼저 충족되어야 한다.

1. `VERCEL_TOKEN` 유효값 확보
2. 필요 시 프로젝트 연결 정보 갱신 (`vercel pull` 가능 상태)
3. `api/*` 함수 수가 `admin 10 + gateway 1` 기준선을 유지하는지 재확인

---

## 4. 재검증 순서

### 1단계. 인증 복구
- `VERCEL_TOKEN` 갱신
- 로컬 또는 CI에서 인증 오류가 사라지는지 확인

### 2단계. 프로젝트 연결 확인
- 프로젝트 설정 pull 가능 여부 확인
- 잘못 연결된 팀/프로젝트가 없는지 확인

### 3단계. Preflight 실행
- `vercel build` 재실행
- 함수 수, 빌드, 환경변수 누락 여부를 함께 확인

### 4단계. 최종 판단
- preflight 통과 시 실제 배포 검증으로 이동
- 실패 시 아래 분기 기준으로 원인 재분류

---

## 5. 실패 시 재분류 기준

### A. 인증 실패
- 증상: token invalid, login required, unauthorized
- 조치: `VERCEL_TOKEN` 교체, 팀/프로젝트 연결 재확인

### B. 함수 수 실패
- 증상: Hobby plan function limit 관련 메시지
- 조치: `api/*` 신규 파일 유입 여부 확인, 비핸들러 로직 `lib/server/*` 이동 검토

### C. 환경변수 실패
- 증상: Supabase/Gemini/admin secret 누락
- 조치: [DEPLOYMENT_ENV_CHECKLIST.md](DEPLOYMENT_ENV_CHECKLIST.md) 기준으로 누락값 재주입

### D. 빌드 실패
- 증상: TypeScript 또는 번들 오류
- 조치: 로컬 `npm run build`와 차이점부터 확인

---

## 6. 성공 기준

아래가 모두 충족되면 배포 프리플라이트가 닫힌다.

- `vercel build` 인증 단계 통과
- 함수 수 제한 미초과 확인
- 환경변수 누락 없음
- 빌드 산출 정상 생성

---

## 7. 다음 구현 우선순위

배포 프리플라이트가 닫히면 다음 구현은 아래 1묶음만 진행한다.

1. `Dashboard drill-down` 후속 마감
2. `workflow-status` 액션/차단 사유 문구 표준화
3. 감사 패키지 템플릿 잠금

즉, 현재 기준 최우선은 기능 추가가 아니라 인증 복구 후 preflight 완료다.

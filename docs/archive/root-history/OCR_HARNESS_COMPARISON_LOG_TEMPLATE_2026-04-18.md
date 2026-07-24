# OCR 하네스 비교 로그 템플릿

작성일: 2026-04-18  
사용 목적: 동일 이미지 기준으로 AI Studio / PSI 클라이언트 / PSI 서버 경로를 정밀 비교 기록

---

## 1) 실행 메타

- 실행자:
- 실행 환경(로컬/배포):
- 브랜치/버전:
- 기간:
- 총 샘플 수:

---

## 2) 샘플별 기록표

| 샘플ID | 파일명 | AI Studio | PSI 클라 OCR | PSI 서버 OCR | 최종 판정 | 주 원인 | 비고 |
|---|---|---|---|---|---|---|---|
| S-001 |  | 성공/실패 | 성공/실패 (code) | 성공/실패 (code) | 엔진/파이프라인/정책/입력 |  |  |
| S-002 |  |  |  |  |  |  |  |
| S-003 |  |  |  |  |  |  |  |

판정 규칙:
- AI Studio 성공 + 클라 성공 + 서버 실패 => 파이프라인/서버 경로 우선
- AI Studio 성공 + 클라 실패 + 서버 실패 => 입력/프롬프트/스키마 우선
- AI Studio 성공 + 서버 성공 + UI 실패표시 => 하네스 동기화/상태 처리 우선

---

## 3) 상세 Trace (서버/클라)

각 샘플마다 최소 1회 기록

### Sample: S-___
- `ocrFailureCode`:
- `ocrUnknownSubCategory`:
- `ocrTrace.providerUsed`:
- `ocrTrace.latencyMs`:
- `ocrTrace.attempts`:
- `ocrTrace.fallbackDepth`:
- `ocrTrace.finalCode`:
- 서버 에러 코드(있는 경우):
- 서버 에러 메시지(요약):

---

## 4) 실패코드 집계

| 코드 | 건수 | 비중(%) | 대표 샘플 |
|---|---:|---:|---|
| QUOTA |  |  |  |
| KEY |  |  |  |
| NETWORK |  |  |  |
| PARSE |  |  |  |
| FORMAT |  |  |  |
| PAYLOAD |  |  |  |
| UNKNOWN |  |  |  |

### UNKNOWN 2차 분류

| 서브카테고리 | 건수 | 비중(%) | 대표 샘플 |
|---|---:|---:|---|
| network-like |  |  |  |
| parse-like |  |  |  |
| policy-like |  |  |  |
| uncategorized |  |  |  |

---

## 5) 결론 요약 (One Page)

- 가장 큰 실패 유형:
- AI Studio 대비 PSI 격차 포인트:
- 서버 경로 이슈 여부(예/아니오):
- 파서/스키마/환경 중 우선 조치 대상:
- 24시간 내 즉시 액션 3개:
  1.
  2.
  3.

---

## 6) 승인 체크

- 기술 검증 승인:
- 운영 승인:
- 다음 점검 일정:

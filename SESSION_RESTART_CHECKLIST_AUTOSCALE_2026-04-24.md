# 재시작 자동 체크리스트 (2026-04-24 이후)

## 0) 목적
이 문서는 프로그램 재시작 시 자동적으로 따라야 할 규칙 사항과 필수 체크항목을 정리한 것입니다.
매번 이 문서부터 시작하여 전일 상태를 복원하고 다음 작업을 진행하세요.

---

## 1) 재시작 0분: 핵심 기준 확인 (이 부분은 절대 변경 금지)

### 1-1. 평가 규칙 (절대 유지)
```
✓ 6대 지표는 정답형 키워드 채점이 아니라 자유기술 앵커(A/B/C) 기준
✓ 점수 정합은 scoreBreakdown 합산 우선
✓ 경미 수정 시 점수 급변 금지(캘리브레이션 유지)
```

### 1-2. 품질 원칙 (절대 유지)
```
✓ strict8(±8) 유지: 유사 맥락 점수 편차 통제
✓ verify:fast 통과: 배포 전 필수 검증
✓ verify:release 통과: 릴리즈 전 필수 검증
```

### 1-3. 비용 원칙 (절대 유지)
```
✓ 전수 OCR 금지 (원칙)
✓ 텍스트 백필 우선
✓ OCR_REQUIRED만 예외 처리
✓ TEXT_ONLY_REVIEW는 관리자 큐 분리
```

### 1-4. 다국적 원칙 (절대 유지)
```
✓ 핵심 9개국 QA 기준 유지:
  베트남, 중국, 태국, 캄보디아, 인도네시아, 몽골, 러시아, 카자흐스탄, 미얀마
✓ 모국어+한국어 병기
✓ 폴백 문구 유지
✓ 공란 방지 규칙 유지
```

### 1-5. 신뢰성 4축 (절대 유지)
```
✓ 설명 가능성: scoreReasoning 100% 기록, 앵커 판정 명시
✓ 일관성: strict8(±8) 게이트 운영
✓ 재현성: 규칙 버전, 시각, 커밋 기록
✓ 현업 성과: 비용/품질/재현성 3축 동시 관리
```

**⚠️ 위 5개 항목은 그 어떤 상황에서도 변경 불가**

---

## 2) 재시작 2분: 문서 맵 확인

### 2-1. 핵심 기초 문서 (변경 금지)
- [SIX_METRIC_ANCHOR_RUBRIC_GUIDE.md](SIX_METRIC_ANCHOR_RUBRIC_GUIDE.md)
- [SESSION_RESUME_HANDOFF_2026-04-22_BACKFILL_AND_RULES.md](SESSION_RESUME_HANDOFF_2026-04-22_BACKFILL_AND_RULES.md)
- [UPGRADE_STORY_OPERATIONS_JOURNAL_2026-04-22.md](UPGRADE_STORY_OPERATIONS_JOURNAL_2026-04-22.md)

### 2-2. 2026-04-23 신뢰성 입증 세트 (신규, 필독)
- [METRIC_RULE_RELIABILITY_PROOF_ONEPAGE_2026-04-23.md](METRIC_RULE_RELIABILITY_PROOF_ONEPAGE_2026-04-23.md) — 원페이지 기준서
- [METRIC_RULE_SAMPLE_VALIDATION_TEMPLATE_2026-04-23.md](METRIC_RULE_SAMPLE_VALIDATION_TEMPLATE_2026-04-23.md) — 표본 검증 템플릿
- [METRIC_RULE_EXPERT_ALIGNMENT_TEMPLATE_2026-04-23.md](METRIC_RULE_EXPERT_ALIGNMENT_TEMPLATE_2026-04-23.md) — 평가자 합치도 템플릿
- [METRIC_RULE_EXEC_BRIEF_2026-04-23.md](METRIC_RULE_EXEC_BRIEF_2026-04-23.md) — 경영자 브리핑

### 2-3. 검증 결과 예시 (참고)
- [METRIC_RULE_SAMPLE_VALIDATION_RESULTS_EXAMPLE_2026-04-23.md](METRIC_RULE_SAMPLE_VALIDATION_RESULTS_EXAMPLE_2026-04-23.md)
- [METRIC_RULE_EXPERT_ALIGNMENT_RESULTS_EXAMPLE_2026-04-23.md](METRIC_RULE_EXPERT_ALIGNMENT_RESULTS_EXAMPLE_2026-04-23.md)

### 2-4. KPI 및 보고 체계 (자동화)
- [METRIC_RULE_RELIABILITY_KPI_DASHBOARD_2026-04-23.md](METRIC_RULE_RELIABILITY_KPI_DASHBOARD_2026-04-23.md)
- [METRIC_RULE_KPI_AUTOMATION_GUIDE_2026-04-23.md](METRIC_RULE_KPI_AUTOMATION_GUIDE_2026-04-23.md)
- [METRIC_RULE_EXECUTIVE_MONTHLY_REPORT_TEMPLATE_2026-04-23.md](METRIC_RULE_EXECUTIVE_MONTHLY_REPORT_TEMPLATE_2026-04-23.md)

### 2-5. 대외 발표 (필요 시)
- [METRIC_RULE_EXTERNAL_PRESENTATION_ONEPAGE_2026-04-23.md](METRIC_RULE_EXTERNAL_PRESENTATION_ONEPAGE_2026-04-23.md)

---

## 3) 재시작 5분: 운영 체크리스트

### 체크 A. 코드 상태 확인
- [ ] 마지막 배포 커밋 확인 (git log)
- [ ] `verify:release` 마지막 실행 결과 확인
- [ ] reports/ 디렉토리 최신 파일 확인

### 체크 B. 데이터 상태 확인
- [ ] `reports/records-export.json` 존재 확인
- [ ] 마지막 backfill-readiness.md 확인
- [ ] 마지막 policy-impact-onepager.md 확인

### 체크 C. 운영 상태 확인
- [ ] OPS_DAILY_LOG_TEMPLATE_BACKFILL_OCR_2026-04-22.md 최신 기록 확인
- [ ] 전일 KPI 수치 메모
- [ ] 오늘 의사결정 항목 정리

### 체크 D. 신뢰성 상태 확인
- [ ] strict8 PASS율 (목표: 90% 이상) — 현황: ?
- [ ] 근거기록률 (목표: 95% 이상) — 현황: ?
- [ ] 감사로그율 (목표: 95% 이상) — 현황: ?
- [ ] 비용절감율 (목표: 20% 이상) — 현황: 23.53% ✓

---

## 4) 재시작 10분: 자동 실행 명령

### Priority 1. 일일 KPI 수집 (항상)
```bash
npm run kpi:collect-daily
# 또는 수동으로
node scripts/auto-collect-daily-kpi.js
```

### Priority 2. 백필/정책 분석 (데이터 변경 시)
```bash
npm run analyze:backfill-readiness
npm run analyze:policy-impact:full
```

### Priority 3. 품질 게이트 (배포 전)
```bash
npm run check:score-consistency:strict8
npm run verify:release
```

### Priority 4. 월간 보고 (매월 1일)
```bash
npm run kpi:generate-monthly
# 또는
node scripts/auto-generate-monthly-kpi-report.md.js
```

---

## 5) 재시작 20분: 오늘 할 일 확인 및 진행

### 5-1. 오늘 운영 의사결정 3가지 확인
1. 지표 규칙 변경 사항 있는가?
2. 데이터 품질 문제 있는가?
3. KPI가 목표치에서 벗어났는가?

### 5-2. 오늘 구체적 작업 정의
- [ ] 표본 검증 (해당 주차)
- [ ] 평가자 합치도 확인 (해당 주차)
- [ ] KPI 리포트 생성 (해당 요일)
- [ ] 경영자 보고 (월간 1일)

### 5-3. 이슈 추적
전일 이슈 문서 확인:
- 해결된 이슈: ?
- 진행 중 이슈: ?
- 신규 이슈: ?

---

## 6) 운영 일일 체크포인트 (매일)

### 아침 (오전 9시)
- [ ] KPI 수집 실행
- [ ] 어제 백필 결과 확인
- [ ] 점수 변경 이슈 있는지 확인

### 낮 (오후 3시)
- [ ] strict8 PASS율 확인
- [ ] 수동수정 발생 건 확인
- [ ] 감사로그 누락 건 확인

### 저녁 (오후 6시)
- [ ] 오늘 의사결정 정리
- [ ] 내일 우선순위 결정
- [ ] 이슈 누적 여부 확인

---

## 7) 주간 체크포인트 (매주 월요일)

- [ ] 주간 KPI 평균 계산
- [ ] 전주 대비 변화 분석
- [ ] 평가자 합치도 샘플 평가 (해당 주 예정)
- [ ] 규칙 변경 사항 있는지 검토
- [ ] 다음 주 계획 수립

---

## 8) 월간 체크포인트 (매월 1일)

- [ ] 월간 KPI 보고서 자동 생성
- [ ] 경영자 월간 보고서 작성
- [ ] 다음 달 목표 재설정
- [ ] 규칙 버전 업데이트 검토
- [ ] 표본 30~50건 추가 검증 (진행 중)

---

## 9) 예외 상황 대응

### 상황 1: strict8 PASS율 < 90%
```
→ 즉시 점수 비교 데이터 확인
→ 유사사례 편차 분석
→ 앵커 판정 재검토
→ 필요 시 규칙 보정
```

### 상황 2: 근거기록률 < 95%
```
→ scoreReasoning 누락 건 식별
→ 해당 건 관리자 재처리
→ 입력 프로세스 강화
```

### 상황 3: 감사로그율 < 95%
```
→ 점수 변경 건별 추적
→ 감사로그 누락 건 발견
→ 승인 프로세스 강제 재적용
```

### 상황 4: 비용절감율 추이 감소
```
→ OCR_REQUIRED 비율 확인
→ 구조화 데이터 품질 점검
→ 백필 허용 범위 재검토
```

---

## 10) 연결 문서 (재시작 시 먼저 읽기 순서)

**1순위 (필수)**
1. 이 문서 (재시작 체크리스트)
2. [METRIC_RULE_RELIABILITY_PROOF_ONEPAGE_2026-04-23.md](METRIC_RULE_RELIABILITY_PROOF_ONEPAGE_2026-04-23.md)
3. [SIX_METRIC_ANCHOR_RUBRIC_GUIDE.md](SIX_METRIC_ANCHOR_RUBRIC_GUIDE.md)

**2순위 (운영)**
4. [OPS_DAILY_LOG_TEMPLATE_BACKFILL_OCR_2026-04-22.md](OPS_DAILY_LOG_TEMPLATE_BACKFILL_OCR_2026-04-22.md)
5. [METRIC_RULE_RELIABILITY_KPI_DASHBOARD_2026-04-23.md](METRIC_RULE_RELIABILITY_KPI_DASHBOARD_2026-04-23.md)

**3순위 (심화, 필요 시)**
6. [UPGRADE_STORY_OPERATIONS_JOURNAL_2026-04-22.md](UPGRADE_STORY_OPERATIONS_JOURNAL_2026-04-22.md)
7. 기타 검증 템플릿들

---

## 11) 다음 판독권자별 확인사항

### 근로자 관점에서 (공정성)
- [ ] 점수 근거가 명확한가? (scoreReasoning 100%)
- [ ] 변경 이유가 설명되는가? (감사로그 100%)
- [ ] 경미수정으로 점수가 급변하지 않는가? (급변금지 95%)

### 평가자 관점에서 (일관성)
- [ ] 비슷한 맥락에 비슷한 점수인가? (strict8 PASS 90%)
- [ ] 편차가 게이트 내인가? (최대 편차 ±8)
- [ ] 전문가 판단과 시스템이 맞는가? (합치도 75%)

### 경영자 관점에서 (성과)
- [ ] 비용이 절감되는가? (23.53% 유지)
- [ ] 품질이 유지되는가? (strict8 PASS 유지)
- [ ] 재현 가능한가? (verify:release 100%)

---

## 12) 이 문서 사용 방법

매 세션 시작 시:
1. 1~4 섹션 읽기 (지표 확인)
2. 5 섹션 실행 (오늘 계획)
3. 6~8 섹션 참고 (주기별 체크)
4. 9 섹션 숙지 (예외 대응)

문제 발생 시:
- 9 섹션 해당 상황 찾기
- 그에 맞는 연결 문서 즉시 열기
- 대응 절차 실행

---

**최종 원칙**: 이 체크리스트와 연결 문서들이 정의한 규칙은 절대 변경되지 않습니다.
매 세션마다 이를 기반으로 현재 상태를 파악하고 다음 단계를 진행하세요.

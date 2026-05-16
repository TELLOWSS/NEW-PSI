# WORKSPACE ↔ LOCAL 동기화 체크리스트 (2026-05-16)

- 목적: VS Code 워크스페이스에서 반영된 PSI Human Risk/태깅 QA 변경사항을 로컬 저장소(`C:\Users\user\OneDrive\Desktop\개발실\new-psi\NEW-PSI`)에 누락 없이 동기화한다.
- 배경: 로컬에서 `npm run check:judgment-tagging*` 스크립트가 없다고 표시됨.

---

## 1) 로컬에 반드시 반영해야 할 파일

### 신규 문서/템플릿
1. `PSI_HUMAN_RISK_ENGINE_PLAN_2026-05-16.md`
2. `PSI_JUDGMENT_TAGGING_TEMPLATE_V1_2026-05-16.md`
3. `PSI_DATA_MODEL_ALIGNMENT_2026-05-16.md`
4. `PSI_TAGGING_QA_AUTOMATION_GUIDE_2026-05-16.md`
5. `templates/psi_judgment_tagging_template_v1.csv`
6. `templates/psi_ontology_v1_seed_2026-05-16.csv`
7. `templates/psi_judgment_tagging_blank_100rows_v1_2026-05-16.csv`
8. `templates/psi_judgment_tag_codebook_v1_24_2026-05-16.csv`
9. `WORKSPACE_LOCAL_SYNC_CHECKLIST_2026-05-16.md`

### 신규 스크립트
10. `scripts/check-judgment-tagging-quality.cjs`
11. `scripts/generate-judgment-tagging-ops-summary.cjs`

### 수정 파일
12. `package.json`  (judgment-tagging scripts 확장)
13. `OPS_DAILY_LOG_2026-05-07.md`
14. `NEXT_SESSION_HANDOFF_LATEST.md`

---

## 2) 로컬 동기화 후 확인 명령

프로젝트 루트에서 실행:

1. 스크립트 등록 확인
- `npm run | findstr judgment-tagging`

2. 샘플 CSV 품질검증
- `npm run check:judgment-tagging`

3. 빈 100행 템플릿 검증
- `npm run check:judgment-tagging:blank100`

4. 리포트 생성
- `npm run check:judgment-tagging:report`

5. OPS 3줄 요약 생성
- `npm run report:judgment-tagging:ops-summary`

6. 일괄 실행(권장)
- `npm run check:judgment-tagging:full`

7. 리포트 파일 존재 확인
- `dir reports\judgment-tagging-quality.*`
- `dir reports\judgment-tagging-ops-summary.md`

---

## 3) 기대 결과

- `npm run` 목록에 아래 3개가 출력됨
- `npm run` 목록에 아래 5개가 출력됨
  - `check:judgment-tagging`
  - `check:judgment-tagging:blank100`
  - `check:judgment-tagging:report`
  - `report:judgment-tagging:ops-summary`
  - `check:judgment-tagging:full`
- `check:judgment-tagging:report` 실행 후 아래 파일 생성
  - `reports/judgment-tagging-quality.json`
  - `reports/judgment-tagging-quality.md`
- `report:judgment-tagging:ops-summary` 실행 후 아래 파일 생성
  - `reports/judgment-tagging-ops-summary.md`

---

## 4) 실패 시 점검

1. 루트 경로 확인
- `Get-Location`
- 반드시 `...\NEW-PSI` 루트여야 함

2. 파일 존재 확인
- `Test-Path .\scripts\check-judgment-tagging-quality.cjs`
- `Test-Path .\templates\psi_judgment_tag_codebook_v1_24_2026-05-16.csv`

3. package.json 반영 확인
- `Select-String -Path .\package.json -Pattern "check:judgment-tagging"`

---

## 5) 다음 단계

- 동기화 완료 후, 표본 100건 태깅 입력을 진행한다.
- 태깅 중간/최종 시점마다 `check:judgment-tagging:report`를 실행해 품질 리포트를 보관한다.

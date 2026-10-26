# ATLAS PSI · Laya 다국어 안전위험 분류 오프라인 평가 (2026-10-26)

## 사실 검증
- 원본: NandhaKishorM/laya, Apache-2.0. 2026-10-26 코드 업데이트 확인.
- Laya는 번역 엔진이 아니라 **typed choice/score/noul 판단 분류 엔진**. 번역 정확성 검사로 과대 해석하지 않는다.
- convaiinnovations/laya-multilingual 모델카드는 Apache-2.0을 명시하며 322M 파라미터/언어별 분류 기반 모델. 해당 모델의 건설안전/11개 언어 현장 정확도는 PSI 자체 검증 전 **미확인**.
- 공식 known limits: 체크포인트/언어/선택지 순서/질문 문구/도메인 변경에 따라 정확도·과신 변동. 일반 벤치마크의 성능을 산업안전 배포 근거로 사용하지 않는다.

## 이번 구현
1. `utils/layaSafetyBenchmark.ts`에 11개 언어 x 3개 인공 사례(추락, 낙하물 피격, 특정 위험 없음) = 33건 기준 데이터 및 오류/누락 평가기 개발.
2. 한국어 외국어 문장은 빈칸을 유지. 현지 통역자의 **실제 번역 검토** 전에는 평가 분모에 포함되지 않는다.
3. 개발자 경험 모드의 교육자료 스튜디오 **3. 5단계 검수** 화면에 `LayaOfflineBenchmarkPanel`을 추가. 가상 시험자료 내려받기 → PC에서 로컬 Laya 실행 → JSON 결과 가져오기 → 언어별 비교·위험 누락·예측 누락 집계/보고서 내려받기.
4. `scripts/laya_safety_offline_runner.py` 로컬 실험 스크립트만 보관. 별도 Python 환경에서 개발자가 수동 실행; Hugging Face 오프라인 플래그를 켜 모델 자동 다운로드 없이 캐시된 체크포인트만 사용. 모델 초기 파일 다운로드가 필요하면 사용자/관리자의 사전 허가·저작권·자산 검토 필요.
5. UI 및 자동집계는 **모델 자체를 구동하지 않음**. 사용자가 가져온 실험 결과를 계산할 뿐, JSON 진위·전문가 서명·모델 운영 실행은 독립 검증 불가. 보고서는 항상 `research-only`, `safetyApproved: false`, `provenanceVerified: false`.
6. 표본 33건으로는 산업안전 배포를 승인할 수 없음. 언어별 50건 이상 전문가 라벨 확장, 재난성 위험 false negative, 실제 현장 통역자 검증, 체크포인트 버전별 회귀 확인 필요.

## 사용법
- PSI 개발자 경험 모드 활성화 (일반 현장 운영자 화면 노출 아님)
- 관리자 → 위험성평가 교육자료 스튜디오 → 3. 5단계 검수 → ATLAS LAB
- `11개 언어 시험자료 저장`으로 JSON 추출 → 외국어 문장을 현장 통역자가 번역 및 직접 검토한 경우에만 translationReview를 reviewed로 기록 → 로컬 PC에서 아래 명령 실행
- `python scripts/laya_safety_offline_runner.py --input completed.json --output results.json --checkpoint-revision 실제_모델_리비전`
- `오프라인 시험 결과 불러오기`에서 결과 확인. 각 언어 평가 개수, 정답·위험누락·누락 예측을 확인하며 관리자 검토 전 승인 불가.

## Vercel Hobby / 상업화
- 신규 Vercel API, cron, 데이터베이스, 환경변수, 유료 AI 호출, 영상렌더 함수 추가 **없음**.
- 웹앱에 Python, 모델 가중치, onnxruntime, pytorch, transformers, Laya npm 패키지 **설치하지 않음**.
- Laya 실행은 사내 승인된 별도 오프라인 PC에서만. 클라이언트 웹 페이지는 파일 내보내기/파일 읽기/수치 집계만 수행.
- vercel.json fluid:true 및 기존 30/90/240초 maxDuration 유지. 명시적인 무료 한도 초과 방지용 자동 테스트 포함.
- Vercel Hobby 무료 플랜을 당장 변경하지 않음. 정식 **상업 서비스 운영 전에** Hobby 비상업 이용 약관 및 OSS/모델 LICENSE·NOTICE 검토 별도.
- 함수 호출 추가분 0은 **이번 기능의 코드 경계**만 해당; 기존 앱의 실제 월간 남은 사용량·빌드 분·CDN 전송량 보증 아님.
- 개발 중 여러 차례 불필요한 Vercel 미리보기 빌드가 발생하지 않도록 단일 Git 커밋으로 PR 구성.

## 허용/금지
- 허용: 개인식별자가 없는 가상 위험 유형 분류 품질 실험과 관리자 검증.
- 금지: 실제 현장 사진/근로자 이름·서명 전송, 작업중지 자동결정, 위험성평가 상등급 자동 확정, 근로자 교육 통과 자동 승인, 검증 없이 6대 PSI 지표 대체.
- 검증: 타입/테스트/7개 제품 합성 브라우저 회귀/동일 SHA Preview READY 후 main 병합. Android 실기기·11개 언어 전문 검증은 별도 미완료 항목.

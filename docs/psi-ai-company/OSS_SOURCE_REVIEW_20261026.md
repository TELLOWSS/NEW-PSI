# ATLAS · 오픈소스 7종 도입·상업화 검증 (2026-10-26)

## 검증 범위 및 판단
소스: 사용자가 제시한 7개 GitHub 저장소의 `LICENSE`와 `README.md`, VoiceStudio `LICENSE-NOTICE.md`, Shaders의 2026-10-06 플랫폼 라이선스, Hugging Face Laya 모델 카드, Vercel Hobby 공식 조건. 본 문서는 법률의견이 아니라 **릴리즈 전 사실확인과 도입 게이트**다. 각 원본은 사용 시점의 커밋/패키지 버전과 재배포 파일별 권리를 다시 확인한다.

**구조적 핵심**: GitHub 저장소의 소스 코드 라이선스, AI 모델 가중치 라이선스, 상용 프리셋/음원/이미지 라이선스, 호스팅 서비스 약관은 서로 다르다. 한 영역의 허용이 다른 영역의 허용을 보장하지 않는다.

| 후보 / 원본 | 코드 라이선스 | PSI 적합성 / 도입 단계 | 상업화 및 품질 통제 |
|---|---|---|---|
| VoiceStudio [원본](https://github.com/debpalash/VoiceStudio) | AGPL-3.0-only | 다국어 안전교육 오디오/더빙 아이디어. **독점적 서비스 직접 통합 보류** | AGPL의 수정 네트워크 제공 및 대응 소스 공개 의무 범위 법률검토 필요. 공식 [LICENSE-NOTICE](https://github.com/debpalash/VoiceStudio/blob/main/LICENSE-NOTICE.md)는 기본 OmniVoice 사전학습 가중치 CC-BY-NC를 명시. 모델 가중치, 음성 동의, 결과물 권리는 별도. 사내 오프라인 비교평가만 검토. |
| HyperFrames [원본](https://github.com/heygen-com/hyperframes) | Apache-2.0 | **높음 · 오프라인 안전교육 영상 렌더링 후보** | Node.js 22+, Chromium/FFmpeg 및 코덱, 폰트, 음악·이미지 자산 권리 확인. Vercel Hobby 서버리스 안에서 장시간 동영상 렌더링 금지. 별도 배치 PC/CI/유료 렌더러로 분리 검토. NOTICE/변경 표시 보존. |
| Matt Pocock Skills [원본](https://github.com/mattpocock/skills) | MIT | **선별 적용: development-only 도메인 모델링 스킬** | `skills/engineering/domain-modeling`의 3개 문서와 upstream MIT 라이선스를 고정 커밋으로 그대로 보관. 사람의 안전 승인·제품 경계·사내 보안 지침을 덮어쓰지 않는다. 자동 외부 호출 없음. |
| Laya [원본](https://github.com/NandhaKishorM/laya) | Apache-2.0 | **언어별 진술/지적 유형 분류에만 제한적 벤치마크** | [멀티언어 모델](https://huggingface.co/convaiinnovations/laya-multilingual) 카드 역시 Apache-2.0을 표시하지만 322M급 체크포인트·ONNX 런타임 크기, 훈련 언어별 정확도, 11개 현장언어에 대한 편향·오분류, 데이터 전송/저장과 테스트 검증이 선행되어야 함. 작업중지·법 위반·개선완료 자동 판정 금지. API와 모델 아티팩트 각각 고정. |
| Shaders [원본](https://github.com/shader-effects-inc/shaders) | MIT | **UI 데모 한정.** 별도 히어로/로딩 화면 후보 | 2026-10-06 [공식 플랫폼 라이선스](https://shaders.com/license)에서 GitHub/npm MIT 코드와 웹 프리셋·섹션은 구분. Pro 콘텐츠 무단 복사 금지. WebGPU 미지원 브라우저·저사양 휴대폰에서 정적 대체 UI, 성능/전력/접근성 QA와 통신·텔레메트리 검토 후 선정. 안전 데이터 카드에는 지속 효과 남용 금지. |
| REA [원본](https://github.com/morluto/rea) | MIT | **개발 내부 수동 QA 도구** | 자사 코드/사용 허락을 받은 테스트 앱 및 인가된 합성 트래픽만 대상. 제3자 소프트웨어 역공학, 경쟁사 소스 복제, 실근로자 정보·쿠키/토큰 기록 금지. 외부 프로세스 설치/실행은 별도 검증 필요. 운영 의존성 불가. |
| Diagram Design [원본](https://github.com/cathrynlavery/diagram-design) | MIT | **안전관리 보고서·PSI 기술 구성도 제작 후보** | PNG/SVG/HTML 정적 산출물은 유용. [PRIVACY.md](https://github.com/cathrynlavery/diagram-design/blob/main/PRIVACY.md)는 Google Fonts 요청이 발생할 수 있음을 명시. 실현장 개인정보 포함 자료는 외부 글꼴·온보딩 사이트 호출을 차단하고 검토한 뒤 제작. 코드 자동 이식보다 기존 PSI 브랜딩과 접근성 기준으로 템플릿 검증. |

## 상업화 위험도 — 구체 조치
1. **운영 호스팅:** Vercel Hobby는 [공식 문서](https://vercel.com/docs/plans/hobby)와 [약관](https://vercel.com/legal/terms)에서 비상업적 개인용으로 제한. 사업/고객 유료 서비스 전 Pro/Enterprise 또는 조건이 맞는 대체 호스팅으로 전환 확인. 기술적 호출 한도와 법적 이용범위를 구분.
2. **저작권 고지:** MIT는 LICENSE/저작권 고지를 소스·실질적 배포에 포함, Apache-2.0은 라이선스·변경기록·해당 NOTICE 등의 의무 점검. 단순 '무료'가 권리 무제한을 뜻하지 않음.
3. **AGPL:** VoiceStudio 앱의 AGPL 조건과 독점 PSI 결합 범위를 법률검토 없이 승인하지 않음. 기업용 별도 계약이 있더라도 기본 모델 가중치 권리를 대체하지 않음.
4. **AI 모델:** 다운로드하는 Laya·VoiceStudio 모델은 학습/평가 데이터셋 및 체크포인트 재배포 조건을 별도로 확인. 안정성은 개발사 주장과 실제 현장 검증을 구분. 현장 재해 위험 판단에 확률값을 유일 근거로 사용 금지.
5. **보안·개인정보:** 새 CLI·agent skill은 저장소 읽기/네트워크 접근 권한과 스크립트 실행을 점검. 본 검토에서는 자동 `curl|sh`/원격 스크립트 설치 금지. 실현장 사진·근로자 이름·서명·음성 외부 업로드 금지. 모델 추론과 임시 영상처리는 별도 작업공간 사용.
6. **소유 제품 분리:** NEW-PSI 인스펙터와 협력사 안전관리비 독립 앱, SMART TBM, PSI ZERO DAY는 저장 데이터/API/인증/과금 혼합 금지.

## 현재 적용한 것 / 미적용한 것
**적용:** Matt Pocock의 MIT `domain-modeling` 원본 문서 3개를 `.agents/skills/domain-modeling/` 아래 고정 커밋으로 보존하고 원본 LICENSE 및 `ORIGIN.md` 동봉. 현장 용어 체계를 `GLOSSARY.md`에 정리. 이 도입은 개발 문서/판단 기준만 개선하고 PSI 실행 파일, Vercel 서버 부하, 운영 현장 데이터에 영향을 주지 않음.

**미적용:** 6개 다른 후보의 런타임 npm 패키지, 모델 가중치, GPU 셰이더, 역공학 바이너리, 영상 엔진/코덱, 무료/유료 프리셋. 단계별 성능·라이선스·운영 비용 검토 후 **별도 PR과 실제 기기/QA 승인**으로만 이식.

## 다음 도입 의사결정 기준
- HyperFrames: 30초 샘플 오프라인 렌더 후 CPU 시간/폰트·코덱 법적 고지/품질을 수치 비교하고 정식 300초 교육영상 검토. 실현장 개인정보는 입력하지 않음.
- Diagram Design: 건설안전 **조치요청 → 회신 → 기한 확인 → 재점검 → 승인** 1페이지 SVG/PNG 샘플을 PSI 독자적 브랜드로 제작. 외부 폰트 로드 금지.
- Shaders: 360px 폭 저사양 Android과 WebGPU 미지원 브라우저 정적 폴백/배터리 및 FPS 비교. 영상·게임용 화려한 이펙트를 안전관리자 정보 카드에 강제하지 않음.
- Laya: ko/vi/cmn/km/mn/th/my/id/ru/uz/kk의 합성 예시에서 오분류, 확률 보정, 추론 지연, 체크포인트 크기를 먼저 측정. 자동 승인 금지.

## 참고
실제 도입 및 법률 검토는 버전별 SPDX·NOTICE·서브패키지 자산·제3자 권리를 따로 확인해야 한다. 이 문서는 규제당국 또는 저작권자 허가서가 아니다.

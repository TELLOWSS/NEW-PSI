# Veo 3 자동 실행 순서 (질문 없이 바로 진행)

작성일: 2026-05-24
목표: 10초 PSI 영상 1차 생성 -> 2차 보정 -> 3차 마감까지 빠르게 완료

## 0) 준비물
- 프롬프트 원본(권장): artifacts/video/GEMINI_VEO3_ONEFILE_PROMPT_ADAPTIVE_DURATION_2026-05-24.txt
- 대안(고정 10초): artifacts/video/GEMINI_VEO3_ONEFILE_PROMPT_10S_2026-05-24.txt
- 2차 짧은 재프롬프트: artifacts/video/VEO3_SECOND_PASS_SHORT_REPROMPTS_2026-05-24.md
- 3차 한 줄 보정: artifacts/video/VEO3_THIRD_PASS_FAILURE_FIX_ONELINERS_2026-05-24.md
- 목업 이미지: 현재 사용자 첨부 이미지(첫 번째 참조로 사용)

## 1) 1차 생성
1. Veo 3에 프롬프트 원본 전체 붙여넣기
2. 목업 이미지 첨부
3. 생성 실행

참고
- 계정/모드 제한으로 단일 클립 10초가 불가능한 경우, Adaptive 프롬프트가 자동으로 허용 최대 길이에 맞춰 장면 비율을 압축해 생성합니다.

## 2) 1차 결과 30초 점검
아래 4개 중 실패가 보이면 체크
- A. 자막이 작거나 안 읽힘
- B. 목업 느낌과 다름
- C. 모션이 과하거나 산만함
- D. 엔드카드가 약함

## 3) 2차 보정 (문제 1개만 선택)
- A면: VEO3_SECOND_PASS_SHORT_REPROMPTS 문서의 A안 사용
- B면: VEO3_SECOND_PASS_SHORT_REPROMPTS 문서의 B안 사용
- C 또는 D면: VEO3_SECOND_PASS_SHORT_REPROMPTS 문서의 C안 사용

중요 규칙
- 한 번에 하나만 고친다
- 프롬프트를 길게 섞지 않는다

## 4) 3차 마감 보정
2차 후 남은 가장 큰 문제 1개를 고른다.
해당 한 줄을 VEO3_THIRD_PASS_FAILURE_FIX_ONELINERS 문서에서 복사해 실행한다.

추천 우선순위
1. 가독성
2. 목업 일치
3. 모션 안정
4. 엔드카드 마감

## 5) 종료 기준 (여기 도달하면 완료)
- 길이 10.0초 또는 현재 세션 허용 최대 길이 정확
- 자막 4구간 모두 읽힘
- 밝은 프리미엄 목업 톤 유지
- 마지막 1.5초 로고/메시지 선명

## 6) 최종 파일 관리
- v1: 1차 생성본
- v2: 2차 보정본
- v3: 3차 마감본 (최종)

권장 파일명
- psi_intro_10s_veo3_v1.mp4
- psi_intro_10s_veo3_v2.mp4
- psi_intro_10s_veo3_final.mp4

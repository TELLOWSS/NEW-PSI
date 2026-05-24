# Veo 3 3차 보정용 실패 유형별 한 줄 프롬프트

작성일: 2026-05-24
용도: 2차 결과에서 남은 문제를 한 줄로 빠르게 교정
사용법: 해당 문제 문장 1개만 복사해 재생성

## 1) 텍스트/가독성 문제
- 텍스트가 작다: Increase Korean subtitle size by 20% and keep all captions inside safe margins.
- 텍스트가 배경에 묻힘: Raise text-background contrast and add subtle dark shadow behind Korean captions.
- 문구가 너무 많다: Limit on-screen text to one short message per scene.
- 자막이 겹친다: Prevent any overlap between captions and busy UI regions.
- 한국어 깨짐/오탈자: Preserve Korean text exactly as provided with no paraphrasing or character corruption.

## 2) 브랜드/목업 일치 문제
- 목업과 느낌이 다름: Match the attached PSI mockup board style more strictly in layout, spacing, and card structure.
- 색감이 틀어짐: Constrain palette to bright premium PSI tones with blue-indigo accents and neutral white surfaces.
- 랜덤 색상 과다: Remove non-brand accent colors and keep visual identity consistent.
- 화면이 산만함: Reduce UI element density by 25% and keep one focal block per frame.

## 3) 모션/편집 문제
- 모션이 과함: Reduce camera motion intensity by 40% and keep movement smooth and minimal.
- 전환이 튐: Use only clean short motion-blur transitions, no flashy effects.
- 흔들림/불안정: Lock the camera for stability and avoid handheld-like jitter.
- 속도가 너무 빠름: Slow pacing slightly and protect readability windows for each caption.

## 4) 장면 구조 문제
- 타임라인이 어긋남: Keep exact scene timing at 0-3.5s, 3.5-6.5s, 6.5-8.5s, 8.5-10.0s.
- 4번째 장면이 약함: Strengthen the final 1.5s end card with centered PSI logo and clean negative space.
- 중간 메시지가 불명확: Emphasize comparison insight in scene 2 and execution status in scene 3.

## 5) 품질/출력 문제
- 품질이 흐림: Increase sharpness and preserve crisp edges for text and UI cards.
- 노이즈가 많음: Reduce visual noise and avoid artificial grain.
- 프레임 감각이 낮음: Improve premium polish with cleaner composition and smoother temporal consistency.

## 6) 추천 적용 순서
1. 가독성 문제 먼저 해결
2. 목업/색감 일치 보정
3. 모션 강도 보정
4. 엔드카드 품질 마감

## 7) 초간단 조합 예시
- "텍스트 작다 + 모션 과함"이면 아래 두 줄을 순서대로 각각 실행
1) Increase Korean subtitle size by 20% and keep all captions inside safe margins.
2) Reduce camera motion intensity by 40% and keep movement smooth and minimal.

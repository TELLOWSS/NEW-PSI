# 실제 화면 기반 컷-페이지 매핑표

작성일: 2026-05-24
목적: 30초/15초 소개영상을 실제 프로그램 페이지로 바로 캡처 가능하도록 고정
톤: 미래지향 프리미엄

## 1) 페이지 기준점 (검증된 렌더 경로)
- 앱 페이지 렌더 분기: App에서 currentPage 조건 렌더
- 핵심 페이지: dashboard, predictive-analysis, performance-analysis, reports, worker-management, ocr-analysis, field-context-input, intervention-coaching, judgment-tagging-input
- 모바일 12스크린 기준 출처: Introduction 페이지의 mobileFlowCards/checklist

## 2) 30초 컷-페이지 매핑 (고정본)
1. 00:00.0-00:03.0
- 페이지: introduction
- 캡처 포인트: 브랜드/운영 개요 카드와 모바일 플로우 블록 일부를 빠르게 크롭
- 메시지: 문제 제기(정보 과잉 대비 결정 지연)
- 대체 페이지: dashboard(데이터 카드 다중 노출)

2. 00:03.0-00:08.0
- 페이지: dashboard
- 캡처 포인트: KPI 카드 + 주요 차트가 함께 보이는 히어로 프레임
- 메시지: 통합된 단일 운영 뷰
- 트랜지션: 느린 줌아웃(103% -> 100%)

3. 00:08.0-00:10.5
- 페이지: dashboard
- 캡처 포인트: 실시간 상태/요약 카드(승인 백로그, 즉시 보호 대상 등)
- 메시지: 실시간 모니터링

4. 00:10.5-00:13.0
- 페이지: performance-analysis
- 캡처 포인트: 월별 추세/레이더/안전등급 추세 중 1개 + 보조 1개
- 메시지: 팀 비교 인사이트

5. 00:13.0-00:15.0
- 페이지: predictive-analysis
- 캡처 포인트: 실행 계획 상태(미착수/진행중/완료) 또는 우선순위 카드
- 메시지: 즉시 실행 포인트

6. 00:15.0-00:19.0
- 페이지: worker-management + reports
- 캡처 포인트: 관리 리스트(좌)와 리포트 미리보기/생성 영역(우) 분할 화면
- 메시지: 복잡한 보고에서 명확한 실행으로

7. 00:19.0-00:23.0
- 페이지: dashboard
- 캡처 포인트: KPI 카드 3개를 연속 매치컷
- 메시지: Faster Decisions. Higher Impact.

8. 00:23.0-00:27.0
- 페이지: field-context-input -> intervention-coaching -> judgment-tagging-input
- 캡처 포인트:
  - field-context-input: 저장 상태 카드
  - intervention-coaching: 우선순위 개입 카드
  - judgment-tagging-input: 입력 완료율/품질 상태
- 메시지: 어디서나 같은 판단 속도(모바일 운영 흐름)

9. 00:27.0-00:30.0
- 페이지: introduction 또는 커스텀 엔드카드
- 캡처 포인트: 브랜드 문구/로고/버전 라벨이 들어간 정적 엔드
- 메시지: CTA 단일 노출

## 3) 15초 9:16 컷-페이지 매핑 (리컷)
1. 00:00.0-00:02.5
- 페이지: dashboard
- 포인트: KPI 밀집 영역 세로 크롭

2. 00:02.5-00:05.5
- 페이지: predictive-analysis
- 포인트: 우선순위/실행 상태 배지

3. 00:05.5-00:09.0
- 페이지: performance-analysis
- 포인트: 비교 차트 한 축만 크게

4. 00:09.0-00:12.0
- 페이지: intervention-coaching 또는 field-context-input
- 포인트: 즉시 행동 가능한 버튼/상태 변화

5. 00:12.0-00:15.0
- 페이지: introduction 또는 엔드카드
- 포인트: 로고 + CTA

## 4) 실제 이동 동선 (촬영자용)
1. dashboard 진입 후 히어로 프레임 5초 녹화
2. dashboard 내 요약 카드 클로즈업 3초
3. performance-analysis 이동 후 차트 3초
4. predictive-analysis 이동 후 실행계획 카드 3초
5. worker-management 2초 + reports 2초 분할용 녹화
6. field-context-input 2초, intervention-coaching 2초, judgment-tagging-input 2초
7. introduction 또는 엔드카드 3초

## 5) 페이지-메시지 연결 규칙
- dashboard: 통합/가시성/속도
- performance-analysis: 비교/추세/해석
- predictive-analysis: 우선순위/실행
- reports: 신뢰/증빙/배포
- field-context-input: 현장 입력의 즉시성
- intervention-coaching: 실행 책임과 상태
- judgment-tagging-input: 데이터 품질/검증

## 6) 촬영 품질 규칙
- 화면 확대는 최대 105% 이내
- 텍스트가 잘리는 세로 크롭 금지
- 1컷당 메시지 1개만 유지
- 마우스 커서는 필요 장면에서만 노출
- 상태 변화가 보이는 순간(저장 성공, 상태 전환)을 우선 사용

## 7) 예비 대체 컷
- performance-analysis 데이터가 빈 경우: survey-intelligence 차트 컷 대체
- predictive-analysis 데이터가 빈 경우: dashboard의 위험/백로그 카드로 대체
- 모바일 페이지가 빈 경우: introduction의 모바일 12스크린 카드 섹션 사용

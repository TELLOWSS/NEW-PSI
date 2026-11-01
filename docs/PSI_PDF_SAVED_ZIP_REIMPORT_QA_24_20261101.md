# NEW-PSI 24차 — 다운로드된 PDF 검토 ZIP 로컬 재검증 (2026-11-01)

## 문제
23차까지 브라우저 자동시험은 PDF 검토 ZIP을 다운로드할 때 압축 내 파일과 PDF 재열람을 확인했다. 그러나 일반 사용자가 나중에 저장된 ZIP을 직접 골라 원본 문서와 대조할 UI는 없었다. 21~23차 PDF 출력 절차와 독립적으로 사용할 수 있는 현장형 검증 기능을 추가한다.

## 구현
- PDF 개인정보 가림 화면 하단에 **저장된 PDF 검토 ZIP 다시 확인** 파일 선택 영역 상시 노출. 원본 PDF를 먼저 열지 않아도 검사할 수 있다.
- ZIP 파일은 외부로 전송하거나 자동 보관하지 않는다. 브라우저 내부에서만 JSZip·SHA-256·PDF.js를 실행한다.
- ZIP 엔트리는 정확히 'PSI_MASKED_REVIEW.pdf', 'REVIEW_MANIFEST.json', 'SHA256SUMS.txt' 세 개만 허용한다. 원본 PDF, 별도 증빙, 예상하지 못한 폴더/파일은 차단한다.
- ZIP 파일 60MB 제한, PDF 40MB, JSON 256KB, 해시 목록 2KB 등의 사전 크기 제한으로 위험한 재검토 자료를 거부한다. JSZip에서 읽을 수 없는 엔트리 크기도 거부한다.
- 실제 ZIP 추출 PDF·JSON의 SHA-256을 새로 계산하여 JSON 해시·SHA256SUMS와 일치하는지 확인한다.
- JSON의 **내부 검토/미승인** 상태, 전 페이지 사용자 비교 확인, 개인정보 원본을 출력물에 포함하지 않았다는 선언 등을 확인한다. 잘못된 '승인 완료' 선언은 차단한다.
- PDF.js로 추출 가능한 텍스트·주석·첨부파일·양식 필드 여부와 페이지 수를 다시 검사한다.
- 현재 원본 PDF를 불러와 있는 경우 원본 SHA-256의 일치를 확인하며, 원본을 불러오지 않았을 경우 **원본 연계 미확인**이라고 분명히 표시한다.
- 결과를 합격·불합격으로 나눠 사용자에게 설명한다. ZIP 무결성 검증의 합격은 개인정보 비식별화 완료·원본 진위·관리자 독립 승인·외부 제출 허가가 아니다.

## 차단한 우회 경로
이전 코드에는 더 이상 사용되지 않는 'downloadPsiRasterPdfReview' 직통 다운로드 함수가 남아 있어, 최종 원본·결과물 비교와 단일 ZIP 검증 없이 PDF·JSON을 따로 저장할 수 있었다. GitHub 코드 검색에서 정의 파일 외 사용자가 확인되지 않아 이 미사용 함수를 제거하고 기존 'downloadPreparedPsiRasterPdfReview' 게이트만 유지했다.

## 검증
- 신규 Vitest 합성자료: 정상 검토 ZIP, 현재 원본과 SHA 일치/불일치, PDF 바이트 변조, JSON의 허위 승인, 해시 목록 변조, 추가 파일, 60MB 초과, PDF.js 원문 검출.
- Playwright 실 PDF·JSZip 다운로드·재열람 브라우저 테스트 확장: 실제 다운로드 Blob을 File로 다시 불러오기, 원본 SHA 결합, ZIP 내 PDF 변조 차단, 원본 사본이 추가된 ZIP 차단. PC Chromium 1280×800 / Android 크기 터치 Chromium 390×844.
- 실 Android 하드웨어, Samsung Internet 및 OS 다운로드 폴더·ZIP 앱 시험은 별도.

## 운영 및 승인 경계
- GitHub PR 검증·main 병합과 Vercel Production 배포는 별도 결과로 확인해야 한다.
- 2026-11-01 확인 시 'main' 시작 SHA '8903452f'(23차), Vercel Production READY '090f5ddb'(17차)로 불일치. Vercel Hobby 빌드 빈도 제한이 원인인 GitHub 커밋 상태 확인.
- 프리뷰 브랜치 'c36e2bd6'의 Vercel READY는 **Production과 다르며**, 환경 변수가 다른 Preview를 무단 Production 승격하지 않는다.
- 요금제 변경·빌드 제한 우회·외부 발송·승인 기록 생성은 하지 않는다.

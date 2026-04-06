export const PSI_APP_VERSION = 'v2.2.0';
export const PSI_APP_VERSION_SHORT = 'v2.2';
export const PSI_SYSTEM_NAME = `PSI (Proactive Safety Intelligence) ${PSI_APP_VERSION}`;

export const PSI_CURRENT_RELEASE = {
    version: PSI_APP_VERSION,
    shortVersion: PSI_APP_VERSION_SHORT,
    dateLabel: '2026년 04월 06일',
    periodLabel: '2026년 04월 (최신)',
    codename: 'Field Delivery & Report Intelligence',
    title: '현장 전달·리포트 인텔리전스 업데이트',
    summary: '양면 인쇄형 개인 리포트, 선명한 SVG 차트, 근로자별 MMS 발송/이력 관리, 화면-다운로드 일치형 경량 내보내기까지 현장 전달 흐름 전체를 정리한 최신 운영 릴리스입니다.',
    highlights: [
        '개인별 리포트 전면/후면을 양면 인쇄 기준으로 재구성하고 한국어 전면 문구를 별도 최적화',
        '6대 지표·안전 추이 차트를 SVG 기반으로 전환해 흐림과 캡처 불일치 최소화',
        '근로자 전화번호 연계 MMS 발송, 개별/일괄 발송, 발송 이력·실패 사유·재시도 대시보드 구축',
        '근로자 중복 정리, 연락처 연동, OCR 보조 UX 정비로 운영 입력 흐름 안정화',
        '내보내기 파이프라인을 화면과 동일하게 맞추고 불필요한 빈 페이지 제거',
        'JPEG 경량화·빠른 PDF 삽입 모드 적용으로 근로자별 다운로드 속도 개선'
    ],
    validations: [
        '리포트 화면과 다운로드 결과 간 시각 차이 축소',
        '보고서 PDF/이미지 생성 시 용량과 처리 시간 동시 최적화',
        '운영자 기준 발송 추적·재시도·이력 조회 흐름 확보'
    ],
} as const;

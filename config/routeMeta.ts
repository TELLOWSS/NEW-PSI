import type { Page } from '../types';

export type ProductGroup =
    | 'dashboard'
    | 'tbm'
    | 'risk-assessment'
    | 'archive'
    | 'analytics'
    | 'reports'
    | 'worker';

export type UiAudienceMode = 'practitioner' | 'worker' | 'developer';

export interface RouteMeta {
    id: Page;
    productGroup: ProductGroup;
    practitionerLabel: string;
    workerLabel: string;
    developerLabel: string;
    description: string;
    menuVisibleInPractitionerMode: boolean;
    menuVisibleInWorkerMode: boolean;
    menuVisibleInDeveloperMode: boolean;
    forbiddenTerms: string[];
    fallbackTitle: string;
    emptyStateMessage: string;
    errorMessage: string;
}

const PRACTITIONER_FORBIDDEN_TERMS = [
    'harness',
    'workflow',
    'gateway',
    'payload',
    'trace',
    'mock',
    'API action',
    'fetch',
    'Supabase',
    'debug',
    'stack',
    'route.config',
    'adapter',
    '하네스',
    '워크플로우',
    '게이트웨이',
    '페이로드',
    '디버그',
    '모크',
    '수파베이스',
];

const createMeta = (meta: Omit<RouteMeta, 'forbiddenTerms'>): RouteMeta => ({
    ...meta,
    forbiddenTerms: PRACTITIONER_FORBIDDEN_TERMS,
});

export const routeMetaMap: Record<Page, RouteMeta> = {
    'dashboard': createMeta({
        id: 'dashboard',
        productGroup: 'dashboard',
        practitionerLabel: '현장 안전 관제센터',
        workerLabel: '오늘 현장 상태',
        developerLabel: 'Dashboard (Ops)',
        description: '오늘 위험 신호와 우선 조치 항목을 빠르게 확인합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '현장 안전 관제센터',
        emptyStateMessage: '오늘 표시할 현장 데이터가 없습니다.',
        errorMessage: '데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.',
    }),
    'ocr-analysis': createMeta({
        id: 'ocr-analysis',
        productGroup: 'risk-assessment',
        practitionerLabel: '위험성평가 분석',
        workerLabel: '위험성평가 확인',
        developerLabel: 'OCR Analysis',
        description: '위험성평가 문서 분석 결과를 확인하고 관리합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '위험성평가 분석',
        emptyStateMessage: '분석할 문서가 없습니다.',
        errorMessage: '문서 분석에 실패했습니다. 다시 시도해 주세요.',
    }),
    'worker-management': createMeta({
        id: 'worker-management',
        productGroup: 'analytics',
        practitionerLabel: '근로자 안전 프로파일',
        workerLabel: '내 정보 확인',
        developerLabel: 'Worker Management',
        description: '근로자 참여 현황과 안전 프로파일을 확인합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '근로자 안전 프로파일',
        emptyStateMessage: '등록된 근로자 정보가 없습니다.',
        errorMessage: '근로자 정보를 불러오지 못했습니다.',
    }),
    'predictive-analysis': createMeta({
        id: 'predictive-analysis',
        productGroup: 'analytics',
        practitionerLabel: '위험 예측 분석',
        workerLabel: '위험 예측 보기',
        developerLabel: 'Predictive Analysis',
        description: '위험 신호를 예측해 선제 대응 항목을 확인합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '위험 예측 분석',
        emptyStateMessage: '예측할 데이터가 부족합니다.',
        errorMessage: '예측 분석을 불러오지 못했습니다.',
    }),
    'performance-analysis': createMeta({
        id: 'performance-analysis',
        productGroup: 'analytics',
        practitionerLabel: '안전성과 분석',
        workerLabel: '성과 확인',
        developerLabel: 'Performance Analysis',
        description: '조치 성과와 개선 흐름을 확인합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '안전성과 분석',
        emptyStateMessage: '표시할 성과 데이터가 없습니다.',
        errorMessage: '성과 데이터를 불러오지 못했습니다.',
    }),
    'safety-checks': createMeta({
        id: 'safety-checks',
        productGroup: 'risk-assessment',
        practitionerLabel: '위험 인지 점검',
        workerLabel: '위험 점검',
        developerLabel: 'Safety Checks',
        description: '작업 전 위험 인지 여부를 점검합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '위험 인지 점검',
        emptyStateMessage: '점검 기록이 없습니다.',
        errorMessage: '점검 정보를 불러오지 못했습니다.',
    }),
    'site-issue-management': createMeta({
        id: 'site-issue-management',
        productGroup: 'dashboard',
        practitionerLabel: '현장 위험 이슈 관리',
        workerLabel: '위험 알림 확인',
        developerLabel: 'Site Issue Management',
        description: '현장 위험 이슈와 긴급 알림을 관리합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '현장 위험 이슈 관리',
        emptyStateMessage: '현재 위험 이슈가 없습니다.',
        errorMessage: '위험 이슈 정보를 불러오지 못했습니다.',
    }),
    'monthly-guidance-report': createMeta({
        id: 'monthly-guidance-report',
        productGroup: 'reports',
        practitionerLabel: '월별 계도 리포트',
        workerLabel: '지난달 작성사항 계도자료',
        developerLabel: 'Monthly Guidance Report',
        description: '지난달 위험성평가 작성사항을 익명화·종합하여 교육 종료 전 공유합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '월별 계도 리포트',
        emptyStateMessage: '선택한 기준월의 분석자료가 없습니다.',
        errorMessage: '월별 계도자료를 불러오지 못했습니다.',
    }),
    'reports': createMeta({
        id: 'reports',
        productGroup: 'reports',
        practitionerLabel: '근로자 리포트 (관리자 분석)',
        workerLabel: '관리자 분석 리포트',
        developerLabel: 'Reports',
        description: '개인별 분석 결과를 관리자 관점에서 확인하고 월별 변화·개선이행을 추적합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '근로자 리포트 (관리자 분석)',
        emptyStateMessage: '생성된 리포트가 없습니다.',
        errorMessage: '리포트 처리 중 문제가 발생했습니다. 다시 시도해 주세요.',
    }),
    'feedback': createMeta({
        id: 'feedback',
        productGroup: 'archive',
        practitionerLabel: '운영 제안 및 알림',
        workerLabel: '안내 및 의견',
        developerLabel: 'Feedback',
        description: '운영 개선 제안과 알림을 확인합니다.',
        menuVisibleInPractitionerMode: false,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '운영 제안 및 알림',
        emptyStateMessage: '표시할 내용이 없습니다.',
        errorMessage: '정보를 불러오지 못했습니다.',
    }),
    'introduction': createMeta({
        id: 'introduction',
        productGroup: 'dashboard',
        practitionerLabel: '서비스 안내',
        workerLabel: '사용 안내',
        developerLabel: 'Introduction',
        description: '서비스 사용 흐름과 핵심 기능을 안내합니다.',
        menuVisibleInPractitionerMode: false,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '서비스 안내',
        emptyStateMessage: '표시할 안내가 없습니다.',
        errorMessage: '안내 정보를 불러오지 못했습니다.',
    }),
    'individual-report': createMeta({
        id: 'individual-report',
        productGroup: 'reports',
        practitionerLabel: '개인별 작성 경향 분석',
        workerLabel: '관리자용 개인 분석',
        developerLabel: 'Individual Report',
        description: '관리자가 개인별 작성 경향과 월별 개선 흐름을 확인합니다. 교육 현장에는 직접 공개하지 않습니다.',
        menuVisibleInPractitionerMode: false,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '개인별 작성 경향 분석',
        emptyStateMessage: '표시할 리포트가 없습니다.',
        errorMessage: '리포트를 불러오지 못했습니다.',
    }),
    'a4-education-material': createMeta({
        id: 'a4-education-material', productGroup: 'tbm', practitionerLabel: 'A4 교육자료 자동생성', workerLabel: '다음 달 위험교육', developerLabel: 'A4 Education Material',
        description: '다음 달 위험성평가 작성 전 공종별 위험과 실천행동을 확인하는 도움자료입니다.', menuVisibleInPractitionerMode: true, menuVisibleInWorkerMode: false, menuVisibleInDeveloperMode: true,
        fallbackTitle: 'A4 교육자료', emptyStateMessage: '교육자료를 만들 분석 기록이 없습니다.', errorMessage: 'A4 교육자료를 불러오지 못했습니다.',
    }),
    'ppt-pdf-one-page-summary': createMeta({
        id: 'ppt-pdf-one-page-summary', productGroup: 'tbm', practitionerLabel: 'PPT/PDF 한장요약', workerLabel: '교육 한장요약', developerLabel: 'PPT/PDF One Page Summary',
        description: '기존 교육자료를 현장 공유용 한 장 브리핑으로 정리합니다.', menuVisibleInPractitionerMode: true, menuVisibleInWorkerMode: false, menuVisibleInDeveloperMode: true,
        fallbackTitle: 'PPT/PDF 한장요약', emptyStateMessage: '요약할 교육자료를 선택해 주세요.', errorMessage: '한장요약 화면을 불러오지 못했습니다.',
    }),
    'admin-training': createMeta({
        id: 'admin-training',
        productGroup: 'tbm',
        practitionerLabel: '다국어 교육 / QR',
        workerLabel: '교육자료 확인',
        developerLabel: 'Admin Training',
        description: 'TBM 교육자료를 등록하고 관리합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: 'TBM 교육자료 관리',
        emptyStateMessage: '등록된 교육자료가 없습니다.',
        errorMessage: '교육자료를 불러오지 못했습니다.',
    }),
    'worker-training': createMeta({
        id: 'worker-training',
        productGroup: 'worker',
        practitionerLabel: '근로자 교육 확인',
        workerLabel: '교육 확인 및 서명 제출',
        developerLabel: 'Worker Training',
        description: '근로자 교육 확인과 서명 제출을 진행합니다.',
        menuVisibleInPractitionerMode: false,
        menuVisibleInWorkerMode: true,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '근로자 교육 확인',
        emptyStateMessage: '진행할 교육이 없습니다.',
        errorMessage: '제출에 실패했습니다. 입력 내용을 확인해 주세요.',
    }),
    'safety-behavior-management': createMeta({
        id: 'safety-behavior-management',
        productGroup: 'risk-assessment',
        practitionerLabel: '안전조치 및 개선관리',
        workerLabel: '안전조치 확인',
        developerLabel: 'Safety Behavior Management',
        description: '불안전행동과 개선조치 현황을 관리합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '안전조치 및 개선관리',
        emptyStateMessage: '등록된 조치가 없습니다.',
        errorMessage: '조치 정보를 저장하지 못했습니다.',
    }),
    'safety-compliance-hub': createMeta({
        id: 'safety-compliance-hub',
        productGroup: 'tbm',
        practitionerLabel: '현장 상황 등록',
        workerLabel: '현장 상황 확인',
        developerLabel: 'Field Safety Compliance Hub',
        description: '현장 상황과 준수 항목을 등록하고 확인합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '현장 상황 등록',
        emptyStateMessage: '등록된 현장 상황이 없습니다.',
        errorMessage: '현장 상황을 불러오지 못했습니다.',
    }),
    'survey-intelligence': createMeta({
        id: 'survey-intelligence',
        productGroup: 'analytics',
        practitionerLabel: '근로자 의견 분석',
        workerLabel: '의견 확인',
        developerLabel: 'Survey Intelligence',
        description: '근로자 의견과 현장 반응 데이터를 분석합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '근로자 의견 분석',
        emptyStateMessage: '분석할 의견 데이터가 없습니다.',
        errorMessage: '의견 분석을 불러오지 못했습니다.',
    }),
    'settings': createMeta({
        id: 'settings',
        productGroup: 'archive',
        practitionerLabel: '시스템 설정',
        workerLabel: '설정',
        developerLabel: 'Settings',
        description: '운영 설정을 확인하고 관리합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: true,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '시스템 설정',
        emptyStateMessage: '설정 항목이 없습니다.',
        errorMessage: '설정 정보를 불러오지 못했습니다.',
    }),
    'field-context-input': createMeta({
        id: 'field-context-input',
        productGroup: 'tbm',
        practitionerLabel: '현장 상황 등록',
        workerLabel: '오늘 현장 상황 입력',
        developerLabel: 'Field Context Input',
        description: '작업 전 현장 상황을 입력합니다.',
        menuVisibleInPractitionerMode: false,
        menuVisibleInWorkerMode: true,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '현장 상황 등록',
        emptyStateMessage: '아직 등록된 현장 상황이 없습니다.',
        errorMessage: '현장 상황 저장에 실패했습니다.',
    }),
    'intervention-coaching': createMeta({
        id: 'intervention-coaching',
        productGroup: 'tbm',
        practitionerLabel: '안전 코칭 관리',
        workerLabel: '코칭 확인',
        developerLabel: 'Intervention Coaching',
        description: '안전 코칭 계획과 이행 상태를 관리합니다.',
        menuVisibleInPractitionerMode: true,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '안전 코칭 관리',
        emptyStateMessage: '진행 중인 코칭이 없습니다.',
        errorMessage: '코칭 정보를 불러오지 못했습니다.',
    }),
    'judgment-tagging-input': createMeta({
        id: 'judgment-tagging-input',
        productGroup: 'risk-assessment',
        practitionerLabel: '판단 기준 입력',
        workerLabel: '판단 입력',
        developerLabel: 'Judgment Tagging Input',
        description: '판단 기준 데이터를 입력하고 검토합니다.',
        menuVisibleInPractitionerMode: false,
        menuVisibleInWorkerMode: false,
        menuVisibleInDeveloperMode: true,
        fallbackTitle: '판단 기준 입력',
        emptyStateMessage: '입력된 판단 기준이 없습니다.',
        errorMessage: '판단 기준 저장에 실패했습니다.',
    }),
};

export const getRouteMeta = (page: Page): RouteMeta => routeMetaMap[page];

export const getRouteLabel = (page: Page, mode: UiAudienceMode): string => {
    const meta = getRouteMeta(page);
    if (mode === 'developer') return meta.developerLabel;
    if (mode === 'worker') return meta.workerLabel;
    return meta.practitionerLabel;
};

export const isRouteVisibleInMode = (page: Page, mode: UiAudienceMode): boolean => {
    const meta = getRouteMeta(page);
    if (mode === 'developer') return meta.menuVisibleInDeveloperMode;
    if (mode === 'worker') return meta.menuVisibleInWorkerMode;
    return meta.menuVisibleInPractitionerMode;
};

const PRODUCT_GROUP_LABEL_MAP: Record<ProductGroup, string> = {
    'dashboard': '현장 관제',
    'tbm': 'TBM 관리',
    'risk-assessment': '위험성평가',
    'archive': '문서 보관',
    'analytics': '안전 분석',
    'reports': '리포트',
    'worker': '근로자',
};

const PAGE_HEADER_HIDDEN_MAP: Partial<Record<Page, boolean>> = {
    'dashboard': true,
    'worker-training': true,
    'ocr-analysis': true,
    'reports': true,
};

export const getProductGroupLabel = (group: ProductGroup): string =>
    PRODUCT_GROUP_LABEL_MAP[group] || '현장 관제';

export const shouldShowPageHeader = (page: Page): boolean =>
    PAGE_HEADER_HIDDEN_MAP[page] !== true;

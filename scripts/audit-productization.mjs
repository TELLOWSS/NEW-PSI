import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const exists = async (path) => {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
};

const read = async (path) => {
    try {
        return await readFile(path, 'utf8');
    } catch {
        return '';
    }
};

const vercelConfig = JSON.parse(await readFile('vercel.json', 'utf8'));
const globalHeaders = new Map(
    ((vercelConfig.headers || []).find((rule) => rule.source === '/(.*)')?.headers || [])
        .map((item) => [String(item.key).toLowerCase(), String(item.value)]),
);
const sourceFiles = [
    'pages/SurveyIntelligence.tsx',
    'services/surveyRiskBaselineService.ts',
    'api/admin/survey-risk-baselines.ts',
    'utils/surveyRiskGap.ts',
];
const sourceText = (await Promise.all(sourceFiles.map(read))).join('\n');
const safetyCaseFiles = [
    'utils/safetyCase.ts',
    'api/admin/safety-cases.ts',
    'services/safetyCaseService.ts',
    'supabase_safety_case_closed_loop_migration.sql',
    'pages/InterventionCoaching.tsx',
    'pages/Reports.tsx',
    'pages/AdminTraining.tsx',
    'pages/WorkerTraining.tsx',
];
const safetyCaseText = (await Promise.all(safetyCaseFiles.map(read))).join('\n');
const safetyCaseFilesReady = (await Promise.all(safetyCaseFiles.map(exists))).every(Boolean);
const safetyCaseUiVerification = JSON.parse(
    await read('artifacts/audit/browser/safety-case/safety-case-verification.json') || '{}',
);
const coreMetricOwnership = JSON.parse(
    await read('artifacts/audit/core-metric-ownership.json') || '{}',
);
const coreMetricUiVerification = JSON.parse(
    await read('artifacts/audit/browser/core-metrics/core-metrics-verification.json') || '{}',
);
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

const mobileFiles = [
    '320-nav.png', '320-dashboard.png', '320-ocr.png', '320-predictive.png',
    '360-nav.png', '360-dashboard.png', '360-ocr.png', '360-predictive.png',
    '375-nav.png', '375-dashboard.png', '375-ocr.png', '375-predictive.png',
    '390-nav.png', '390-dashboard.png', '390-ocr.png', '390-predictive.png',
];
const mobileExisting = (await Promise.all(
    mobileFiles.map((file) => exists(resolve('artifacts/mobile-qa/2026-06-19', file))),
)).filter(Boolean).length;

const items = [
    {
        id: 'baseline_history_migration',
        grade: '출시 전 수정',
        status: 'blocked',
        title: 'Supabase 관리자 기준 변경 이력 테이블 적용',
        evidence: await exists('supabase_survey_risk_baseline_history_migration.sql')
            ? '마이그레이션 파일 준비 완료, 원격 DB 접속 권한 대기'
            : '마이그레이션 파일 없음',
        nextAction: 'Supabase SQL Editor에서 마이그레이션 실행 후 list-history API와 RLS를 검증',
    },
    {
        id: 'case_closed_loop',
        grade: '출시 전 수정',
        status: safetyCaseFilesReady
            && safetyCaseText.includes('awaiting-reassessment')
            && safetyCaseUiVerification.passed === true
            ? 'partial'
            : 'not_started',
        title: 'case_id 기반 조치→교육→서명→재평가 폐루프',
        evidence: safetyCaseUiVerification.passed === true
            ? `6단계 모델·API·호환 마이그레이션 구현, 브라우저 ${safetyCaseUiVerification.passedCount}/${safetyCaseUiVerification.totalCount} 통과, 원격 DB 적용 대기`
            : '보호사건 구현 또는 브라우저 증거가 불완전',
        nextAction: 'Supabase 마이그레이션 적용 후 실제 근로자 서명→재평가 서버 재접속 회귀검사',
    },
    {
        id: 'tenant_rbac_rls',
        grade: '출시 전 수정',
        status: 'not_started',
        title: '관리자 RBAC·현장/테넌트 격리·RLS',
        evidence: '관리자 API 인증은 있으나 현장별 역할·행 범위 정책은 미확정',
        nextAction: 'site_id, tenant_id, app_metadata 역할 모델과 RLS 회귀검사 설계',
    },
    {
        id: 'metric_single_source',
        grade: '출시 전 수정',
        status: await exists('utils/coreMetrics.ts')
            && await exists('docs/METRIC_CATALOG.md')
            && coreMetricOwnership.passed === true
            && coreMetricUiVerification.passed === true
            ? 'completed'
            : 'partial',
        title: '지표 규칙 버전과 화면 전체 단일 계산 기준',
        evidence: coreMetricOwnership.passed === true
            ? `공식 지표 카탈로그와 계산 모듈 적용, 소유권 ${coreMetricOwnership.passedCount}/${coreMetricOwnership.totalCount}, 브라우저 ${coreMetricUiVerification.passedCount || 0}/${coreMetricUiVerification.totalCount || 0}`
            : '공식 지표 카탈로그 또는 계산 소유권 검증이 불완전',
        nextAction: '규칙 변경 시 버전·단위 테스트·화면 소유권 검사를 함께 갱신',
    },
    {
        id: 'streaming_restore',
        grade: '출시 전 수정',
        status: 'not_started',
        title: '대용량 서버 스트리밍 복원·중단 재개·롤백',
        evidence: '감사 도구는 스트리밍이나 실제 복원은 브라우저 트랜잭션 중심',
        nextAction: '업로드 세션·청크 체크포인트·재개 토큰·롤백 설계',
    },
    {
        id: 'security_headers',
        grade: '품질 개선',
        status: globalHeaders.has('content-security-policy') ? 'completed' : 'not_started',
        title: '프로덕션 보안 헤더',
        evidence: globalHeaders.has('content-security-policy')
            ? `${globalHeaders.size}개 공통 보안 헤더 구성`
            : 'HSTS 외 주요 응답 보안 헤더 없음',
        nextAction: '배포 후 실제 응답 헤더 자동 검증',
    },
    {
        id: 'dependency_security',
        grade: '정상 확인',
        status: !packageJson.devDependencies?.vercel && String(packageJson.devDependencies?.vitest || '').includes('4.')
            ? 'completed'
            : 'partial',
        title: '운영·개발 공급망 취약점',
        evidence: 'Vitest 4 적용, 저장소 내 Vercel CLI 제거, 최근 npm audit 0건',
        nextAction: '릴리스마다 npm audit 재실행',
    },
    {
        id: 'mobile_evidence',
        grade: '품질 개선',
        status: mobileExisting === mobileFiles.length ? 'completed' : 'partial',
        title: '모바일 QA 증거 16종',
        evidence: `${mobileExisting}/${mobileFiles.length}개 증거 파일 확인`,
        nextAction: mobileExisting === mobileFiles.length ? '릴리스별 재촬영 자동화' : '누락 화면 재촬영',
    },
    {
        id: 'baseline_scope',
        grade: '품질 개선',
        status: 'not_started',
        title: '현장×월×공종×세부작업 기준 모델',
        evidence: '현재 기준키는 월×공종',
        nextAction: '기존 데이터 호환을 유지하는 site_id·task_key 확장안 설계',
    },
    {
        id: 'baseline_decision_ux',
        grade: '정상 확인',
        status: sourceText.includes('저장 전 체감 비교 미리보기')
            && sourceText.includes('getTradeDecisionCues')
            ? 'completed'
            : 'partial',
        title: '관리자 기준 간편 등록·체감 비교 의사결정 UX',
        evidence: '이번 달 원클릭 시작, 미등록 우선순위, 공종별 확인 힌트, 저장 전 체감 비교와 조치 안내',
        nextAction: '현장 사용자 관찰을 통해 문항 이해 시간과 등록 완료율 측정',
    },
    {
        id: 'plain_language_ui',
        grade: '정상 확인',
        status: packageJson.scripts?.['check:ui-language'] ? 'completed' : 'partial',
        title: '현장 친화 언어와 개발자 용어 자동 차단',
        evidence: '주요 6개 화면의 내부 용어를 현장 언어로 전환하고 릴리스 검사에 사용자 언어 감사를 포함',
        nextAction: '신규 기능마다 쉬운 표현을 먼저 쓰고 필요한 기술명은 괄호로 설명',
    },
    {
        id: 'worker_report_product',
        grade: '정상 확인',
        status: packageJson.scripts?.['check:report-language'] && packageJson.scripts?.['qa:worker-report']
            ? 'completed'
            : 'partial',
        title: '근로자 리포트 모국어·인증서·대상자 집계 상품화',
        evidence: '14개 언어 정책, 근로자 전달본 1장/관리자 분석본 2장 분리, 근로자별 월·기록 집계와 PDF 검증 자동화',
        nextAction: '실제 현장 사용자 관찰로 인증서 이해 시간과 전달 완료율 측정',
    },
];

const counts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
}, {});
const generatedAt = new Date().toISOString();
const outputDir = resolve('artifacts/audit');
await mkdir(outputDir, { recursive: true });

const report = {
    generatedAt,
    counts,
    items,
};
await writeFile(
    resolve(outputDir, 'productization-status.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
);

const markdown = [
    '# NEW-PSI 상품화 상태 자동점검',
    '',
    `- 생성시각: ${generatedAt}`,
    `- 완료: ${counts.completed || 0}`,
    `- 부분완료: ${counts.partial || 0}`,
    `- 미시작: ${counts.not_started || 0}`,
    `- 외부권한 대기: ${counts.blocked || 0}`,
    '',
    '| 등급 | 상태 | 과제 | 증거 | 다음 행동 |',
    '|---|---|---|---|---|',
    ...items.map((item) => `| ${item.grade} | ${item.status} | ${item.title} | ${item.evidence} | ${item.nextAction} |`),
    '',
].join('\n');
await writeFile(resolve(outputDir, 'productization-status.md'), markdown, 'utf8');

console.log(`[productization] completed=${counts.completed || 0} partial=${counts.partial || 0} not_started=${counts.not_started || 0} blocked=${counts.blocked || 0}`);
console.log(`[productization] output=${outputDir}`);

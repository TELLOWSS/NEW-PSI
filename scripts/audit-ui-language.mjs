import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourceFiles = [
    'App.tsx',
    'pages/Dashboard.tsx',
    'pages/FieldSafetyComplianceHub.tsx',
    'pages/OcrAnalysis.tsx',
    'pages/PerformanceAnalysis.tsx',
    'pages/PredictiveAnalysis.tsx',
    'pages/Reports.tsx',
    'pages/SafetyBehaviorManagement.tsx',
    'pages/SafetyChecks.tsx',
    'pages/Settings.tsx',
    'pages/SurveyIntelligence.tsx',
    'pages/WorkerManagement.tsx',
    'components/IntegratedWorkBoard.tsx',
];

const rules = [
    { severity: 'high', term: '팀 공유 DB', suggestion: '팀 공동 저장소' },
    { severity: 'high', term: '현재 브라우저 저장', suggestion: '이 기기에 임시 저장' },
    { severity: 'high', term: '승인 백로그', suggestion: '관리자 검토 대기' },
    { severity: 'high', term: ">백로그<", suggestion: '관리자 검토 대기' },
    { severity: 'high', term: '백로그를', suggestion: '검토 대기 항목을' },
    { severity: 'high', term: 'BULK MODE', suggestion: '여러 명 발송' },
    { severity: 'high', term: 'INDIVIDUAL MODE', suggestion: '개별 발송' },
    { severity: 'high', term: 'SUCCESS RATE', suggestion: '성공률' },
    { severity: 'high', term: 'TOP PROVIDER', suggestion: '주요 발송 서비스' },
    { severity: 'high', term: 'MESSAGE HISTORY', suggestion: '문자 발송 이력' },
    { severity: 'high', term: 'API Cooling Down', suggestion: '분석 요청 대기' },
    { severity: 'high', term: 'Operations Configuration', suggestion: '현장 운영 기준' },
    { severity: 'high', term: 'run 연결', suggestion: '처리 이력 연결' },
    { severity: 'high', term: 'Preflight 검증', suggestion: '사전 점검' },
    { severity: 'high', term: '>payload:', suggestion: '기록 내용:' },
    { severity: 'high', term: '운영 집계 뷰', suggestion: '운영 현황판' },
    { severity: 'high', term: '스키마가 아직 준비되지', suggestion: '저장 구조가 아직 준비되지' },
    { severity: 'high', term: '서버 스키마 미준비', suggestion: '공동 저장 준비 안 됨' },
    { severity: 'high', term: 'Vercel 무료버전 API 절약 모드', suggestion: '서버 조회 절약 모드' },
    { severity: 'high', term: '세션 API 호출', suggestion: '이번 화면 서버 조회' },
    { severity: 'high', term: '캐시된 근로자', suggestion: '임시 보관된 근로자' },
    { severity: 'high', term: '캐시됨', suggestion: '임시 보관' },
    { severity: 'high', term: 'Manifest / JSON 메타', suggestion: '목록 파일과 세부 자료의 기준정보' },
    { severity: 'high', term: '증빙 해시', suggestion: '위변조 확인값' },
    { severity: 'high', term: '>AI 인사이트<', suggestion: '자동 분석 의견' },
    { severity: 'high', term: '>메타 정합성<', suggestion: '기준정보 일치 여부' },
    { severity: 'medium', term: 'API 키', suggestion: '분석 서비스 연결키(API 키)' },
    { severity: 'medium', term: 'JSON 불러오기', suggestion: '백업 파일 불러오기(JSON)' },
    { severity: 'medium', term: 'OCR 실행 키', suggestion: '문서 분석 연결 상태' },
    { severity: 'medium', term: '오늘 API 호출', suggestion: '오늘 분석 요청' },
    { severity: 'medium', term: '해시 불일치', suggestion: '위변조 확인값 불일치' },
    { severity: 'medium', term: '메타 불일치', suggestion: '기준정보 불일치' },
    { severity: 'medium', term: '파싱 불가 JSON', suggestion: '읽을 수 없는 세부자료' },
    { severity: 'medium', term: '누락 JSON', suggestion: '누락된 세부자료' },
    { severity: 'medium', term: '뷰포트', suggestion: '화면 크기' },
    { severity: 'medium', term: '포인터', suggestion: '조작 방식' },
    { severity: 'medium', term: '모션 선호', suggestion: '화면 움직임' },
    { severity: 'medium', term: '실적용 테마', suggestion: '현재 화면 색상' },
    { severity: 'medium', term: '컷오프', suggestion: '등급 기준점수' },
    { severity: 'medium', term: '배치 크기', suggestion: '한 번에 처리할 건수' },
    { severity: 'medium', term: '메타데이터', suggestion: '현장·시간·버전 정보' },
    { severity: 'medium', term: '프리셋', suggestion: '저장 조건' },
];

const isLikelyUserFacingLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
    if (/^(import|export type|type |interface |const [A-Z0-9_]+\s*=)/.test(trimmed)) return false;
    return /<|>|title:|description:|label:|helper:|subtitle=|title=|description=|alert\(|confirm\(|set[A-Z]\w+\(|throw new Error|['"`]/.test(line);
};

const findings = [];
for (const file of sourceFiles) {
    const text = await readFile(file, 'utf8');
    text.split(/\r?\n/).forEach((line, index) => {
        if (!isLikelyUserFacingLine(line)) return;
        for (const rule of rules) {
            if (!line.includes(rule.term)) continue;
            if (rule.term === 'API 키' && line.includes('연결키')) continue;
            findings.push({
                severity: rule.severity,
                file,
                line: index + 1,
                term: rule.term,
                suggestion: rule.suggestion,
                excerpt: line.trim().slice(0, 240),
            });
        }
    });
}

const counts = findings.reduce((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] || 0) + 1;
    return acc;
}, {});
const outputDir = resolve('artifacts/audit');
await mkdir(outputDir, { recursive: true });

const result = {
    generatedAt: new Date().toISOString(),
    scannedFiles: sourceFiles.length,
    counts: {
        high: counts.high || 0,
        medium: counts.medium || 0,
        total: findings.length,
    },
    findings,
};
await writeFile(
    resolve(outputDir, 'ui-language-audit.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
);

const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csvRows = [
    ['severity', 'file', 'line', 'term', 'suggestion', 'excerpt'],
    ...findings.map((finding) => [
        finding.severity,
        finding.file,
        finding.line,
        finding.term,
        finding.suggestion,
        finding.excerpt,
    ]),
];
await writeFile(
    resolve(outputDir, 'ui-language-findings.csv'),
    `${csvRows.map((row) => row.map(escapeCsv).join(',')).join('\n')}\n`,
    'utf8',
);

const markdown = [
    '# NEW-PSI 사용자 화면 언어 감사',
    '',
    `- 생성시각: ${result.generatedAt}`,
    `- 검사 파일: ${result.scannedFiles}`,
    `- 즉시 개선: ${result.counts.high}`,
    `- 쉬운 설명 병기 권장: ${result.counts.medium}`,
    '',
    '| 등급 | 파일 | 줄 | 현재 표현 | 권장 표현 |',
    '|---|---|---:|---|---|',
    ...findings.map((finding) => (
        `| ${finding.severity} | ${finding.file} | ${finding.line} | ${finding.term} | ${finding.suggestion} |`
    )),
    '',
].join('\n');
await writeFile(resolve(outputDir, 'ui-language-audit.md'), markdown, 'utf8');

console.log(`[ui-language] high=${result.counts.high} medium=${result.counts.medium} total=${result.counts.total}`);
console.log(`[ui-language] output=${outputDir}`);
if (process.argv.includes('--strict') && result.counts.high > 0) process.exitCode = 1;

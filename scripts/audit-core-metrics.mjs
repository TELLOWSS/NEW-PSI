import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDir = resolve('artifacts/audit');
await mkdir(outputDir, { recursive: true });

const consumers = [
    {
        file: 'pages/Dashboard.tsx',
        metrics: ['근로자 수', '평균 응답품질', '보호 우선'],
        required: ['calculateCoreMetricSnapshot'],
        forbidden: [/latestRecords\.reduce\(\(acc,\s*r\)\s*=>\s*acc\s*\+\s*r\.safetyScore/],
    },
    {
        file: 'components/IntegratedWorkBoard.tsx',
        metrics: ['평균 응답품질', '보호 우선', '개선 이행률', '월 추세'],
        required: ['calculateCoreMetricSnapshot', 'buildMonthlyCoreMetricSeries'],
        forbidden: [/record\.safetyLevel\s*===\s*'초급'\s*\|\|\s*record\.safetyScore\s*<\s*60/],
    },
    {
        file: 'components/charts/MonthlyTrendChart.tsx',
        metrics: ['월 평균 응답품질'],
        required: ['buildMonthlyCoreMetricSeries'],
        forbidden: [/totalScore\s*\/\s*monthlyData/],
    },
    {
        file: 'utils/reportBuilders.ts',
        metrics: ['월 평균 응답품질', '월 개선 이행률'],
        required: ['buildMonthlyCoreMetricSeries'],
        forbidden: [/average\(monthRecords\.map\(\(item\)\s*=>\s*item\.safetyScore/],
    },
    {
        file: 'pages/PerformanceAnalysis.tsx',
        metrics: ['월 평균 응답품질', '공종 평균', '변동성'],
        required: ['buildMonthlyCoreMetricSeries', 'calculateCoreMetricSnapshot', 'selectLatestCoreMetricRecords'],
        forbidden: [/const\s+monthlyAvgs\s*=/],
    },
];

const results = [];
for (const consumer of consumers) {
    const source = await readFile(consumer.file, 'utf8');
    const missingRequired = consumer.required.filter((token) => !source.includes(token));
    const forbiddenMatches = consumer.forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => String(pattern));
    results.push({
        ...consumer,
        passed: missingRequired.length === 0 && forbiddenMatches.length === 0,
        missingRequired,
        forbiddenMatches,
    });
}

const passed = results.every((result) => result.passed);
const report = {
    generatedAt: new Date().toISOString(),
    ruleVersion: 'psi-core-metrics-2026-06-22-v1',
    passed,
    passedCount: results.filter((result) => result.passed).length,
    totalCount: results.length,
    consumers: results.map(({ forbidden, ...result }) => result),
};

await writeFile(
    resolve(outputDir, 'core-metric-ownership.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
);

const markdown = [
    '# NEW-PSI 핵심 지표 계산 소유권 점검',
    '',
    `- 생성시각: ${report.generatedAt}`,
    `- 규칙 버전: ${report.ruleVersion}`,
    `- 결과: ${report.passedCount}/${report.totalCount}`,
    '',
    '| 화면·모듈 | 공식 지표 | 상태 |',
    '|---|---|---|',
    ...results.map((result) => (
        `| ${result.file} | ${result.metrics.join(' · ')} | ${result.passed ? '정상' : '불일치'} |`
    )),
    '',
    '공통 지표는 `utils/coreMetrics.ts`만 계산 소유권을 갖습니다.',
    '',
].join('\n');
await writeFile(resolve(outputDir, 'core-metric-ownership.md'), markdown, 'utf8');

console.log(`[core-metrics] ${report.passedCount}/${report.totalCount} consumers passed`);
console.log(`[core-metrics] output=${outputDir}`);
if (!passed) process.exitCode = 1;

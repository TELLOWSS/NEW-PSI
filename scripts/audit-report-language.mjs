import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const outputDir = resolve(root, 'artifacts/audit');
await mkdir(outputDir, { recursive: true });

const policySource = await readFile(resolve(root, 'utils/reportLanguagePolicy.ts'), 'utf8');
const transpiled = ts.transpileModule(policySource, {
    compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
    },
}).outputText;
const policyModule = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);
const templateSource = await readFile(resolve(root, 'components/ReportTemplate.tsx'), 'utf8');
const workerFacingTemplate = templateSource.split('{includeAdminAppendix &&')[0];

const expectedCodes = ['ko', 'vi', 'zh', 'th', 'my', 'uz', 'km', 'id', 'ms', 'mn', 'ru', 'kk', 'ne', 'en'];
const issues = [];
const languageRows = [];

for (const code of expectedCodes) {
    const policy = policyModule.REPORT_LANGUAGE_POLICIES[code];
    if (!policy) {
        issues.push({ severity: 'error', code, field: 'policy', message: '언어 정책 누락' });
        continue;
    }

    const labelEntries = Object.entries(policy.labels || {});
    const emptyLabels = labelEntries.filter(([, value]) => !String(value || '').trim()).map(([key]) => key);
    const nativeSurface = [
        ...labelEntries.map(([, value]) => value),
        ...(policy.metrics || []),
        policy.countryName,
        policy.genericGuidance,
        policy.genericVerdict,
        policy.genericCoaching,
    ].join('\n');
    const hasHangul = code !== 'ko' && /[가-힣]/u.test(nativeSurface);
    const fontReady = String(policy.fontFamily || '').includes('sans-serif');

    if (emptyLabels.length > 0) {
        issues.push({ severity: 'error', code, field: 'labels', message: `빈 문구: ${emptyLabels.join(', ')}` });
    }
    if (hasHangul) {
        issues.push({ severity: 'error', code, field: 'worker-facing-copy', message: '외국어 근로자 전달 문구에 한글 혼입' });
    }
    if (!fontReady) {
        issues.push({ severity: 'error', code, field: 'fontFamily', message: '언어별 글꼴 대체 순서 누락' });
    }

    languageRows.push({
        code,
        locale: policy.locale,
        countryName: policy.countryName,
        labelCount: labelEntries.length,
        metricCount: policy.metrics?.length || 0,
        fontFamily: policy.fontFamily,
        emptyLabelCount: emptyLabels.length,
        hangulContamination: hasHangul,
        passed: emptyLabels.length === 0 && !hasHangul && fontReady && policy.metrics?.length === 6,
    });
}

if (workerFacingTemplate.includes('[KO]')) {
    issues.push({ severity: 'error', code: 'template', field: 'worker-page', message: '근로자 전달면에 관리자용 [KO] 병기 존재' });
}
if (workerFacingTemplate.includes('font-serif')) {
    issues.push({ severity: 'error', code: 'template', field: 'font', message: '근로자 전달면에 명조 계열 글꼴 강제 존재' });
}

const summary = {
    generatedAt: new Date().toISOString(),
    expectedLanguageCount: expectedCodes.length,
    inspectedLanguageCount: languageRows.length,
    passedLanguageCount: languageRows.filter((row) => row.passed).length,
    issueCount: issues.length,
    passed: issues.length === 0 && languageRows.every((row) => row.passed),
    languageRows,
    issues,
};

const csvEscape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = [
    ['code', 'locale', 'countryName', 'labelCount', 'metricCount', 'fontFamily', 'emptyLabelCount', 'hangulContamination', 'passed'],
    ...languageRows.map((row) => [
        row.code,
        row.locale,
        row.countryName,
        row.labelCount,
        row.metricCount,
        row.fontFamily,
        row.emptyLabelCount,
        row.hangulContamination,
        row.passed,
    ]),
].map((row) => row.map(csvEscape).join(',')).join('\n');

const markdown = [
    '# 근로자 리포트 모국어·글꼴 감사',
    '',
    `- 검사 언어: ${summary.inspectedLanguageCount}/${summary.expectedLanguageCount}`,
    `- 통과 언어: ${summary.passedLanguageCount}`,
    `- 오류: ${summary.issueCount}`,
    `- 최종 결과: ${summary.passed ? '통과' : '확인 필요'}`,
    '',
    '| 언어 | 로케일 | 문구 | 지표 | 한글 혼입 | 글꼴 | 결과 |',
    '|---|---|---:|---:|---|---|---|',
    ...languageRows.map((row) => `| ${row.code} | ${row.locale} | ${row.labelCount} | ${row.metricCount} | ${row.hangulContamination ? '있음' : '없음'} | ${row.fontFamily} | ${row.passed ? '통과' : '확인 필요'} |`),
    '',
    ...(issues.length > 0 ? ['## 오류', '', ...issues.map((issue) => `- ${issue.code}/${issue.field}: ${issue.message}`)] : []),
    '',
].join('\n');

await writeFile(resolve(outputDir, 'report-language-audit.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDir, 'report-language-matrix.csv'), `\ufeff${csv}\n`, 'utf8');
await writeFile(resolve(outputDir, 'report-language-audit.md'), markdown, 'utf8');

console.log(`[report-language] ${summary.passedLanguageCount}/${summary.expectedLanguageCount} languages passed, issues=${summary.issueCount}`);
console.log(`[report-language] output=${outputDir}`);
if (process.argv.includes('--strict') && !summary.passed) process.exitCode = 1;

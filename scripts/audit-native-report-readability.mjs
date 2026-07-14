import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const outputDir = resolve(root, 'artifacts/audit');
await mkdir(outputDir, { recursive: true });

const maxDefaultBytes = 120 * 1024 * 1024;
const explicitInputs = process.argv
    .filter((arg) => arg.startsWith('--input='))
    .map((arg) => arg.slice('--input='.length));
const strict = process.argv.includes('--strict');

const policySource = await readFile(resolve(root, 'utils/reportLanguagePolicy.ts'), 'utf8');
const transpiled = ts.transpileModule(policySource, {
    compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
    },
}).outputText;
const policyModule = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);

const isKoreanNationality = (value) => /(대한민국|한국|korea|south korea)/iu.test(String(value || ''));
const arrayify = (value) => Array.isArray(value) ? value : [];
const asText = (value) => String(value || '').trim();

const discoverInputs = async () => {
    if (explicitInputs.length > 0) return explicitInputs;
    const reportsDir = resolve(root, 'reports');
    const names = await readdir(reportsDir);
    return names
        .filter((name) => /^PSI_Backup_.*\.json$/u.test(name))
        .map((name) => `reports/${name}`)
        .sort();
};

const readRecords = async (relativePath) => {
    const absolutePath = resolve(root, relativePath);
    const fileStat = await stat(absolutePath);
    if (fileStat.size > maxDefaultBytes && explicitInputs.length === 0) {
        return { skipped: true, reason: `파일이 커서 기본 감사에서 제외됨 (${Math.round(fileStat.size / 1024 / 1024)}MB)`, records: [] };
    }
    const raw = await readFile(absolutePath, 'utf8');
    const parsed = JSON.parse(raw);
    const records = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.records)
            ? parsed.records
            : Array.isArray(parsed.workerRecords)
                ? parsed.workerRecords
                : Array.isArray(parsed.data)
                    ? parsed.data
                    : [];
    return { skipped: false, records };
};

const getNativeTextChunks = (record) => {
    const chunks = [
        ['aiInsights_native', record.aiInsights_native],
        ['score_reason_native', record.score_reason_native],
        ['actionable_coaching_native', record.actionable_coaching_native],
        ['improvement_native', record.improvement_native],
        ...arrayify(record.strengths_native).map((value, index) => [`strengths_native[${index}]`, value]),
        ...arrayify(record.weakAreas_native).map((value, index) => [`weakAreas_native[${index}]`, value]),
        ...arrayify(record.suggestions_native).map((value, index) => [`suggestions_native[${index}]`, value]),
        ...arrayify(record.handwrittenAnswers)
            .map((answer, index) => [`handwrittenAnswers[${index}].nativeTranslation`, answer?.nativeTranslation]),
    ];
    return chunks
        .map(([field, value]) => ({ field, text: asText(value) }))
        .filter((item) => item.text.length > 0);
};

const inputs = await discoverInputs();
const skippedFiles = [];
const checkedFiles = [];
const issueRows = [];
const languageSummary = new Map();

for (const input of inputs) {
    const result = await readRecords(input);
    if (result.skipped) {
        skippedFiles.push({ input, reason: result.reason });
        continue;
    }
    checkedFiles.push({ input, records: result.records.length });

    for (const record of result.records) {
        const nationality = asText(record.nationality) || '미상';
        const language = asText(record.language);
        const policy = policyModule.getReportLanguagePolicy(nationality, language);
        const key = policy.code;
        const summary = languageSummary.get(key) || {
            code: key,
            languageNameKo: policy.languageNameKo,
            recordCount: 0,
            chunkCount: 0,
            errorCount: 0,
            warningCount: 0,
            missingNativeRecordCount: 0,
        };
        summary.recordCount += 1;
        languageSummary.set(key, summary);

        if (isKoreanNationality(nationality)) continue;

        const chunks = getNativeTextChunks(record);
        if (chunks.length === 0) {
            summary.missingNativeRecordCount += 1;
            summary.errorCount += 1;
            issueRows.push({
                file: input,
                id: record.id || '',
                name: record.name || '',
                nationality,
                language,
                policyCode: policy.code,
                field: 'record',
                severity: 'error',
                code: 'missing-native-report',
                message: '외국인 근로자 리포트에 모국어 문장이 없습니다.',
                sample: '',
            });
            continue;
        }

        for (const chunk of chunks) {
            summary.chunkCount += 1;
            const issues = policyModule.getNativeReportReadabilityIssues(chunk.text, policy);
            for (const issue of issues) {
                if (issue.severity === 'error') summary.errorCount += 1;
                if (issue.severity === 'warning') summary.warningCount += 1;
                issueRows.push({
                    file: input,
                    id: record.id || '',
                    name: record.name || '',
                    nationality,
                    language,
                    policyCode: policy.code,
                    field: chunk.field,
                    severity: issue.severity,
                    code: issue.code,
                    message: issue.message,
                    sample: chunk.text.slice(0, 180),
                });
            }
        }
    }
}

const languageRows = Array.from(languageSummary.values())
    .sort((left, right) => left.code.localeCompare(right.code));
const summary = {
    generatedAt: new Date().toISOString(),
    checkedFiles,
    skippedFiles,
    languageRows,
    issueCount: issueRows.length,
    errorCount: issueRows.filter((issue) => issue.severity === 'error').length,
    warningCount: issueRows.filter((issue) => issue.severity === 'warning').length,
    passed: issueRows.every((issue) => issue.severity !== 'error'),
};

const csvEscape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const issuesCsv = [
    ['file', 'id', 'name', 'nationality', 'language', 'policyCode', 'field', 'severity', 'code', 'message', 'sample'],
    ...issueRows.map((row) => [
        row.file,
        row.id,
        row.name,
        row.nationality,
        row.language,
        row.policyCode,
        row.field,
        row.severity,
        row.code,
        row.message,
        row.sample,
    ]),
].map((row) => row.map(csvEscape).join(',')).join('\n');

const markdown = [
    '# 모국어 리포트 읽기 품질 감사',
    '',
    `- 검사 파일: ${checkedFiles.length}`,
    `- 제외 파일: ${skippedFiles.length}`,
    `- 오류: ${summary.errorCount}`,
    `- 경고: ${summary.warningCount}`,
    `- 결과: ${summary.passed ? '배포 가능' : '보강 필요'}`,
    '',
    '| 언어 | 레코드 | 문장 조각 | 오류 | 경고 | 모국어 누락 레코드 |',
    '|---|---:|---:|---:|---:|---:|',
    ...languageRows.map((row) => `| ${row.languageNameKo} (${row.code}) | ${row.recordCount} | ${row.chunkCount} | ${row.errorCount} | ${row.warningCount} | ${row.missingNativeRecordCount} |`),
    '',
    skippedFiles.length > 0 ? '## 제외 파일' : '',
    ...skippedFiles.map((row) => `- ${row.input}: ${row.reason}`),
    '',
    issueRows.length > 0 ? '## 주요 이슈' : '',
    ...issueRows.slice(0, 80).map((issue) => `- ${issue.severity.toUpperCase()} · ${issue.policyCode} · ${issue.field} · ${issue.code}: ${issue.message} — ${issue.sample}`),
    '',
].filter(Boolean).join('\n');

await writeFile(resolve(outputDir, 'native-report-readability-audit.json'), `${JSON.stringify({ ...summary, issues: issueRows }, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDir, 'native-report-readability-issues.csv'), `\ufeff${issuesCsv}\n`, 'utf8');
await writeFile(resolve(outputDir, 'native-report-readability-audit.md'), markdown, 'utf8');

console.log(`[native-report-readability] files=${checkedFiles.length}, skipped=${skippedFiles.length}, errors=${summary.errorCount}, warnings=${summary.warningCount}`);
console.log(`[native-report-readability] output=${outputDir}`);
if (strict && !summary.passed) process.exitCode = 1;

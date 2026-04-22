const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const mockDataPath = path.join(root, 'mockData.ts');

const REQUIRED_NATIONALITIES = [
  '베트남',
  '중국',
  '태국',
  '캄보디아',
  '인도네시아',
  '몽골',
  '러시아',
  '카자흐스탄',
  '미얀마',
];

const CONFIG = {
  maxScoreGapForSimilarContext: 10,
  minTextSimilarityForGate: 0.72,
};

function parseCliArgs(argv) {
  const options = {
    strict: false,
    maxGap: CONFIG.maxScoreGapForSimilarContext,
    minSimilarity: CONFIG.minTextSimilarityForGate,
    reportJsonPath: '',
    reportMdPath: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--max-gap') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value >= 0) {
        options.maxGap = Math.round(value);
        i += 1;
      }
      continue;
    }
    if (arg === '--min-similarity') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value >= 0 && value <= 1) {
        options.minSimilarity = value;
        i += 1;
      }
      continue;
    }
    if (arg === '--report-json') {
      const value = String(argv[i + 1] || '').trim();
      if (value) {
        options.reportJsonPath = value;
        i += 1;
      }
      continue;
    }
    if (arg === '--report-md') {
      const value = String(argv[i + 1] || '').trim();
      if (value) {
        options.reportMdPath = value;
        i += 1;
      }
    }
  }

  return options;
}

const CLI = parseCliArgs(process.argv.slice(2));

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`❌ 파일을 읽을 수 없습니다: ${filePath}`);
    console.error(String(error.message || error));
    process.exit(1);
  }
}

function ensureParentDir(filePath) {
  const dir = path.dirname(path.resolve(root, filePath));
  fs.mkdirSync(dir, { recursive: true });
}

function safeExec(command) {
  try {
    return String(execSync(command, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })).trim();
  } catch {
    return '';
  }
}

function getExecutionMeta() {
  const gitCommit = safeExec('git rev-parse --short HEAD');
  const gitBranch = safeExec('git rev-parse --abbrev-ref HEAD');
  const gitDirty = Boolean(safeExec('git status --porcelain'));

  return {
    generatedAt: new Date().toISOString(),
    workspace: root,
    git: {
      commit: gitCommit || null,
      branch: gitBranch || null,
      dirty: gitDirty,
    },
  };
}

function writeReports(summary) {
  if (CLI.reportJsonPath) {
    const target = path.resolve(root, CLI.reportJsonPath);
    ensureParentDir(target);
    fs.writeFileSync(target, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(`📄 JSON 리포트 저장: ${CLI.reportJsonPath}`);
  }

  if (CLI.reportMdPath) {
    const target = path.resolve(root, CLI.reportMdPath);
    ensureParentDir(target);
    const lines = [
      '# PSI 점수 일관성 게이트 리포트',
      '',
      `- 생성 시각(UTC): ${summary.meta.generatedAt}`,
      `- 워크스페이스: ${summary.meta.workspace}`,
      `- Git 브랜치: ${summary.meta.git.branch || 'N/A'}`,
      `- Git 커밋: ${summary.meta.git.commit || 'N/A'}`,
      `- Git 변경사항 존재: ${summary.meta.git.dirty ? 'YES' : 'NO'}`,
      '',
      `- 상태: ${summary.status}`,
      `- 시드 레코드: ${summary.recordCount}`,
      `- 국적 커버리지: ${summary.coverage.ok ? 'PASS' : 'FAIL'}`,
      `- 누락 국적: ${summary.coverage.missing.join(', ') || '없음'}`,
      `- 유사도 기준: ${summary.thresholds.minSimilarity}`,
      `- 허용 편차: ±${summary.thresholds.maxGap}`,
      `- 비교쌍 수: ${summary.pairCount}`,
      `- 실패쌍 수: ${summary.failedPairCount}`,
      '',
    ];

    if (summary.failedPairCount > 0) {
      lines.push('## 편차 초과 비교쌍');
      lines.push('');
      lines.push('| Left | Right | 공종 | 유사도 | 점수차 |');
      lines.push('| --- | --- | --- | ---: | ---: |');
      for (const item of summary.failedPairs) {
        lines.push(`| ${item.leftId} | ${item.rightId} | ${item.jobField} | ${item.similarity.toFixed(3)} | ${item.gap} |`);
      }
      lines.push('');
    }

    fs.writeFileSync(target, `${lines.join('\n')}\n`, 'utf8');
    console.log(`📝 Markdown 리포트 저장: ${CLI.reportMdPath}`);
  }
}

function getQaSeedBlock(source) {
  const anchor = 'export const qaBilingualWorkerSeedRecords';
  const start = source.indexOf(anchor);
  if (start < 0) return '';

  const equalIndex = source.indexOf('=', start);
  if (equalIndex < 0) return '';

  const arrayStart = source.indexOf('[', equalIndex);
  if (arrayStart < 0) return '';

  let depth = 0;
  let end = -1;
  for (let i = arrayStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end < 0) return '';
  return source.slice(arrayStart, end + 1);
}

function getCommonKoreanContext(source) {
  const helperStart = source.indexOf('const createQaAnswers');
  if (helperStart < 0) return '';
  const exportStart = source.indexOf('export const qaBilingualWorkerSeedRecords', helperStart);
  const helperBlock = exportStart > helperStart ? source.slice(helperStart, exportStart) : source.slice(helperStart);
  const koreanLines = [...helperBlock.matchAll(/koreanTranslation:\s*'([^']+)'/g)]
    .map((match) => match[1] || '')
    .filter(Boolean);
  return koreanLines.join(' ').trim();
}

function getRecords(seedBlock, commonKoreanContext = '') {
  const records = [];

  const idMatches = [...seedBlock.matchAll(/id:\s*'(qa-[^']+)'/g)];

  for (let i = 0; i < idMatches.length; i += 1) {
    const current = idMatches[i];
    const next = idMatches[i + 1];
    const chunkStart = Math.max(0, current.index - 8);
    const chunkEnd = next ? next.index : seedBlock.length;
    const chunk = seedBlock.slice(chunkStart, chunkEnd);

    const id = current[1] || '';
    const nationality = (chunk.match(/nationality:\s*'([^']+)'/) || [])[1] || '';
    const jobField = (chunk.match(/jobField:\s*'([^']+)'/) || [])[1] || '';
    const safetyScoreRaw = (chunk.match(/safetyScore:\s*(\d+)/) || [])[1];
    const score = Number.isFinite(Number(safetyScoreRaw)) ? Number(safetyScoreRaw) : null;
    const answersBlock = (chunk.match(/handwrittenAnswers:\s*createQaAnswers\(\[([\s\S]*?)\]\)/) || [])[1] || '';
    const answerTexts = [...String(answersBlock).matchAll(/'([^']*)'/g)].map((item) => item[1] || '');
    const nativeContextText = answerTexts.join(' ').trim();
    const contextText = `${jobField} ${commonKoreanContext || nativeContextText}`.trim();

    if (!id || !nationality || !jobField || score === null) continue;
    records.push({ id, nationality, jobField, safetyScore: score, contextText });
  }

  return records;
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

function makeBigramSet(text) {
  const normalized = normalizeText(text).replace(/\s+/g, '');
  if (!normalized) return new Set();
  if (normalized.length < 2) return new Set([normalized]);

  const result = new Set();
  for (let i = 0; i < normalized.length - 1; i += 1) {
    result.add(normalized.slice(i, i + 2));
  }
  return result;
}

function calcSimilarity(a, b) {
  const aSet = makeBigramSet(a);
  const bSet = makeBigramSet(b);

  if (aSet.size === 0 && bSet.size === 0) return 1;
  if (aSet.size === 0 || bSet.size === 0) return 0;

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }

  return (2 * intersection) / (aSet.size + bSet.size);
}

function checkNationalCoverage(records) {
  const nations = new Set(records.map((r) => r.nationality));
  const missing = REQUIRED_NATIONALITIES.filter((n) => !nations.has(n));
  return { ok: missing.length === 0, missing };
}

function checkPairwiseConsistency(records) {
  const findings = [];

  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const left = records[i];
      const right = records[j];

      if (left.jobField !== right.jobField) continue;

      const similarity = calcSimilarity(left.contextText, right.contextText);
      if (similarity < CLI.minSimilarity) continue;

      const gap = Math.abs(left.safetyScore - right.safetyScore);
      findings.push({
        leftId: left.id,
        rightId: right.id,
        jobField: left.jobField,
        similarity,
        gap,
        pass: gap <= CLI.maxGap,
      });
    }
  }

  return findings;
}

function run() {
  const executionMeta = getExecutionMeta();
  const text = readText(mockDataPath);
  const block = getQaSeedBlock(text);
  const commonKoreanContext = getCommonKoreanContext(text);

  if (!block) {
    const message = '⚠️ qaBilingualWorkerSeedRecords 블록이 없어 점수 편차 게이트를 SKIP 합니다.';
    const summary = {
      meta: executionMeta,
      status: 'SKIP_NO_SEED',
      recordCount: 0,
      thresholds: { minSimilarity: CLI.minSimilarity, maxGap: CLI.maxGap },
      coverage: { ok: false, missing: [...REQUIRED_NATIONALITIES] },
      pairCount: 0,
      failedPairCount: 0,
      failedPairs: [],
    };
    writeReports(summary);
    if (CLI.strict) {
      console.error(`❌ ${message} (--strict)`);
      process.exit(1);
    }
    console.log(message);
    process.exit(0);
  }

  const records = getRecords(block, commonKoreanContext);
  if (records.length === 0) {
    console.error('❌ QA 시드 레코드를 파싱하지 못했습니다.');
    process.exit(1);
  }

  const coverage = checkNationalCoverage(records);
  const pairwise = checkPairwiseConsistency(records);
  const failedPairs = pairwise.filter((item) => !item.pass);
  const passed = coverage.ok && failedPairs.length === 0;

  const summary = {
    meta: executionMeta,
    status: passed ? 'PASS' : 'FAIL',
    recordCount: records.length,
    thresholds: { minSimilarity: CLI.minSimilarity, maxGap: CLI.maxGap },
    coverage,
    pairCount: pairwise.length,
    failedPairCount: failedPairs.length,
    failedPairs,
  };

  writeReports(summary);

  console.log('=== PSI 점수 일관성 게이트 ===');
  console.log(`시드 레코드: ${records.length}건`);
  console.log(`국적 커버리지: ${coverage.ok ? 'PASS' : 'FAIL'}`);
  if (!coverage.ok) {
    console.log(`- 누락 국적: ${coverage.missing.join(', ')}`);
  }

  console.log(`유사 맥락 비교쌍: ${pairwise.length}건 (기준 유사도 >= ${CLI.minSimilarity})`);
  console.log(`허용 편차: ±${CLI.maxGap}점`);

  if (pairwise.length === 0) {
    console.log('⚠️ 유사 맥락 비교쌍이 없어 편차 게이트를 평가하지 못했습니다.');
  }

  if (failedPairs.length > 0) {
    console.log('❌ 편차 초과 비교쌍');
    failedPairs.forEach((f) => {
      console.log(`- ${f.leftId} ↔ ${f.rightId} | 공종:${f.jobField} | 유사도:${f.similarity.toFixed(3)} | 점수차:${f.gap}`);
    });
  } else {
    console.log('✅ 유사 맥락 점수 편차 게이트 통과');
  }

  process.exit(passed ? 0 : 1);
}

run();

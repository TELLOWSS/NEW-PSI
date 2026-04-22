const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const STATE_FILE = 'reports/auto-daily-bootstrap-state.json';

function getTodayKst() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function readState(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return {};
  }
}

function writeState(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function runNpm(args) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
  });
  return {
    ok: (result.status || 0) === 0,
    code: result.status || 0,
  };
}

function main() {
  const today = getTodayKst();
  const statePath = path.resolve(process.cwd(), STATE_FILE);
  const state = readState(statePath);

  if (state.lastRunDate === today) {
    console.log(`[auto-bootstrap] 오늘(${today})은 이미 실행됨. 자동 작업을 건너뜁니다.`);
    process.exit(0);
  }

  console.log(`[auto-bootstrap] ${today} 일일 자동 작업 시작`);

  const recordsPath = path.resolve(process.cwd(), 'reports/records-export.json');
  const hasRecords = fs.existsSync(recordsPath);

  const steps = [];

  if (hasRecords) {
    steps.push({ name: 'analyze:backfill-readiness', args: ['run', 'analyze:backfill-readiness'] });
    steps.push({ name: 'analyze:policy-impact:full', args: ['run', 'analyze:policy-impact:full'] });
  } else {
    console.log('[auto-bootstrap] reports/records-export.json 없음: 분석 단계는 건너뜁니다.');
  }

  steps.push({ name: 'check:score-consistency:strict8', args: ['run', 'check:score-consistency:strict8'] });
  steps.push({
    name: 'log:story:auto:delta',
    args: [
      'run',
      'log:story:auto:delta',
      '--',
      '--date',
      today,
      '--change',
      '일일 자동 부트스트랩 실행',
      '--next',
      '실데이터 기준 Delta 변화 모니터링',
    ],
  });

  const results = [];
  for (const step of steps) {
    console.log(`[auto-bootstrap] 실행: ${step.name}`);
    const result = runNpm(step.args);
    results.push({
      step: step.name,
      ok: result.ok,
      code: result.code,
      ranAt: new Date().toISOString(),
    });
  }

  const failed = results.filter((item) => !item.ok);

  writeState(statePath, {
    lastRunDate: today,
    updatedAt: new Date().toISOString(),
    hasRecords,
    failedCount: failed.length,
    results,
  });

  if (failed.length > 0) {
    console.log(`[auto-bootstrap] 일부 단계 실패(${failed.length})가 있었지만 개발 시작은 계속합니다.`);
  } else {
    console.log('[auto-bootstrap] 모든 자동 단계 완료');
  }

  process.exit(0);
}

main();

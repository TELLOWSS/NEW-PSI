const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = [
  'pages/Introduction.tsx',
  'pages/SafetyChecks.tsx',
  'pages/WorkerManagement.tsx',
];

const tonePairRegex = /border-[a-z]+-[0-9]{2,3}[^\n]*bg-[a-z]+-[0-9]{2,3}|bg-[a-z]+-[0-9]{2,3}[^\n]*border-[a-z]+-[0-9]{2,3}/gi;

const allowPatterns = [
  /bg-slate-900[^\n]*border[^\n]*border-slate-800/i,
];

const collectMatches = (text) => {
  const found = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.includes('BRAND_TONE.')) continue;
    for (const match of line.matchAll(tonePairRegex)) {
      const value = match[0];
      const allowed = allowPatterns.some((pattern) => pattern.test(value));
      if (!allowed) {
        found.push(value);
      }
    }
  }
  return found;
};

let total = 0;
const reports = [];

for (const relPath of targets) {
  const filePath = path.join(root, relPath);
  if (!fs.existsSync(filePath)) {
    reports.push({ relPath, count: -1, samples: ['FILE_NOT_FOUND'] });
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const matches = collectMatches(content);
  total += matches.length;

  const uniqueSamples = Array.from(new Set(matches)).slice(0, 5);
  reports.push({
    relPath,
    count: matches.length,
    samples: uniqueSamples,
  });
}

console.log('=== PAGE TONE COVERAGE REPORT ===');
for (const report of reports) {
  if (report.count < 0) {
    console.log(`- ${report.relPath}: FILE_NOT_FOUND`);
    continue;
  }

  console.log(`- ${report.relPath}: ${report.count} remaining hardcoded tone pair(s)`);
  for (const sample of report.samples) {
    console.log(`  · ${sample}`);
  }
}

console.log(`TOTAL_REMAINING=${total}`);

if (total > 0) {
  process.exitCode = 1;
}

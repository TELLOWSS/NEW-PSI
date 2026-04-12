const fs = require('fs');
const path = require('path');

const checks = [
  { key: 'reports', file: 'pages/Reports.tsx', required: true },
  { key: 'dashboard', file: 'pages/Dashboard.tsx', required: true },
  { key: 'recordDetail', file: 'components/modals/RecordDetailModal.tsx', required: true },
  { key: 'harnessRouter', file: 'lib/server/harness/router.ts', required: false },
  { key: 'harnessServerRoot', file: 'lib/server/harness', required: false },
];

function exists(relativePath) {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

function main() {
  const result = checks.map((item) => ({ ...item, exists: exists(item.file) }));

  const requiredMissing = result.filter((item) => item.required && !item.exists);
  const hasHarnessServer = result.find((item) => item.key === 'harnessRouter')?.exists || result.find((item) => item.key === 'harnessServerRoot')?.exists;

  console.log('[check:context] Repository context preflight');
  result.forEach((item) => {
    console.log(`- ${item.file}: ${item.exists ? 'FOUND' : 'MISSING'}`);
  });

  if (requiredMissing.length > 0) {
    console.log('[check:context] WARNING: core UI paths are missing. Use this repo only after path alignment.');
    process.exit(0);
  }

  if (!hasHarnessServer) {
    console.log('[check:context] NOTE: harness server paths are missing in this repo.');
    console.log('[check:context] ACTION: skip server harness tasks (router/persistence) and proceed with UI + docs scope only.');
    process.exit(0);
  }

  console.log('[check:context] OK: full harness scope is available (UI + server).');
  process.exit(0);
}

main();

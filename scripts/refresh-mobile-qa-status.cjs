const { spawnSync } = require('node:child_process');

const run = (command, args) =>
  spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
  });

const check = run('node', ['scripts/check-mobile-qa-evidence.cjs', '--write-report']);
const sync = run('node', ['scripts/sync-mobile-qa-status.cjs']);

const checkCode = typeof check.status === 'number' ? check.status : 1;
const syncCode = typeof sync.status === 'number' ? sync.status : 1;

if (checkCode !== 0) {
  process.exit(checkCode);
}

process.exit(syncCode);

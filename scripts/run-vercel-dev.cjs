const { spawn } = require('node:child_process');

const command = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
const child = spawn(command, ['dev', '--listen', '3001'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
});

child.on('error', (error) => {
    if (error?.code === 'ENOENT') {
        console.error(
            '[dev:api] Vercel CLI가 없습니다. 공식 안내에 따라 전역 CLI를 설치한 뒤 다시 실행하세요: npm install -g vercel',
        );
        process.exitCode = 1;
        return;
    }
    console.error(`[dev:api] Vercel 개발 서버를 시작하지 못했습니다: ${error?.message || error}`);
    process.exitCode = 1;
});

child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exitCode = code ?? 1;
});

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const HOST = '127.0.0.1';
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;
const OUTPUT_DIR = path.join(process.cwd(), 'artifacts', 'mobile-qa', '2026-05-04');
const VIEWPORTS = [320, 360, 375, 390];
const VIEWPORT_HEIGHT = 844;
const ADMIN_PASSWORD = process.env.PSI_ADMIN_PASSWORD || 'psi1234';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestUrl = (url) => new Promise((resolve, reject) => {
  const req = http.get(url, (res) => {
    res.resume();
    resolve(res.statusCode || 0);
  });

  req.on('error', reject);
  req.setTimeout(2000, () => {
    req.destroy(new Error('timeout'));
  });
});

const waitForServer = async (url, timeoutMs = 45000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const status = await requestUrl(url);
      if (status >= 200 && status < 500) return;
    } catch {
      // ignore retry errors
    }
    await sleep(400);
  }
  throw new Error(`preview server did not become ready within ${timeoutMs}ms: ${url}`);
};

const startPreviewServer = () => {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npmCmd, ['run', 'preview', '--', '--host', HOST, '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[preview] ${chunk}`);
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[preview] ${chunk}`);
  });

  return child;
};

const stopProcess = async (child) => {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(2500),
  ]);
  if (!child.killed) {
    child.kill('SIGKILL');
  }
};

const ensureAdminUnlocked = async (page) => {
  const passwordInput = page.locator('input[placeholder="비밀번호 입력"]');
  if (await passwordInput.count() === 0) return;

  if (!(await passwordInput.first().isVisible().catch(() => false))) return;

  await passwordInput.first().fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '관리자 모드 진입' }).first().click();
  await page.waitForTimeout(800);
};

const waitForMobileNav = async (page) => {
  await page.locator('nav[aria-label="모바일 하단 탐색"]').waitFor({ timeout: 15000 });
};

const gotoDashboard = async (page) => {
  const mobileNav = page.locator('nav[aria-label="모바일 하단 탐색"]');
  await mobileNav.getByRole('button', { name: '홈' }).first().click();
  await page.waitForTimeout(700);
};

const gotoPredictive = async (page) => {
  const mobileNav = page.locator('nav[aria-label="모바일 하단 탐색"]');
  await mobileNav.getByRole('button', { name: '분석' }).first().click();
  await page.waitForTimeout(900);
};

const gotoOcr = async (page) => {
  const ocrQuickLink = page.getByRole('button', { name: 'OCR 분석' }).first();
  await ocrQuickLink.click();
  await page.waitForTimeout(900);
};

const captureSet = async (page, width) => {
  await waitForMobileNav(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  await page.screenshot({
    path: path.join(OUTPUT_DIR, `${width}-nav.png`),
    fullPage: false,
  });

  await page.screenshot({
    path: path.join(OUTPUT_DIR, `${width}-dashboard.png`),
    fullPage: false,
  });

  await gotoPredictive(page);
  await page.screenshot({
    path: path.join(OUTPUT_DIR, `${width}-predictive.png`),
    fullPage: false,
  });

  await gotoOcr(page);
  await page.screenshot({
    path: path.join(OUTPUT_DIR, `${width}-ocr.png`),
    fullPage: false,
  });

  await gotoDashboard(page);
};

const main = async () => {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    throw new Error('playwright 패키지가 없습니다. 먼저 "npm i -D playwright" 후 "npx playwright install chromium"를 실행하세요.');
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const preview = startPreviewServer();
  let browser;

  try {
    await waitForServer(BASE_URL);
    browser = await chromium.launch({ headless: true });

    for (const width of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width, height: VIEWPORT_HEIGHT },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await ensureAdminUnlocked(page);
      await waitForMobileNav(page);
      await captureSet(page, width);
      await context.close();
      console.log(`[capture-mobile-qa-evidence] captured width=${width}`);
    }

    console.log(`[capture-mobile-qa-evidence] done: ${OUTPUT_DIR}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopProcess(preview);
  }
};

main().catch((error) => {
  console.error('[capture-mobile-qa-evidence] failed:', error?.message || error);
  process.exitCode = 1;
});

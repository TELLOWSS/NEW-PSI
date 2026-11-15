import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

/** Design-gate smoke test with synthetic/empty app state. No real worker data or external AI. */
const baseUrl = process.env.PSI_UI_URL || 'http://127.0.0.1:4182/';
const output = resolve('artifacts/audit/browser/safety-nexus');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 970 }, deviceScaleFactor: 1 });
const checks = [], failures = [];
const check = (name, passed, evidence) => checks.push({ name, passed: Boolean(passed), evidence });
page.on('pageerror', error => failures.push(error.message));
page.on('dialog', dialog => dialog.dismiss());
await page.addInitScript(() => {
  sessionStorage.setItem('isAdminAuthenticated', 'true');
});
await page.route('**/api/admin/auth', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ ok: true, authenticated: true }),
}));
try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  // Production builds intentionally do not expose the developer-only __setCurrentPage helper.
  // Enter via the actual end-user navigation so this test also checks sidebar composition.
  await page.getByRole('button', { name: '안전지능 네트워크 · 시제품' }).first().click();
  const root = page.locator('.safety-nexus');
  await root.waitFor({ state: 'visible', timeout: 20000 });
  check('전용 페이지 진입 및 렌더', await root.isVisible(), 'safety-nexus route');
  check('PSI 브랜딩 표시', await root.getByRole('heading', { name: /SAFETY NEXUS/ }).count() === 1, 'new brand');
  check('위험성평가 Q1–Q5 탐색', await root.locator('.nexus-node').count() === 5, '5 nodes');
  check('6대 안전인식 항목 노출', await root.locator('.nexus-metric').count() === 6, '6 metrics');
  check('기본 입자 캔버스', await root.locator('canvas.nexus-core-canvas').count() === 1, 'canvas');
  const renderer = await root.locator('canvas.nexus-core-canvas').getAttribute('data-renderer') || 'canvas-2d-fallback';
  check('GPU 렌더러 또는 2D 대체 렌더러', ['webgl','canvas-2d-fallback'].includes(renderer), {renderer});
  check('후속조치 이력 카드 6종 구분', await root.locator('.nexus-followup-card').count() === 6, 'unresolved, overdue, interim, planned, reopened, evidence verified');
  check('미확인 현장 범위 필터 비활성화', await root.getByRole('combobox', {name:'현장 인증 범위 미연동'}).isDisabled(), 'site isolation not implemented');
  check('월·공종 필터 제공', await root.getByRole('combobox', {name:'작성 월 선택'}).count() === 1
     && await root.getByRole('combobox', {name:'공종 선택'}).count() === 1, 'loaded-record-only selectors');
  check('현장 범위 인증 미완료 고지', await root.getByText(/현장별 인증 범위는 아직 미연동/).count() === 1, 'transparent trust boundary');

  await root.locator('.nexus-node.node-3').click();
  check('선택 노드의 상태 변경', await root.locator('.nexus-node.node-3').getAttribute('aria-pressed') === 'true', 'Q4 selected');
  check('조치 지연과 재점검 의미 노출', await root.locator('.nexus-detail-text').innerText().then(v => /즉시 조치|임시 보호조치|재점검/.test(v)), 'Q4 detail');

  await root.getByRole('button', { name: '간결한 보기' }).click();
  check('2D 대체 화면 노출', await root.locator('.nexus-stage.is-flat').count() === 1 && await root.locator('canvas').count() === 0, 'flat mode');
  await root.getByRole('button', { name: '입체 보기' }).click();
  check('원래 입체 화면으로 복귀', await root.locator('canvas.nexus-core-canvas').count() === 1, 'canvas restore');
  await root.getByRole('button', { name: '모션 일시정지' }).click();
  check('모션 중지 버튼 토글', await root.getByRole('button', { name: '모션 재생' }).count() === 1, 'paused');

  // Responsive screenshots and overflow measurement are a visual review artifact, not an art approval.
  for (const width of [390, 768, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: width <= 768 ? 900 : 980 });
    await root.locator('.nexus-header').waitFor({ state: 'visible' });
    const sizes = await root.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    check(width + 'px 페이지 내부 가로 넘침 없음', sizes.scroll <= sizes.client + 2, sizes);
    if (width === 390) {
      const hero = await root.locator('.nexus-visual').boundingBox();
      const sidebarNote = await root.locator('.nexus-aside').boundingBox();
      check('390px 첫 화면에 코어 우선 노출', Boolean(hero && sidebarNote && hero.y < sidebarNote.y && hero.y < 400),
        { heroTop: hero?.y, overviewTop: sidebarNote?.y });
      // Avoid approving a blown-out white sphere: compare RGB values of the *actual* stage screenshot.
      // Screenshot data is synthetic-only and never contains worker photos.
      const stagePng = await root.locator('.nexus-stage').screenshot();
      const saturation = await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + base64;
        await image.decode();
        const surface = document.createElement('canvas');
        surface.width = image.naturalWidth;
        surface.height = image.naturalHeight;
        const c = surface.getContext('2d', { willReadFrequently: true });
        if (!c) return 1;
        c.drawImage(image, 0, 0);
        const pixels = c.getImageData(0, 0, surface.width, surface.height).data;
        let clipped = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > 246 && pixels[i+1] > 243 && pixels[i+2] > 215) clipped++;
        }
        return clipped / (surface.width * surface.height);
      }, stagePng.toString('base64'));
      check('390px 코어 백색 포화 9% 미만', saturation < 0.09,
        { whitePixelRatio: saturation, threshold: 0.09 });
    }
    if ([390, 768, 1440, 1920].includes(width)) {
      await page.screenshot({ path: resolve(output, 'nexus-' + width + '.png'), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await root.getByRole('button', { name: /전체 화면 몰입 보기/ }).click();
  check('시네마틱 몰입 보기', await root.evaluate(el => el.classList.contains('is-immersive') && getComputedStyle(el).position === 'fixed'), 'fullscreen portal');
  await page.screenshot({ path: resolve(output, 'nexus-immersive-1440.png'), fullPage: false });
  await page.keyboard.press('Escape');
  check('Escape로 몰입 보기 종료', await root.evaluate(el => !el.classList.contains('is-immersive')), 'safe return to shell');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.nexus-footer input[type="checkbox"]').check();
  check('움직임 축소 옵션', await root.locator('.nexus-footer input[type="checkbox"]').isChecked(), 'reduced motion');

  await page.setViewportSize({ width: 1440, height: 900 });
  await root.getByRole('button', { name: /안전조치 현황 열기/ }).click();
  check('기존 업무 화면 이동', await page.locator('.safety-nexus').count() === 0, 'navigated Q4');
  check('런타임 스크립트 오류 없음', failures.length === 0, failures);

  const report = { kind: 'synthetic-browser-review', visualApproval: false,
    pass: checks.every(c => c.passed), passed: checks.filter(c => c.passed).length,
    total: checks.length, checks, failures };
  await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('[Safety Nexus VG-2] ' + report.passed + '/' + report.total + ' checks passed. Art approval NOT claimed.');
  if (!report.pass) process.exitCode = 1;
} finally {
  await browser.close();
}

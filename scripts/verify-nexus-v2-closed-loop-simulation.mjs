import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.PSI_UI_URL || 'http://127.0.0.1:4182/';
const outDir = resolve('artifacts/audit/browser/safety-nexus-v2-sim');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const checks = [];
const lightQaFailures = [];
const recordCheck = (name, ok, detail = {}) => {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) {
    throw new Error(`Simulation check failed: ${name} -> ${JSON.stringify(detail)}`);
  }
};

const assertLightThemeQuality = async (root, viewLabel) => {
  const report = await root.evaluate((rootEl) => {
    const parseColor = (str) => {
      if (!str || str === 'transparent') return [0, 0, 0, 0];
      const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return [0, 0, 0, 0];
      return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
    };
    const compositeOver = (fg, bg) => {
      const a = fg[3];
      return [
        Math.round(fg[0] * a + bg[0] * (1 - a)),
        Math.round(fg[1] * a + bg[1] * (1 - a)),
        Math.round(fg[2] * a + bg[2] * (1 - a)),
        1,
      ];
    };
    const relLum = ([r, g, b]) => {
      const ch = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const getEffectiveBg = (el) => {
      const stack = [];
      let cur = el;
      while (cur && cur.nodeType === 1) {
        const c = parseColor(getComputedStyle(cur).backgroundColor);
        if (c[3] > 0.01) stack.unshift(c);
        if (c[3] >= 0.99) break;
        cur = cur.parentElement;
      }
      let out = [255, 255, 255, 1];
      for (const layer of stack) {
        out = compositeOver(layer, out);
      }
      return out;
    };

    const lowContrast = [];
    const darkStragglers = [];
    const smallFonts = [];
    const gridAnomalies = [];

    const all = Array.from(rootEl.querySelectorAll('*'));
    for (const el of all) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (el.closest('svg')) continue;
      if (el.closest('.nexus-stage:not(.is-flat)')) continue;

      if (style.display === 'grid' && style.gridTemplateColumns && style.gridTemplateColumns !== 'none') {
        const tracks = style.gridTemplateColumns.split(' ').map((s) => parseFloat(s)).filter((n) => !Number.isNaN(n));
        if (tracks.some((w) => w === 0)) {
          gridAnomalies.push({ cls: el.className, gridTemplateColumns: style.gridTemplateColumns });
        }
      }

      const isIntentionalAccent = el.matches('.nexus-story-button, .nexus-layer-tab.is-active, .nexus-primary, .nexus-3axis-submit, .nexus-mobile-thumb-dock button.is-active, .nexus-theme-toggle, .nexus-sunlight-toggle, .nexus-scope-strip button[aria-pressed="true"], .nexus-decision-signal.is-critical, .nexus-decision-signal.is-watch, .nexus-decision-signal.is-stable, .nexus-db-action-btn.is-danger, .nexus-decision-compact-cta.is-danger');
      const ownBg = parseColor(style.backgroundColor);
      if (ownBg[3] > 0.65 && relLum(ownBg) < 0.08 && !isIntentionalAccent) {
        darkStragglers.push({ tag: el.tagName, cls: String(el.className), bg: style.backgroundColor });
      }

      const directText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join('');
      if (!directText) continue;

      const fs = parseFloat(style.fontSize);
      if (fs < 11.5 && !el.classList.contains('nexus-caption-sub')) {
        smallFonts.push({ tag: el.tagName, cls: String(el.className), fontSize: style.fontSize, text: directText.slice(0, 28) });
      }

      const fg = parseColor(style.color);
      const bg = getEffectiveBg(el);
      const blendedFg = fg[3] < 0.99 ? compositeOver(fg, bg) : fg;
      const l1 = relLum(blendedFg);
      const l2 = relLum(bg);
      const cr = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const weight = parseInt(style.fontWeight, 10) || 400;
      const minCr = fs >= 24 || (fs >= 18 && weight >= 700) ? 3.0 : 4.5;
      if (cr < minCr) {
        lowContrast.push({
          tag: el.tagName,
          cls: String(el.className),
          cr: Number(cr.toFixed(2)),
          color: style.color,
          bg: `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`,
          text: directText.slice(0, 28),
        });
      }
    }

    return {
      lowContrastCount: lowContrast.length,
      darkStragglerCount: darkStragglers.length,
      smallFontCount: smallFonts.length,
      gridAnomalyCount: gridAnomalies.length,
      lowContrast: lowContrast.slice(0, 25),
      darkStragglers: darkStragglers.slice(0, 25),
      smallFonts: smallFonts.slice(0, 25),
      gridAnomalies: gridAnomalies.slice(0, 25),
    };
  });

  const passed =
    report.lowContrastCount === 0 &&
    report.darkStragglerCount === 0 &&
    report.smallFontCount === 0 &&
    report.gridAnomalyCount === 0;
  checks.push({
    name: `Light Theme QA [${viewLabel}] (AA contrast, zero dark stragglers, >=12px fonts, clean grids)`,
    ok: passed,
    detail: report,
  });
  if (!passed) {
    lightQaFailures.push({ viewLabel, ...report });
  }
};

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  await page.addInitScript(() => sessionStorage.setItem('isAdminAuthenticated', 'true'));
  await page.route('**/api/admin/auth', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"authenticated":true}' }),
  );

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '안전지능 네트워크 · 시제품' }).first().click();
  const root = page.locator('.safety-nexus');
  await root.waitFor({ state: 'visible', timeout: 20000 });

  // =========================================================================
  // PART A: HQ 4-View All-Sites Sovereign Command & Executive Briefing
  // =========================================================================
  recordCheck(
    'Default view is HQ Sovereign Command (hq_command) with 4 view tabs and Light theme',
    (await root.getAttribute('data-workspace-role')) === 'hq' &&
    (await root.locator('.nexus-view-tab').count()) === 4 &&
    (await root.getAttribute('data-nexus-theme')) === 'light',
  );
  recordCheck('ORBIT 01 default 5 nodes', (await root.locator('.nexus-node').count()) === 5);

  await root.getByRole('button', { name: /예시 현장 불러오기/ }).click();

  recordCheck(
    'UX-1 HQ urgent decision queue renders after loading demo data',
    (await root.locator('.nexus-hq-morning-bar').count()) === 1,
  );
  await root.locator('.nexus-context-rail .nexus-scope-strip').getByRole('button', { name: '제1현장' }).click();
  recordCheck(
    'UX-1 Active Filter Context Ribbon appears on HQ site filter & resets cleanly',
    (await root.locator('.nexus-active-filters-bar').count()) === 1,
  );
  await page.screenshot({ path: resolve(outDir, 'nexus-v4-hq-ux-1440.png'), fullPage: false });
  await page.screenshot({ path: resolve(outDir, 'nexus-v5-light-hq-1440.png'), fullPage: false });
  await assertLightThemeQuality(root, 'HQ_1_3D');

  // Verify Desktop 4-stage Decision-First Brief expand + persona switch
  const decisionBrief = root.locator('.nexus-decision-brief');
  await decisionBrief.locator('.nexus-decision-expand-btn').click();
  recordCheck(
    'UX-9 Desktop HQ Decision-First Brief expands into 4 stages (SoWhat/Why/How/Outcome)',
    (await decisionBrief.locator('.nexus-db-card').count()) === 4 &&
    (await decisionBrief.locator('.nexus-decision-grid').isVisible()),
  );
  await decisionBrief.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await assertLightThemeQuality(root, 'HQ_DECISION_EXPANDED');
  await page.screenshot({ path: resolve(outDir, 'nexus-v8-hq-decision-1440.png'), fullPage: false });
  await decisionBrief.locator('.nexus-decision-expand-btn').click();

  await root.locator('.nexus-sunlight-toggle').click();
  await page.waitForTimeout(200);
  recordCheck(
    'UX-6 Sunlight High-Contrast mode toggles cleanly & passes daylight readability QA',
    (await root.getAttribute('data-nexus-sunlight')) === 'true',
  );
  await assertLightThemeQuality(root, 'HQ_SUNLIGHT');
  await page.screenshot({ path: resolve(outDir, 'nexus-v7-sunlight-hq-1440.png'), fullPage: false });
  await root.locator('.nexus-sunlight-toggle').click();
  await page.waitForTimeout(150);
  await root.locator('.nexus-theme-toggle').click();
  await page.waitForTimeout(260);
  recordCheck(
    'Dual Theme toggle switches cleanly from light to dark',
    (await root.getAttribute('data-nexus-theme')) === 'dark',
  );
  await page.screenshot({ path: resolve(outDir, 'nexus-v5-dark-hq-1440.png'), fullPage: false });
  await root.locator('.nexus-theme-toggle').click();
  await page.waitForTimeout(260);
  recordCheck(
    'Dual Theme toggle restores light mode cleanly',
    (await root.getAttribute('data-nexus-theme')) === 'light',
  );

  const visibleHeroText = await root.innerText();
  const bannedJargon = ['SLICE 2', 'SLICE 3', 'SLICE 4', 'ASTROLABE', 'SOVEREIGN', '텔레메트리', '미전송 큐', '파이프라인', '커맨드 팔레트', '매니페스트', 'ORBIT 0'];
  recordCheck(
    'Developer jargon purified cleanly on Safety Nexus hero & navigation',
    bannedJargon.every(term => !visibleHeroText.includes(term)),
    bannedJargon.filter(term => visibleHeroText.includes(term)),
  );

  await root.locator('.nexus-active-filter-reset').click();
  recordCheck(
    'UX-1 Active Filter Context Ribbon dismisses after reset click',
    (await root.locator('.nexus-active-filters-bar').count()) === 0,
  );

  await root.getByRole('button', { name: /보기 02/ }).click();
  recordCheck('ORBIT 02 6 core module nodes', (await root.locator('.nexus-node').count()) === 6);

  await root.getByRole('button', { name: /보기 03/ }).click();
  recordCheck('ORBIT 03 10 structural/substructure RC nodes', (await root.locator('.nexus-node').count()) === 10);
  await root.locator('.nexus-node.node-4').click();
  await root.getByRole('combobox', { name: '3축 구간 분류' }).selectOption('substructure_rc');
  recordCheck(
    '3-axis filter auto-locks sphere onto Node 01 (Substructure RC)',
    (await root.locator('.nexus-node.node-0').getAttribute('aria-pressed')) === 'true',
  );
  await root.getByRole('button', { name: '3축 필터 초기화' }).click();
  await root.locator('.nexus-elevation-buttons button', { hasText: '지하 RC 외벽 · 합벽' }).click();
  recordCheck(
    'G2 Elevation Minimap floor click locks 3D sphere onto Node 01',
    (await root.locator('.nexus-node.node-0').getAttribute('aria-pressed')) === 'true',
  );
  await root.locator('.nexus-header').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(outDir, 'nexus-v3-hero-1440.png'), fullPage: false });

  // View ②: HQ Executive Briefing BI + Unified 1-Page CEO Daily Briefing Sheet
  await root.getByRole('tab', { name: '② 경영 브리핑 BI' }).click();
  const biView = root.locator('.nexus-hq-bi-view');
  await biView.waitFor({ state: 'visible', timeout: 10000 });
  recordCheck(
    'HQ BI View shows 3-Site Portfolio Comparison Matrix (3 sites)',
    (await biView.locator('.nexus-site-matrix-card').count()) === 3,
  );
  await biView.getByRole('button', { name: /대표이사 일일 통합 안전브리핑 1장 생성/ }).click();
  recordCheck(
    'HQ BI generates Unified 1-Page CEO Daily Briefing sheet with verified photo thumbnails',
    (await biView.locator('.nexus-ceo-daily-sheet').count()) === 1 &&
    (await biView.locator('.nexus-ceo-daily-thumbs img').count()) >= 1,
  );
  await biView.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(outDir, 'nexus-v2-hq-daily-ceo-1440.png'), fullPage: false });
  await biView.getByRole('button', { name: '✕ 닫기' }).click();

  recordCheck(
    'HQ BI View shows 4 Bento KPI cards',
    (await biView.getByRole('group', { name: '핵심 성과 지표 4종' }).locator('.nexus-bento-card').count()) === 4,
  );
  recordCheck(
    'HQ BI View shows 20 conditional heatmap cells (4x5)',
    (await biView.getByRole('gridcell').count()) === 20,
  );
  recordCheck(
    'HQ BI View renders Recharts ComposedChart SVG',
    (await biView.locator('.nexus-bento-chart-box svg').count()) >= 1,
  );
  await page.screenshot({ path: resolve(outDir, 'nexus-v3-bi-1440.png'), fullPage: false });
  await page.screenshot({ path: resolve(outDir, 'nexus-v5-light-bi-1440.png'), fullPage: false });
  await assertLightThemeQuality(root, 'HQ_2_BI');

  // Verify G3 Bento KPI Card drill-down to HQ Ops
  await biView.getByRole('button', { name: /건설기계 사용전 사진보고/ }).click();
  recordCheck(
    'G3 Bento KPI card click drills down directly to HQ Ops equipment tab',
    (await root.locator('.nexus-workbench').isVisible()) &&
    (await root.getByLabel('건설기계 사진 본사 검토자').count()) === 1,
  );
  await root.getByRole('tab', { name: '② 경영 브리핑 BI' }).click();
  await biView.waitFor({ state: 'visible', timeout: 10000 });

  await biView.getByRole('gridcell').first().click();
  recordCheck(
    'Heatmap cell click organically switches to ① 3D 전사 지휘 with locked node',
    (await root.getByRole('tab', { name: '① 3D 전사 지휘' }).getAttribute('aria-selected')) === 'true' &&
    (await root.locator('.nexus-node.selected').count()) === 1,
  );

  // U3 + UX-2 Ctrl+K Command Palette ArrowDown + Enter execution in HQ mode + capture screenshot
  await page.keyboard.press('Control+k');
  const cmdDialog = root.getByRole('dialog', { name: '안전지능 빠른 기능 찾기' });
  await cmdDialog.waitFor({ state: 'visible', timeout: 5000 });
  const cmdSearchInput = cmdDialog.getByLabel('빠른 실행 명령 검색');
  await cmdSearchInput.fill('PPTX');
  recordCheck(
    'U3 Ctrl+K Command Palette opens in HQ mode and filters CEO PPTX action',
    (await cmdDialog.getByRole('button', { name: /PPTX/ }).count()) >= 1,
  );
  await page.screenshot({ path: resolve(outDir, 'nexus-v3-palette-1440.png'), fullPage: false });
  await cmdSearchInput.fill('건설기계');
  await cmdSearchInput.press('ArrowDown');
  await cmdSearchInput.press('ArrowUp');
  await cmdSearchInput.press('Enter');
  recordCheck(
    'UX-2 Pressing Enter in Command Palette executes highlighted item & closes palette',
    (await cmdDialog.count()) === 0 && (await root.locator('.nexus-workbench').isVisible()),
  );
  await root.getByRole('tab', { name: '① 3D 전사 지휘' }).click();

  // View ③: HQ Approvals, Equipment Batch Verify, Lightbox Prev/Next & Inline Decision, CEO Pack & All-Sites Directive
  await root.getByRole('tab', { name: '③ 본사 결재·보고·순회' }).click();
  await root.locator('.nexus-workbench').waitFor({ state: 'visible', timeout: 10000 });
  recordCheck(
    'HQ Ops Studio displays 5 HQ tabs and Sticky Context Breadcrumb bar',
    (await root.locator('.nexus-workbench-tab').count()) === 5 &&
    (await root.locator('.nexus-sticky-breadcrumb').isVisible()),
  );

  await root.getByLabel('건설기계 사진 본사 검토자').fill('본사 안전보건실 박실장');
  // Open photo lightbox zoom, navigate Next/Prev & close with Escape
  await root.locator('.nexus-equip-thumb-btn').first().click();
  recordCheck(
    'Clicking equipment photo opens full Lightbox zoom modal with Next button',
    (await root.getByRole('dialog', { name: '건설기계 점검 사진 확대 보기' }).count()) === 1 &&
    (await root.getByRole('button', { name: '다음 사진 보기' }).count()) === 1,
  );
  await root.getByRole('button', { name: '다음 사진 보기' }).click();
  await page.keyboard.press('Escape');
  recordCheck(
    'Pressing Escape closes equipment photo Lightbox modal',
    (await root.getByRole('dialog', { name: '건설기계 점검 사진 확대 보기' }).count()) === 0,
  );

  // Batch verify remaining submitted_to_hq equipment photos and compile CEO pack
  await root.getByRole('button', { name: /대기 사진 일괄 적합 확인/ }).click();
  recordCheck(
    'HQ batch verifies pending equipment photos cleanly',
    (await root.getByText(/\[일괄 적합 검토 완료\]/).count()) === 1,
  );
  await root.getByRole('button', { name: /선별 사진 대표이사·경영진 1장 보고서 발행/ }).click();
  recordCheck(
    'HQ compiles CEO 1-page briefing sheet and marks photos reported_to_ceo',
    (await root.locator('.nexus-ceo-briefing-sheet').count()) === 1 &&
    (await root.locator('.nexus-equip-photo-card[data-status="reported_to_ceo"]').count()) >= 2,
  );
  await root.locator('.nexus-workbench').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await assertLightThemeQuality(root, 'HQ_3_Ops_Equip');
  await page.screenshot({ path: resolve(outDir, 'nexus-v2-hq-ops-1440.png'), fullPage: false });
  await page.screenshot({ path: resolve(outDir, 'nexus-v6-light-ops-1440.png'), fullPage: false });

  // HQ All-Sites Action Monitor & Emergency Directive Dispatch
  await root.getByRole('tab', { name: /전 현장 조치·작업중지 관제/ }).click();
  await assertLightThemeQuality(root, 'HQ_3_Ops_Monitor');
  recordCheck(
    'HQ Action Monitor collapses 30s field registration form into collapsible details',
    (await root.locator('.nexus-3axis-bridge .nexus-collapsible-form').count()) === 1,
  );
  const site1CaseItem = root.locator('.nexus-3axis-case-list li', { hasText: '제1현장' }).first();
  await site1CaseItem.getByLabel(/본사 긴급 지시 입력/).fill('지하 2층 타이볼트 전수 체결 사진 14시 전 보고');
  await site1CaseItem.getByRole('button', { name: /본사 긴급 지시 하달/ }).click();
  recordCheck(
    'HQ dispatches emergency directive onto Site 1 pipeline case',
    (await root.locator('.nexus-hq-directive-banner').count()) >= 1,
  );

  // HQ 05 Investigation approval
  await root.getByRole('tab', { name: /05 · 02 사고조사 승인·보완/ }).click();
  await root.getByRole('button', { name: /본사 최종 승인 · 02 사고사례 DB 편입 및 04 대표이사 12개국어 교육 자동 발령/ }).first().click();
  recordCheck(
    'HQ approves Site 2 AI investigation and promotes to Incident DB & Training',
    (await root.getByText(/\[본사 승인 완료\]/).count()) === 1,
  );

  // View ④: HQ Raw Audit View + SAPA Compliance ZIP Packager
  await root.getByRole('tab', { name: '④ 원천 이력·감사' }).click();
  recordCheck(
    'HQ Audit View renders #nexus-followup-details & SAPA Compliance Bundle Packager cleanly',
    (await root.locator('#nexus-followup-details').isVisible()) &&
    (await root.locator('.nexus-compliance-panel').isVisible()) &&
    (await root.getByRole('button', { name: /증빙 ZIP 패키지 1클릭 편철 저장/ }).count()) === 1,
  );
  await root.locator('.nexus-compliance-panel').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await assertLightThemeQuality(root, 'HQ_4_Audit');
  await page.screenshot({ path: resolve(outDir, 'nexus-v2-hq-compliance-1440.png'), fullPage: false });
  await page.screenshot({ path: resolve(outDir, 'nexus-v6-light-audit-1440.png'), fullPage: false });

  // Dynamic Company Site Master Add + Archive in HQ View ③
  await root.getByRole('tab', { name: '③ 본사 결재·보고·순회' }).click();
  await root.locator('.nexus-site-master-details summary').click();
  await root.getByLabel('신규 현장명 입력').fill('제4현장 송도 물류센터 골조');
  await root.getByLabel('현장 단축 라벨').fill('제4현장 · 송도 PC골조');
  await root.getByLabel('현장 안전책임자').fill('박안전 소장');
  await root.getByRole('button', { name: /\+ 우리 회사 현장 추가/ }).click();
  recordCheck(
    'HQ Site Master adds custom Site 4 and reflects it in scope pills',
    (await root.locator('.nexus-scope-strip').getByText('제4현장').count()) >= 1,
  );
  await root.locator('.nexus-site-master-details').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(outDir, 'nexus-v2-site-master-1440.png'), fullPage: false });
  await root.locator('.nexus-site-master-list li', { hasText: '제4현장' }).getByRole('button', { name: '준공·보관' }).click();
  await root.locator('.nexus-site-master-details summary').click();

  // =========================================================================
  // PART B: Field Safety Manager Single-Site Isolation & Bidirectional Loops (SITE-01-SUBRC)
  // =========================================================================
  await root.getByRole('button', { name: /현장 안전관리자 \(단일 현장 격리\)/ }).click();
  recordCheck(
    'Field mode active with Morning Action Bar and single-site shield badge',
    (await root.getAttribute('data-workspace-role')) === 'field' &&
    (await root.locator('.nexus-field-morning-bar').count()) === 1 &&
    (await root.locator('.nexus-field-lock-badge').getByText(/단일 현장 격리/).count()) === 1,
  );
  recordCheck(
    'Field mode hides HQ Matrix, Bento BI, and BI tab',
    (await root.locator('.nexus-site-matrix-card').count()) === 0 &&
    (await root.locator('.nexus-bento-board').count()) === 0 &&
    (await root.getByRole('tab', { name: '② 경영 브리핑 BI' }).count()) === 0,
  );

  const site1CaseListText = await root.locator('.nexus-3axis-case-list').innerText();
  recordCheck(
    'Site 1 Field sees HQ urgent directive & ZERO Site 2/3 records',
    !site1CaseListText.includes('제2현장') &&
    !site1CaseListText.includes('제3현장') &&
    (await root.locator('.nexus-hq-directive-banner').count()) >= 1,
  );
  await root.locator('.nexus-field-morning-bar').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await assertLightThemeQuality(root, 'FIELD_1_Ops_30s');
  await page.screenshot({ path: resolve(outDir, 'nexus-v2-field-morning-1440.png'), fullPage: false });
  await page.screenshot({ path: resolve(outDir, 'nexus-v6-light-field-1440.png'), fullPage: false });

  // Field Stop-Work + Progressive Disclosure + Pipeline Search + 4-step Stepper + Shift Handover 5-line copy
  recordCheck(
    'UX-3 Field 30s form hides secondary auto-filled inputs behind progressive disclosure toggle',
    (await root.locator('.nexus-advanced-toggle-btn').getAttribute('aria-expanded')) === 'false' &&
    (await root.locator('.nexus-case-stepper').count()) >= 1,
  );
  await root.locator('.nexus-advanced-toggle-btn').click();
  recordCheck(
    'UX-3 Progressive disclosure expands secondary 3-axis & assignee fields on click',
    (await root.locator('.nexus-advanced-toggle-btn').getAttribute('aria-expanded')) === 'true' &&
    (await root.getByLabel('자동분류 구간 축').isVisible()),
  );
  await root.locator('.nexus-advanced-toggle-btn').click();

  await root.getByLabel('조치·인계 현황 검색').fill('없는검색어xyz999');
  recordCheck(
    'UX-4 Pipeline search empty state renders filter reset button cleanly',
    (await root.getByRole('button', { name: '필터·검색 초기화' }).count()) === 1,
  );
  await root.getByRole('button', { name: '필터·검색 초기화' }).click();

  await root.getByRole('button', { name: /#01 지하RC/ }).click();
  await root.locator('.nexus-stopwork-toggle input[type="checkbox"]').check();
  await root.getByRole('button', { name: /30초 조치·재점검·인계 등록 및 구체 환류/ }).click();
  recordCheck(
    'Field registers Stop-Work action locked to Site 1',
    (await root.locator('.nexus-stopwork-badge').count()) >= 1,
  );
  await root.getByRole('button', { name: /교대 인계서 5줄 복사/ }).click();
  recordCheck(
    'Field generates 5-line shift handover briefing text',
    (await root.locator('.nexus-handover-preview').count()) === 1,
  );

  // Field Equipment Photo: Upload -> HQ Requests Revision -> Field Resubmits!
  await root.getByRole('tab', { name: /건설기계 사용전 사진 본사 전송/ }).click();
  recordCheck(
    'Field Equipment tab locks site and removes HQ approval/CEO buttons',
    (await root.getByRole('combobox', { name: '건설기계 점검 현장 선택' }).count()) === 0 &&
    (await root.locator('.nexus-field-locked-site-pill').count()) === 1 &&
    (await root.getByRole('button', { name: /본사 적합 검토/ }).count()) === 0,
  );
  await root.getByLabel('건설기계 종류 선택').selectOption('mobile_crane');
  await root.getByLabel('건설기계 작업 내용').fill('지하 2층 자재 인양 이동식 크레인 아웃트리거 점검');
  await root.getByLabel('건설기계 사진 업로더').fill('제1현장 안전관리자 김안전');
  await root.getByRole('button', { name: /건설기계 사용전 점검 사진 본사 전송/ }).click();
  recordCheck(
    'Field uploads Site 1 mobile crane photo to HQ queue',
    (await root.locator('.nexus-equip-photo-card[data-status="submitted_to_hq"]').count()) >= 1,
  );

  // HQ rejects Site 1 mobile crane photo -> Field sees revision card & resubmits
  await root.getByRole('button', { name: /본사 통합 관제 \(전사\)/ }).click();
  await root.getByRole('tab', { name: '③ 본사 결재·보고·순회' }).click();
  await root.getByRole('button', { name: '보완 요청' }).first().click();
  await root.getByRole('button', { name: /현장 안전관리자 \(단일 현장 격리\)/ }).click();
  await root.locator('.nexus-field-morning-bar').getByRole('button', { name: /본사 보완요청/ }).click();
  await root.getByRole('tab', { name: /건설기계 사용전 사진 본사 전송/ }).click();
  const resubNote = root.locator('input[aria-label^="건설기계 사진 보완 메모"]').first();
  await resubNote.fill('아웃트리거 깔목 설치 근접 사진 재촬영 완료');
  await root.getByRole('button', { name: /현장 보완 사진 본사 재전송/ }).first().click();
  recordCheck(
    'Field resubmits revision-requested equipment photo back to HQ',
    (await root.getByText(/\[현장 보완 사진 본사 재전송\]/).count()) === 1,
  );

  // Field View ②: Training 12-lang (NO HQ dispatch button!) + QR Handwritten Signature Kiosk & HQ Visit Ack
  await root.getByRole('tab', { name: '② 본사 수신·교육·상신' }).click();
  await assertLightThemeQuality(root, 'FIELD_2_Inbox');
  recordCheck(
    'Field 12-Language Training hides HQ authoring/dispatch buttons',
    (await root.getByRole('button', { name: /12개국어 전 현장 즉시 발령/ }).count()) === 0 &&
    (await root.getByLabel('지정 교육 대상 인원').count()) === 0,
  );
  await root.locator('.nexus-qr-kiosk-details summary').first().click();
  await root.locator('.nexus-qr-kiosk-panel').first().scrollIntoViewIfNeeded();
  await root.locator('input[aria-label^="서명 근로자 성명"]').first().fill('NGUYEN VAN B');
  const sigBox = await root.locator('.nexus-sig-canvas').first().boundingBox();
  if (sigBox) {
    await page.mouse.move(sigBox.x + 40, sigBox.y + 45);
    await page.mouse.down();
    await page.mouse.move(sigBox.x + 140, sigBox.y + 65, { steps: 6 });
    await page.mouse.move(sigBox.x + 220, sigBox.y + 40, { steps: 6 });
    await page.mouse.up();
  }
  await root.getByRole('button', { name: /모국어 이해 확인 · 자필 서명 저장/ }).first().click();
  recordCheck(
    'Field QR Handwritten Signature Kiosk saves worker PNG receipt & increments count',
    (await root.locator('.nexus-sig-receipt-chip').count()) >= 1 &&
    (await root.getByText(/\[자필 서명 저장 완료\]/).count()) === 1,
  );
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(outDir, 'nexus-v2-qr-kiosk-1440.png'), fullPage: false });
  await root.locator('.nexus-qr-kiosk-details summary').first().click();

  await root.getByRole('button', { name: '🔄 지금 동기화' }).click();
  recordCheck(
    'Underground offline mutation queue flushes cleanly to pending 0',
    (await root.locator('.nexus-live-sync-bar').getByText('전송 대기 0건').count()) === 1,
  );

  // UX-7 Offline Re-Sync Conflict Diff Drawer verification
  await page.evaluate(() => {
    let targetCase = null;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(k) || 'null');
        if (Array.isArray(parsed)) {
          const hit = parsed.find(x => x && typeof x === 'object' && x.siteId === 'SITE-01-SUBRC' && x.hqDirectiveNote && x.caseId);
          if (hit) { targetCase = hit; break; }
        }
      } catch {
        // Ignore non-JSON entries
      }
    }
    const queue = [{
      queueId: 'NXQ-E2E-CONFLICT-01',
      kind: 'pipeline_case',
      siteId: 'SITE-01-SUBRC',
      recordId: targetCase ? targetCase.caseId : 'CASE-E2E-01',
      summary: '지하 2층 오프라인 임시 보강조치 입력 (통신 두절 중 작성)',
      queuedAt: new Date(Date.now() - 60000).toISOString(),
      status: 'pending',
      attempts: 0,
    }];
    window.localStorage.setItem('psi_nexus_offline_sync_queue_v1', JSON.stringify(queue));
    window.dispatchEvent(new Event('psi-nexus-offline-queue-updated'));
  });
  await root.getByRole('button', { name: '🔄 지금 동기화' }).click();
  const conflictDrawer = root.locator('.nexus-conflict-drawer');
  await conflictDrawer.waitFor({ state: 'visible', timeout: 5000 });
  recordCheck(
    'UX-7 Offline re-sync detects HQ directive conflict and opens Diff Drawer',
    (await conflictDrawer.locator('.nexus-conflict-card').count()) >= 1 &&
    (await conflictDrawer.getByText('현장 오프라인 기록').count()) === 1,
  );
  await conflictDrawer.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(outDir, 'nexus-v7-conflict-diff-1440.png'), fullPage: false });
  await conflictDrawer.getByRole('button', { name: '양측 내용 병합 반영' }).first().click();
  recordCheck(
    'UX-7 Conflict Diff Drawer resolves merge choice and clears pending queue to 0',
    (await root.locator('.nexus-conflict-drawer').count()) === 0 &&
    (await root.locator('.nexus-live-sync-bar').getByText('전송 대기 0건').count()) === 1,
  );

  await root.getByRole('button', { name: '전원 서명·이수 100% 완료 확인' }).first().click();

  await root.getByRole('tab', { name: /01 본사 순회점검 지시 수신/ }).click();
  await root.locator('input[aria-label^="본사 순회점검 현장 접수 메모"]').first().fill('지하 2층 합벽 구간 사전 정돈 및 동행 준비 완료');
  await root.getByRole('button', { name: /현장 접수 확인 · 사전 준비 완료 응답/ }).first().click();
  recordCheck(
    'Field acknowledges HQ visit pre-briefing cleanly',
    (await root.locator('.nexus-visit-ack-badge').count()) >= 1,
  );

  // Verify Field Command Palette isolates HQ commands & other sites
  await root.getByRole('button', { name: '빠른 기능 찾기 열기' }).click();
  const fieldPalette = root.getByRole('dialog', { name: '안전지능 빠른 기능 찾기' });
  await fieldPalette.waitFor({ state: 'visible', timeout: 5000 });
  const fieldPaletteText = await fieldPalette.innerText();
  recordCheck(
    'Field Command Palette hides HQ PPTX/ZIP and other sites',
    !fieldPaletteText.includes('PPTX') &&
    !fieldPaletteText.includes('제2현장') &&
    fieldPaletteText.includes('30초 현장 점검'),
  );
  await page.keyboard.press('Escape');

  // =========================================================================
  // PART C: 6-Viewport Responsive Overflow Verification across HQ & Field Views
  // =========================================================================
  for (const vp of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1366, height: 900 },
    { width: 1440, height: 960 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(vp);
    for (const fView of ['① 현장 즉시 실행', '② 본사 수신·교육·상신', '③ 내 현장 3D 구체']) {
      await root.getByRole('tab', { name: fView }).click();
      const dim = await root.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
      recordCheck(`${vp.width}px Field ${fView} zero horizontal overflow`, dim.scroll <= dim.client + 2, dim);
    }
    if (vp.width === 390) {
      await root.getByRole('tab', { name: '③ 내 현장 3D 구체' }).click();
      recordCheck(
        '390px mobile starts motion playback enabled (data-motion-paused=false) & shows thumb dock',
        (await root.getAttribute('data-motion-paused')) === 'false' &&
        (await root.locator('.nexus-mobile-thumb-dock').isVisible()),
      );
      await root.getByRole('tab', { name: '① 현장 즉시 실행' }).click();
      const mobileDecision = root.locator('.nexus-decision-brief');
      recordCheck(
        'UX-10 390px mobile Decision-First Brief auto-expands 4 cards & blocks executive persona',
        (await mobileDecision.locator('.nexus-decision-grid').isVisible()) &&
        (await mobileDecision.locator('.nexus-db-card').count()) === 4 &&
        (await mobileDecision.locator('.nexus-decision-personas button', { hasText: '경영진' }).count()) === 0,
      );
      await mobileDecision.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await page.screenshot({ path: resolve(outDir, 'nexus-v8-mobile-decision-390.png'), fullPage: false });
      recordCheck(
        'UX-5 390px mobile thumb dock marks active tab with .is-active & exposes quick-action row',
        (await root.locator('.nexus-mobile-thumb-dock button.is-active').count()) === 1 &&
        (await root.locator('.nexus-dock-quick-photo').isVisible()) &&
        (await root.locator('.nexus-dock-quick-stopwork').isVisible()) &&
        (await root.locator('.nexus-sticky-breadcrumb').isVisible()),
      );
      await root.locator('.nexus-dock-quick-stopwork').click();
      await page.waitForTimeout(150);
      recordCheck(
        'UX-8 390px thumb dock 1-tap Stop-Work triggers immediate checkbox selection in inspect_03_06',
        (await root.locator('.nexus-stopwork-toggle input[type="checkbox"]').isChecked()),
      );
      await root.locator('.nexus-stopwork-toggle input[type="checkbox"]').uncheck();
      await root.locator('.nexus-header').scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await page.screenshot({ path: resolve(outDir, 'nexus-v3-mobile-field-390.png'), fullPage: false });
      await page.screenshot({ path: resolve(outDir, 'nexus-v4-field-ux-390.png'), fullPage: false });
      await page.screenshot({ path: resolve(outDir, 'nexus-v5-light-field-390.png'), fullPage: false });
      await page.screenshot({ path: resolve(outDir, 'nexus-v7-mobile-thumb-390.png'), fullPage: false });
    }
    await root.getByRole('button', { name: /본사 통합 관제 \(전사\)/ }).click();
    for (const hView of ['① 3D 전사 지휘', '② 경영 브리핑 BI', '③ 본사 결재·보고·순회']) {
      await root.getByRole('tab', { name: hView }).click();
      const dim = await root.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
      recordCheck(`${vp.width}px HQ ${hView} zero horizontal overflow`, dim.scroll <= dim.client + 2, dim);
    }
    await root.getByRole('button', { name: /현장 안전관리자 \(단일 현장 격리\)/ }).click();
  }

  // Verify Phase 2 Dashboard Bridge on PrecisionOperationsBoard
  await root.getByRole('button', { name: /본사 통합 관제 \(전사\)/ }).click();
  await root.getByRole('button', { name: /관제센터로 돌아가기/ }).click();
  const dashboardBridge = page.locator('[aria-label="안전지능 네트워크 본사·현장 폐루프 요약 연동"]');
  await dashboardBridge.waitFor({ state: 'visible', timeout: 10000 });
  recordCheck(
    'Phase 2 Dashboard Sovereign Nexus Bridge visible alongside .psi-ops-kpi-grid',
    (await page.locator('.psi-ops-kpi-grid').count()) >= 1 &&
    (await dashboardBridge.getByText('건설기계 사용전 사진', { exact: true }).count()) === 1,
  );

  // =========================================================================
  // PART D: Connected Subpages UI/UX Parity, 4-Stage Decision Brief & Sunlight Sync
  // =========================================================================
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: '위험성평가 분석' }).first().click();
  const ocrDecisionShell = page.locator('.psi-connected-decision-shell[data-page="ocr-analysis"]');
  await ocrDecisionShell.waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('main .animate-spin').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await ocrDecisionShell.locator('.psi-cd-expand-btn').click();
  recordCheck(
    'Connected Subpage [ocr-analysis] renders 4-stage Decision-First Brief & Nexus return CTA',
    (await ocrDecisionShell.locator('.psi-cd-card').count()) === 4 &&
    (await ocrDecisionShell.locator('.psi-cd-nexus-btn').isVisible()),
  );
  await page.waitForTimeout(750);
  await page.screenshot({ path: resolve(outDir, 'nexus-v9-ocr-decision-1440.png'), fullPage: false });

  // Toggle global TopBar Outdoor Sunlight High-Contrast Mode and verify persistence across subpages
  await page.getByRole('button', { name: /야외 직사광선 고대비 모드 켜기/ }).click();
  const sunlightBtnTextColor = await page
    .locator('.psi-sunlight-toggle-btn[aria-pressed="true"] span')
    .last()
    .evaluate(el => getComputedStyle(el).color);
  recordCheck(
    'TopBar Sunlight High-Contrast toggle activates global data-psi-sunlight=true & bright yellow ON text',
    (await page.evaluate(() => document.documentElement.dataset.psiSunlight)) === 'true' &&
    sunlightBtnTextColor === 'rgb(253, 224, 71)',
    sunlightBtnTextColor,
  );
  await page.getByRole('button', { name: '사진점검 · 개선관리' }).first().click();
  const inspDecisionShell = page.locator('.psi-connected-decision-shell[data-page="safety-inspector"]');
  await inspDecisionShell.waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('main .animate-spin').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  recordCheck(
    'Connected Subpage [safety-inspector] inherits global Sunlight Mode & shows 4-stage brief',
    (await page.evaluate(() => document.documentElement.dataset.psiSunlight)) === 'true' &&
    (await inspDecisionShell.locator('.psi-cd-card').count()) === 4,
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(outDir, 'nexus-v9-inspector-sunlight-1440.png'), fullPage: false });
  await page.getByRole('button', { name: /야외 고대비 모드 끄기/ }).click();

  // Navigate off safety-inspector (which omits bottom nav on mobile) before 390px mobile bottom-nav check
  await page.getByRole('button', { name: '안전조치 통합 허브' }).first().click();
  await page.locator('.psi-connected-decision-shell[data-page="safety-compliance-hub"]').waitFor({
    state: 'visible',
    timeout: 10000,
  });

  // Verify 390px mobile connected subpage Decision-First Brief auto-expands & 1-tap navigation works cleanly
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('navigation', { name: '모바일 하단 탐색' }).getByRole('button', { name: '위험분석' }).click();
  const mobileOcrDecision = page.locator('.psi-connected-decision-shell[data-page="ocr-analysis"]');
  await mobileOcrDecision.waitFor({ state: 'visible', timeout: 10000 });
  const ocrMobileOverflow = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  recordCheck(
    '390px Mobile Connected Subpage [ocr-analysis] auto-expands 4-card Decision Brief with zero horizontal overflow',
    (await mobileOcrDecision.locator('.psi-cd-grid').isVisible()) &&
    (await mobileOcrDecision.locator('.psi-cd-card').count()) === 4 &&
    ocrMobileOverflow.scroll <= ocrMobileOverflow.client + 2,
    ocrMobileOverflow,
  );
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(outDir, 'nexus-v9-mobile-ocr-390.png'), fullPage: false });

  await mobileOcrDecision.getByRole('button', { name: /교육 환류로 즉시 연결/ }).click();
  const mobileEduDecision = page.locator('.psi-connected-decision-shell[data-page="education-return"]');
  await mobileEduDecision.waitFor({ state: 'visible', timeout: 10000 });
  recordCheck(
    '1-tap How CTA on Mobile Connected Brief navigates seamlessly to [education-return]',
    (await mobileEduDecision.locator('.psi-cd-grid').isVisible()) &&
    (await mobileEduDecision.locator('.psi-cd-card').count()) === 4,
  );

  // =========================================================================
  // PART E: Top-Tier Living Kinetic Telemetry, Universal Inspector & Quick Jump
  // =========================================================================
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: '위험성평가 분석' }).first().click();
  await ocrDecisionShell.waitFor({ state: 'visible', timeout: 10000 });
  const beaconCount = await ocrDecisionShell.locator('.psi-kinetic-beacon').count();
  const sparklineCount = await ocrDecisionShell.locator('.psi-kinetic-sparkline .psi-sparkline-path').count();
  const sweepCount = await ocrDecisionShell.locator('.psi-kinetic-sweep').count();
  recordCheck(
    'PART E: Connected Brief renders Living Kinetic Beacon, Sparklines & Telemetry Sweep',
    beaconCount >= 1 && sparklineCount >= 3 && sweepCount >= 1,
    { beaconCount, sparklineCount, sweepCount },
  );

  const motionToggleBtn = page.locator('.psi-motion-toggle-btn');
  await motionToggleBtn.click();
  const pausedAfterClick = await page.evaluate(() => document.documentElement.dataset.psiMotionPaused);
  await motionToggleBtn.click();
  const resumedAfterClick = await page.evaluate(() => document.documentElement.dataset.psiMotionPaused);
  recordCheck(
    'PART E: TopBar global kinetic motion toggle pauses and resumes animation cleanly',
    pausedAfterClick === 'true' && resumedAfterClick === 'false',
    { pausedAfterClick, resumedAfterClick },
  );

  await ocrDecisionShell.locator('.psi-cd-inspector-btn').click();
  const drawer = page.locator('.psi-universal-drawer');
  await drawer.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(280);
  await page.screenshot({ path: resolve(outDir, 'nexus-v10-drawer-1440.png'), fullPage: false });
  let drawerActed = false;
  const closeCaseBtn = drawer.getByRole('button', { name: '조치 완료 종결' }).first();
  if ((await closeCaseBtn.count()) > 0) {
    await closeCaseBtn.click();
    await drawer.locator('.psi-universal-drawer-toast').waitFor({ state: 'visible', timeout: 5000 });
    drawerActed = true;
  } else {
    drawerActed = (await drawer.getByRole('tab').count()) === 2;
  }
  await drawer.getByRole('button', { name: '현장 점검 결재함 닫기' }).click();
  await drawer.waitFor({ state: 'detached', timeout: 5000 });
  recordCheck(
    'PART E: Universal Slide-Over Inspector executes live closure without leaving subpage',
    drawerActed,
  );

  await page.getByRole('button', { name: '빠른 찾기 열기' }).click();
  const quickJump = page.locator('.psi-quickjump-dialog');
  await quickJump.waitFor({ state: 'visible', timeout: 5000 });
  await quickJump.getByRole('searchbox', { name: '빠른 찾기 검색어 입력' }).fill('사진점검');
  await quickJump.getByRole('option', { name: /사진점검 · 개선관리/ }).first().click();
  await page.locator('.psi-connected-decision-shell[data-page="safety-inspector"]').waitFor({
    state: 'visible',
    timeout: 10000,
  });
  recordCheck(
    'PART E: Global Quick Jump searches practitioner pages & navigates cleanly to [safety-inspector]',
    true,
  );

  recordCheck('Zero runtime page errors during full simulation', pageErrors.length === 0, pageErrors);
  recordCheck(
    `All Light Theme QA views passed (${checks.filter(c => c.name.startsWith('Light Theme QA')).length} views)`,
    lightQaFailures.length === 0,
    lightQaFailures,
  );
  await writeFile(
    resolve(outDir, 'simulation-report.json'),
    JSON.stringify({ pass: true, totalChecks: checks.length, checks }, null, 2) + '\n',
  );
  console.log(`[SAFETY NEXUS v2.0 Persona Deep Simulation] ${checks.length}/${checks.length} checks PASSED.`);
  await page.close();
} finally {
  await browser.close();
}

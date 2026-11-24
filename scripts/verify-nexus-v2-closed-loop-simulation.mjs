import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.PSI_UI_URL || 'http://127.0.0.1:4182/';
const outDir = resolve('artifacts/audit/browser/safety-nexus-v2-sim');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const checks = [];
const recordCheck = (name, ok, detail = {}) => {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) {
    throw new Error(`Simulation check failed: ${name} -> ${JSON.stringify(detail)}`);
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
  recordCheck('HQ Ops Studio displays 5 HQ tabs', (await root.locator('.nexus-workbench-tab').count()) === 5);

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
  await page.screenshot({ path: resolve(outDir, 'nexus-v2-hq-ops-1440.png'), fullPage: false });

  // HQ All-Sites Action Monitor & Emergency Directive Dispatch
  await root.getByRole('tab', { name: /전 현장 조치·작업중지 관제/ }).click();
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
  await page.screenshot({ path: resolve(outDir, 'nexus-v2-hq-compliance-1440.png'), fullPage: false });

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
  await page.screenshot({ path: resolve(outDir, 'nexus-v2-field-morning-1440.png'), fullPage: false });

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
      recordCheck(
        'UX-5 390px mobile thumb dock marks active tab with .is-active',
        (await root.locator('.nexus-mobile-thumb-dock button.is-active').count()) === 1,
      );
      await root.locator('.nexus-header').scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await page.screenshot({ path: resolve(outDir, 'nexus-v3-mobile-field-390.png'), fullPage: false });
      await page.screenshot({ path: resolve(outDir, 'nexus-v4-field-ux-390.png'), fullPage: false });
      await page.screenshot({ path: resolve(outDir, 'nexus-v5-light-field-390.png'), fullPage: false });
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

  recordCheck('Zero runtime page errors during full simulation', pageErrors.length === 0, pageErrors);
  await writeFile(
    resolve(outDir, 'simulation-report.json'),
    JSON.stringify({ pass: true, totalChecks: checks.length, checks }, null, 2) + '\n',
  );
  console.log(`[SAFETY NEXUS v2.0 Persona Deep Simulation] ${checks.length}/${checks.length} checks PASSED.`);
  await page.close();
} finally {
  await browser.close();
}

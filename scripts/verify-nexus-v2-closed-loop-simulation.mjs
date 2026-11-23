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
  // PART A: HQ 4-View All-Sites Sovereign Command
  // =========================================================================
  recordCheck(
    'Default view is HQ Sovereign Command (hq_command) with 4 view tabs',
    (await root.getAttribute('data-workspace-role')) === 'hq' &&
      (await root.locator('.nexus-view-tab').count()) === 4,
  );
  recordCheck('ORBIT 01 default 5 nodes', (await root.locator('.nexus-node').count()) === 5);

  // Seed 3-site simulation data from Global Context Rail
  await root.getByRole('button', { name: /체험 데이터 불러오기/ }).click();

  await root.getByRole('button', { name: /ORBIT 02/ }).click();
  recordCheck('ORBIT 02 6 core module nodes', (await root.locator('.nexus-node').count()) === 6);

  // Switch to ORBIT 03 (10 structural/substructure RC nodes) & verify 3-axis filter bar shows & locks node
  await root.getByRole('button', { name: /ORBIT 03/ }).click();
  recordCheck('ORBIT 03 10 structural/substructure RC nodes', (await root.locator('.nexus-node').count()) === 10);
  await root.locator('.nexus-node.node-4').click();
  await root.getByRole('combobox', { name: '3축 구간 분류' }).selectOption('substructure_rc');
  recordCheck(
    '3-axis filter auto-locks sphere onto Node 01 (Substructure RC)',
    (await root.locator('.nexus-node.node-0').getAttribute('aria-pressed')) === 'true',
  );
  await root.getByRole('button', { name: '3축 필터 초기화' }).click();
  await root.locator('.nexus-header').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(outDir, 'nexus-v2-hero-1440.png'), fullPage: false });

  // View ②: HQ Executive Briefing BI (Portfolio Matrix + Bento Board + Heatmap Cross-Lock)
  await root.getByRole('tab', { name: '② 경영 브리핑 BI' }).click();
  const biView = root.locator('.nexus-hq-bi-view');
  await biView.waitFor({ state: 'visible', timeout: 10000 });
  recordCheck(
    'HQ BI View shows 3-Site Portfolio Comparison Matrix (3 sites)',
    (await biView.locator('.nexus-site-matrix-card').count()) === 3,
  );
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
  recordCheck(
    'HQ BI View displays 5-stage conversion funnel',
    (await biView.locator('.nexus-funnel-stage').count()) === 5,
  );
  await biView.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(outDir, 'nexus-v2-hq-bi-1440.png'), fullPage: false });

  // Clicking Heatmap Cell in BI View should organically lock 3D sphere and jump back to ① 3D 전사 지휘
  await biView.getByRole('gridcell').first().click();
  recordCheck(
    'Heatmap cell click organically switches to ① 3D 전사 지휘 with locked node',
    (await root.getByRole('tab', { name: '① 3D 전사 지휘' }).getAttribute('aria-selected')) === 'true' &&
      (await root.locator('.nexus-node.selected').count()) === 1,
  );

  // View ③: HQ Approvals, Heavy Equipment CEO Pack, Visits & 12-Language Training
  await root.getByRole('tab', { name: '③ 본사 결재·보고·순회' }).click();
  await root.locator('.nexus-workbench').waitFor({ state: 'visible', timeout: 10000 });
  recordCheck('HQ Ops Studio displays 5 HQ tabs', (await root.locator('.nexus-workbench-tab').count()) === 5);
  recordCheck(
    'HQ Equipment tab keeps substitute upload form inside collapsible details',
    (await root.locator('.nexus-equip-studio .nexus-collapsible-form').count()) === 1,
  );
  await root.getByLabel('건설기계 사진 본사 검토자').fill('본사 안전보건실 박실장');
  await root.getByRole('button', { name: /본사 적합 검토 \(경영진 보고 편입\)/ }).first().click();
  await root.getByRole('button', { name: /선별 사진 대표이사·경영진 1장 보고서 발행/ }).click();
  recordCheck(
    'HQ verification compiles CEO 1-page briefing sheet and marks photos reported_to_ceo',
    (await root.locator('.nexus-ceo-briefing-sheet').count()) === 1 &&
      (await root.locator('.nexus-equip-photo-card[data-status="reported_to_ceo"]').count()) >= 1,
  );
  await root.locator('.nexus-workbench').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(outDir, 'nexus-v2-hq-ops-1440.png'), fullPage: false });

  // HQ 05 Investigation approval promotes to 02 Incident DB & 04 Training
  await root.getByRole('tab', { name: /05 · 02 사고조사 승인·보완/ }).click();
  recordCheck(
    'HQ Investigation tab keeps draft form collapsed',
    (await root.locator('.nexus-ai-investigation-studio .nexus-collapsible-form').count()) === 1,
  );
  await root.getByRole('button', { name: /본사 최종 승인 · 02 사고사례 DB 편입 및 04 대표이사 12개국어 교육 자동 발령/ }).first().click();
  recordCheck(
    'HQ approves Site 2 AI investigation and promotes to Incident DB & Training',
    (await root.getByText(/\[본사 승인 완료\]/).count()) === 1,
  );

  // HQ 01 Pre-Visit Registration & Directive
  await root.getByRole('tab', { name: /01 본사 행선지 · 순회점검/ }).click();
  await root.getByLabel('순회점검 대상 현장명').fill('제1현장 지하 2층 RC외벽');
  await root.getByLabel('순회점검 방문 목적').fill('지하 외벽 합벽 거푸집 측압·개구부 방호 확인');
  await root.getByRole('button', { name: /01 행선지·사전브리핑 등록 및 구체 포인트 록온/ }).click();
  recordCheck(
    'HQ pre-visit briefing registered',
    (await root.getByText(/방문 일정과 사전 위험 브리핑/).count()) >= 1,
  );

  // View ④: HQ Raw Audit View
  await root.getByRole('tab', { name: '④ 원천 이력·감사' }).click();
  recordCheck(
    'HQ Audit View renders #nexus-followup-details cleanly',
    await root.locator('#nexus-followup-details').isVisible(),
  );

  // =========================================================================
  // PART B: Field Safety Manager Single-Site Isolation (SITE-01-SUBRC ONLY)
  // =========================================================================
  await root.getByRole('button', { name: /현장 안전관리자 \(단일 현장 격리\)/ }).click();
  recordCheck(
    'Field mode active with 3 isolated view tabs and shield badge',
    (await root.getAttribute('data-workspace-role')) === 'field' &&
      (await root.locator('.nexus-view-tab').count()) === 3 &&
      (await root.locator('.nexus-field-lock-badge').getByText(/단일 현장 격리/).count()) === 1,
  );
  recordCheck(
    'Field mode completely hides HQ Matrix, Bento BI, and BI tab',
    (await root.locator('.nexus-site-matrix-card').count()) === 0 &&
      (await root.locator('.nexus-bento-board').count()) === 0 &&
      (await root.getByRole('tab', { name: '② 경영 브리핑 BI' }).count()) === 0,
  );

  const site1CaseListText = await root.locator('.nexus-3axis-case-list').innerText();
  recordCheck(
    'Site 1 Field 30s Inspection list contains ZERO Site 2 or Site 3 records',
    !site1CaseListText.includes('제2현장') && !site1CaseListText.includes('제3현장'),
    { sample: site1CaseListText.slice(0, 160) },
  );

  // Field 30s Inspection w/ Stop-Work + Handover 5-line copy + Evidence Closure
  await root.getByRole('button', { name: /#01 지하RC/ }).click();
  await root.locator('.nexus-stopwork-toggle input[type="checkbox"]').check();
  await root.getByRole('button', { name: /30초 조치·재점검·인계 등록 및 구체 환류/ }).click();
  recordCheck(
    'Field registers Stop-Work action locked to Site 1 without cross-site leak',
    (await root.locator('.nexus-stopwork-badge').count()) >= 1,
  );
  await root.getByRole('button', { name: /교대 인계서 5줄 복사/ }).click();
  recordCheck(
    'Field generates 5-line shift handover briefing text',
    (await root.locator('.nexus-handover-preview').count()) === 1,
  );
  await root.getByLabel('조치·재점검 증빙 메모 RC-SUB-01').first().fill('타이볼트 재체결 및 개구부 덮개 볼트 고정 완료');
  await root.getByRole('button', { name: '현장 재점검 확인 · 종결' }).first().click();
  await root.locator('.nexus-workbench').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(outDir, 'nexus-v2-field-ops-1440.png'), fullPage: false });

  // Field Equipment Photo Upload tab: Locked site pill, NO HQ approval/CEO buttons, ZERO Site 2/3 photos
  await root.getByRole('tab', { name: /건설기계 사용전 사진 본사 전송/ }).click();
  recordCheck(
    'Field Equipment tab locks site (no site select dropdown) and removes HQ CEO/approve controls',
    (await root.getByRole('combobox', { name: '건설기계 점검 현장 선택' }).count()) === 0 &&
      (await root.locator('.nexus-field-locked-site-pill').count()) === 1 &&
      (await root.getByRole('button', { name: /본사 적합 검토/ }).count()) === 0 &&
      (await root.getByRole('button', { name: /대표이사·경영진 1장 보고서 발행/ }).count()) === 0,
  );
  const site1EquipText = await root.locator('.nexus-equip-photo-grid').innerText();
  recordCheck(
    'Field Equipment gallery shows ONLY Site 1 photos (zero Site 2 / Site 3)',
    !site1EquipText.includes('제2현장') && !site1EquipText.includes('제3현장'),
  );
  await root.getByLabel('건설기계 종류 선택').selectOption('concrete_pump_car');
  await root.getByLabel('건설기계 작업 내용').fill('지하 2층 추가 타설 펌프카 아웃트리거 점검');
  await root.getByLabel('건설기계 사진 업로더').fill('제1현장 안전관리자 김안전');
  await root.getByRole('button', { name: /건설기계 사용전 점검 사진 본사 전송/ }).click();
  recordCheck(
    'Field Equipment photo submitted cleanly for Site 1',
    (await root.locator('.nexus-equip-photo-card[data-status="submitted_to_hq"]').count()) >= 1,
  );

  // View ② in Field: 본사 수신·교육·상신 (12-lang signing, Field revision resubmit w/ NO HQ approve, Read-only Visits)
  await root.getByRole('tab', { name: '② 본사 수신·교육·상신' }).click();
  const langPills = root.getByRole('group', { name: '12개 국어 모국어 미리보기 선택' }).locator('button');
  recordCheck('Field Training tab displays all 12 language pills', (await langPills.count()) === 12);
  await langPills.nth(1).click();
  await root.getByRole('button', { name: '전원 서명·이수 100% 완료 확인' }).first().click();

  await root.getByRole('tab', { name: /05 아차사고 상신 · 보완 재상신/ }).click();
  const fieldInvText = await root.locator('.nexus-3axis-case-list').innerText();
  recordCheck(
    'Field Investigation tab isolates Site 1 only and removes HQ approve/revision buttons',
    !fieldInvText.includes('제2현장') &&
      !fieldInvText.includes('제3현장') &&
      (await root.getByRole('button', { name: /본사 최종 승인/ }).count()) === 0 &&
      (await root.getByRole('button', { name: /본사 보완 요청/ }).count()) === 0,
  );
  await root.getByLabel('현장 보완 내역 입력 RC-SUB-01').first().fill('타설 속도 1.8m/hr 제한 및 변위 감시자 2인 배치 보강');
  await root.getByRole('button', { name: /현장 보완 완료 · 본사 재승인 요청/ }).first().click();
  recordCheck(
    'Field successfully resubmits Site 1 revision-requested investigation',
    (await root.getByText(/\[현장 보완 완료 · 본사 재상신\]/).count()) === 1,
  );

  await root.getByRole('tab', { name: /01 본사 순회점검 지시 수신/ }).click();
  const fieldVisitText = await root.locator('.nexus-3axis-case-list').innerText();
  recordCheck(
    'Field Visit tab shows Site 1 directives read-only with ZERO Site 3 visits or HQ authoring controls',
    !fieldVisitText.includes('제3현장') &&
      (await root.getByRole('button', { name: /01 행선지·사전브리핑 등록/ }).count()) === 0,
  );

  // View ③ in Field: 내 현장 3D 구체
  await root.getByRole('tab', { name: '③ 내 현장 3D 구체' }).click();
  recordCheck(
    'Field 3D Sphere View active with node indicators',
    (await root.locator('.nexus-node').count()) >= 5,
  );

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

    // Check Field views first
    for (const fView of ['① 현장 즉시 실행', '② 본사 수신·교육·상신', '③ 내 현장 3D 구체']) {
      await root.getByRole('tab', { name: fView }).click();
      const dim = await root.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
      recordCheck(`${vp.width}px Field ${fView} zero horizontal overflow`, dim.scroll <= dim.client + 2, dim);
    }
    if (vp.width === 390) {
      await root.getByRole('tab', { name: '③ 내 현장 3D 구체' }).click();
      const psiBox = await root.locator('.nexus-core-label strong').boundingBox();
      const activeNodeBox = await root.locator('.nexus-node.selected').boundingBox();
      const overlapsPsi390 = Boolean(
        psiBox &&
          activeNodeBox &&
          activeNodeBox.x < psiBox.x + psiBox.width &&
          activeNodeBox.x + activeNodeBox.width > psiBox.x &&
          activeNodeBox.y < psiBox.y + psiBox.height &&
          activeNodeBox.y + activeNodeBox.height > psiBox.y,
      );
      recordCheck('390px selected node pill never overlaps central PSI emblem', !overlapsPsi390, { psiBox, activeNodeBox });
      await root.getByRole('tab', { name: '① 현장 즉시 실행' }).click();
      const tabBox = await root.locator('.nexus-workbench-tab').first().boundingBox();
      recordCheck('390px field workbench tab touch height >= 44px', Boolean(tabBox && tabBox.height >= 44), tabBox);
      await root.locator('.nexus-header').scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await page.screenshot({ path: resolve(outDir, 'nexus-v2-field-mobile-390.png'), fullPage: true });
    }

    // Switch back to HQ and verify HQ views have zero horizontal overflow
    await root.getByRole('button', { name: /본사 통합 관제 \(전사\)/ }).click();
    for (const hView of ['① 3D 전사 지휘', '② 경영 브리핑 BI', '③ 본사 결재·보고·순회']) {
      await root.getByRole('tab', { name: hView }).click();
      const dim = await root.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
      recordCheck(`${vp.width}px HQ ${hView} zero horizontal overflow`, dim.scroll <= dim.client + 2, dim);
    }
    if (vp.width === 1440) {
      await root.getByRole('tab', { name: '① 3D 전사 지휘' }).click();
      const psiBox = await root.locator('.nexus-core-label strong').boundingBox();
      const activeNodeBox = await root.locator('.nexus-node.selected').boundingBox();
      const overlapsPsi1440 = Boolean(
        psiBox &&
          activeNodeBox &&
          activeNodeBox.x < psiBox.x + psiBox.width &&
          activeNodeBox.x + activeNodeBox.width > psiBox.x &&
          activeNodeBox.y < psiBox.y + psiBox.height &&
          activeNodeBox.y + activeNodeBox.height > psiBox.y,
      );
      recordCheck('1440px selected node pill never overlaps central PSI emblem', !overlapsPsi1440, { psiBox, activeNodeBox });
    }

    // Return to Field mode for next viewport iteration
    await root.getByRole('button', { name: /현장 안전관리자 \(단일 현장 격리\)/ }).click();
  }

  // Switch back to HQ and verify Phase 2 Dashboard Bridge on PrecisionOperationsBoard
  await root.getByRole('button', { name: /본사 통합 관제 \(전사\)/ }).click();
  await root.getByRole('button', { name: /관제센터로 돌아가기/ }).click();
  const dashboardBridge = page.locator('[aria-label="안전지능 네트워크 본사·현장 폐루프 요약 연동"]');
  await dashboardBridge.waitFor({ state: 'visible', timeout: 10000 });
  const kpiGridCount = await page.locator('.psi-ops-kpi-grid').count();
  const equipCardCount = await dashboardBridge.getByText('건설기계 사용전 사진', { exact: true }).count();
  recordCheck(
    'Phase 2 Dashboard Sovereign Nexus Bridge visible alongside .psi-ops-kpi-grid',
    kpiGridCount >= 1 && equipCardCount === 1,
    { kpiGridCount, equipCardCount },
  );

  recordCheck('Zero runtime page errors during full simulation', pageErrors.length === 0, pageErrors);
  await writeFile(
    resolve(outDir, 'simulation-report.json'),
    JSON.stringify({ pass: true, totalChecks: checks.length, checks }, null, 2) + '\n',
  );
  console.log(`[SAFETY NEXUS v2.0 HQ/Field Separated Simulation] ${checks.length}/${checks.length} checks PASSED.`);
  await page.close();
} finally {
  await browser.close();
}

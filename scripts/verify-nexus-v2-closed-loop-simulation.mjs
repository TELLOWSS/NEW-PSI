import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
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
  // 1. Desktop Full Closed-Loop Simulation (1440x960)
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

  // Orbit Layer Switching (5 -> 6 -> 10 nodes) & Sphere Workbench Synchronization
  recordCheck('ORBIT 01 default 5 nodes', (await root.locator('.nexus-node').count()) === 5);

  await root.getByRole('button', { name: /ORBIT 02/ }).click();
  recordCheck('ORBIT 02 6 core module nodes', (await root.locator('.nexus-node').count()) === 6);

  // Clicking node 01 (행선지·현장점검) in ORBIT 02 should sync workbench tab to visit_01
  await root.locator('.nexus-node.node-0').click();
  recordCheck(
    'ORBIT 02 node 01 syncs workbench to 01 visit tab',
    (await root.getByRole('tab', { name: /01 본사 행선지/ }).getAttribute('aria-selected')) === 'true',
  );

  // Slice 4A: HQ CSO Persona — Switch to HQ CSO role mode, verify 3-site matrix, register Visit Plan, start field inspection, and issue directive
  await root.getByRole('button', { name: /본사 CSO · 순회점검 입장/ }).click();
  recordCheck(
    'HQ CSO role perspective digest active',
    (await root.locator('.nexus-role-digest').getByText(/본사 CSO · 순회점검 지휘 시점/).count()) === 1,
  );
  recordCheck(
    '3-Site Portfolio Comparison Matrix renders 3 sites',
    (await root.locator('.nexus-site-matrix-card').count()) === 3,
  );
  await root.getByRole('tab', { name: /01 본사 행선지/ }).click();
  await root.getByLabel('순회점검 대상 현장명').fill('제1현장 지하 2층 RC외벽');
  await root.getByLabel('순회점검 방문 목적').fill('지하 외벽 합벽 거푸집 측압·개구부 방호 확인');
  await root.getByRole('button', { name: /01 행선지·사전브리핑 등록 및 구체 포인트 록온/ }).click();
  recordCheck(
    'Slice 4A pre-visit briefing registered',
    (await root.getByText(/사전 위험 브리핑.*등록되었습니다/).count()) === 1,
  );
  await root.getByRole('button', { name: '현장 도착 · 순회점검 개시' }).first().click();
  recordCheck(
    'Slice 4A HQ field inspection started',
    (await root.getByText(/현장 순회점검이 개시되었습니다/).count()) === 1,
  );
  await root.getByRole('button', { name: /현장 점검 완료 · 즉시 시정조치·인계 발령/ }).first().click();
  recordCheck(
    'Slice 4A visit action issued into Slice 2 pipeline',
    (await root.getByText(/06 조치·재점검·인계 파이프라인으로 즉시 환류/).count()) === 1,
  );

  // Switch to ORBIT 03 (10 structural/substructure RC nodes) & test 3-Axis Filter Auto-Lock
  await root.getByRole('button', { name: /ORBIT 03/ }).click();
  recordCheck('ORBIT 03 10 structural/substructure RC nodes', (await root.locator('.nexus-node').count()) === 10);
  await root.locator('.nexus-node.node-4').click(); // Select node 05 (철근배근)
  recordCheck('Node 05 selected initially', (await root.locator('.nexus-node.node-4').getAttribute('aria-pressed')) === 'true');
  // Apply 3-axis filter for Substructure RC -> should auto-lock onto Node 01 (지하 RC구조물)
  await root.getByRole('combobox', { name: '3축 구간 분류' }).selectOption('substructure_rc');
  recordCheck(
    '3-axis filter auto-locks sphere onto Node 01 (Substructure RC)',
    (await root.locator('.nexus-node.node-0').getAttribute('aria-pressed')) === 'true',
  );
  await root.getByRole('button', { name: '3축 필터 초기화' }).click();

  // Verify Sovereign Executive Bento Dashboard (4 KPIs, 4x5 Heatmap click-to-lock, Recharts ComposedChart, 5-stage Funnel)
  const bento = root.locator('.nexus-bento-board');
  await bento.waitFor({ state: 'visible', timeout: 10000 });
  recordCheck(
    'Executive Bento Board displays 4 KPI cards',
    (await bento.getByRole('group', { name: '핵심 성과 지표 4종' }).locator('.nexus-bento-card').count()) === 4,
  );
  recordCheck(
    'Executive Bento Board displays 20 conditional heatmap cells (4x5)',
    (await bento.getByRole('gridcell').count()) === 20,
  );
  await bento.getByRole('gridcell').first().click();
  recordCheck(
    'Clicking Bento heatmap cell locks onto matching 3D sphere node',
    (await root.locator('.nexus-node.selected').count()) === 1,
  );
  recordCheck(
    'Executive Bento Recharts ComposedChart SVG rendered',
    (await bento.locator('.nexus-bento-chart-box svg').count()) >= 1,
  );
  recordCheck(
    'Executive Bento displays 5-stage closed-loop conversion funnel',
    (await bento.locator('.nexus-funnel-stage').count()) === 5,
  );

  // Slice 2: Field Safety Manager Persona — Switch to Field Manager mode, toggle stop-work, use 1-second preset, record evidence & progress lifecycle
  await root.getByRole('button', { name: /현장 안전관리자 실행 입장/ }).click();
  recordCheck(
    'Field Safety Manager role perspective digest active',
    (await root.locator('.nexus-role-digest').getByText(/현장 안전관리자 실행 시점/).count()) === 1,
  );
  await root.getByRole('button', { name: /#03 갱폼.*15F 외벽 갱폼 인양고리·앵커/ }).click();
  recordCheck(
    'Slice 2 1-second quick preset auto-matches GF-LIFT-03 seed for gangform observation',
    (await root.locator('.nexus-3axis-matched-case').getByText(/GF-LIFT-03/).count()) === 1,
  );
  await root.locator('.nexus-stopwork-toggle input[type="checkbox"]').check();
  await root.getByRole('button', { name: /30초 조치·재점검·인계 등록 및 구체 환류/ }).click();
  recordCheck(
    'Slice 2 case registered with stop-work badge and sphere locked onto node #03',
    (await root.locator('.nexus-node.node-2').getAttribute('aria-pressed')) === 'true' &&
      (await root.locator('.nexus-stopwork-badge').count()) >= 1,
  );
  await root.getByRole('button', { name: /교대 인계서 5줄 복사/ }).click();
  recordCheck(
    'Field Safety Manager 5-line shift handover summary preview rendered',
    (await root.locator('.nexus-handover-preview').count()) === 1,
  );
  await root.getByLabel('조치·재점검 증빙 메모 GF-LIFT-03').first().fill('인양고리 샤클 체결 및 무전 신호수 배치 완료');
  await root.getByRole('button', { name: '교대 인계 대기 전환' }).first().click();
  await root.getByRole('button', { name: '조치완료 · 재점검 요청' }).first().click();
  await root.getByRole('button', { name: '현장 재점검 확인 · 종결' }).first().click();
  recordCheck(
    'Slice 2 lifecycle progressed to closed with field evidence note and audit trail strip',
    (await root.locator('.nexus-3axis-case-list').getByText('재점검 확인 종결').count()) >= 1 &&
      (await root.locator('.nexus-audit-trail-strip').count()) >= 1,
  );

  // Heavy Equipment Pre-Use Photo Upload -> HQ Verification -> Executive/CEO Reporting Pack Workflow
  await root.getByRole('tab', { name: /건설기계 사용전 사진·경영진 보고/ }).click();
  await root.getByLabel('건설기계 종류 선택').selectOption('concrete_pump_car');
  await root.getByLabel('건설기계 작업 내용').fill('지하 2층 슬래브 콘크리트 타설 펌프카 아웃트리거 점검');
  await root.getByLabel('건설기계 사진 업로더').fill('현장 안전관리자 김현장');
  await root.getByRole('button', { name: /건설기계 사용전 점검 사진 본사 전송/ }).click();
  recordCheck(
    'Equipment photo uploaded by Field Manager as submitted_to_hq',
    (await root.locator('.nexus-equip-photo-card[data-status="submitted_to_hq"]').count()) >= 1,
  );
  await root.getByRole('button', { name: /본사 CSO · 순회점검 입장/ }).click();
  recordCheck(
    'HQ CSO mode tucks equipment upload form into collapsible details element',
    (await root.locator('.nexus-equip-studio .nexus-collapsible-form').count()) === 1,
  );
  await root.getByLabel('건설기계 사진 본사 검토자').fill('본사 안전보건실 박실장');
  await root.getByRole('button', { name: /본사 적합 검토 \(경영진 보고 편입\)/ }).first().click();
  await root.getByRole('button', { name: /선별 사진 대표이사·경영진 1장 보고서 발행/ }).click();
  recordCheck(
    'HQ verification compiles CEO briefing sheet and marks photos reported_to_ceo',
    (await root.locator('.nexus-ceo-briefing-sheet').count()) === 1 &&
      (await root.locator('.nexus-equip-photo-card[data-status="reported_to_ceo"]').count()) >= 1,
  );
  // Restore Field Manager mode for Step 4B investigation creation & Bento inspection
  await root.getByRole('button', { name: /현장 안전관리자 실행 입장/ }).click();

  // Slice 4B: 05 AI Root-Cause Investigation -> 4-stage timeline -> HQ Revision Request -> Field Supplement Resubmission -> HQ Approval
  await root.getByRole('tab', { name: /05 · 02 AI 사고조사 · 본사 승인/ }).click();
  recordCheck(
    'Slice 4B 4-stage AI timeline strip rendered',
    (await root.locator('.nexus-inv-timeline-step').count()) === 4,
  );
  await root.getByLabel('사고조사 현장명').fill('제1현장 지하 2층 북측 외벽');
  await root.getByLabel('사고조사 경위 원문').fill('지하 2층 외벽 합벽 거푸집 타이볼트 간격 미흡 배부름 및 피트 개구부 덮개 미고정 아차사고');
  await root.getByRole('button', { name: /05 AI 사고조사 초안 등록/ }).click();
  recordCheck(
    'Slice 4B AI investigation 6W & 3-tier root cause draft created',
    (await root.getByText(/6하원칙·시계열·3단계 원인\(직접\/기여\/근본\) 구조화가 완료/).count()) === 1,
  );
  await root.getByRole('button', { name: '본사 보완 요청 (현장 재조사 지시)' }).first().click();
  recordCheck(
    'Slice 4B HQ requests revision on field investigation draft',
    (await root.getByText(/\[본사 보완 요청 발령\]/).count()) === 1,
  );
  await root.getByLabel('현장 보완 내역 입력 RC-SUB-01').first().fill('타이볼트 간격 구조검토서 실측 대조 및 개구부 잠금 볼트 체결 절차 보강');
  await root.getByRole('button', { name: /현장 보완 완료 · 본사 재승인 요청/ }).first().click();
  recordCheck(
    'Slice 4B Field Safety Manager resubmits supplemented investigation to HQ',
    (await root.getByText(/\[현장 보완 완료 · 본사 재상신\]/).count()) === 1,
  );
  await root.getByRole('button', { name: /본사 최종 승인 · 02 사고사례 DB 편입 및 04 대표이사 12개국어 교육 자동 발령/ }).first().click();
  recordCheck(
    'Slice 4B HQ approval promotes case to 02 Incident DB and 04 12-Language Training',
    (await root.getByText(/\[본사 승인 완료\] 사례코드 \[HQ-RC-SUB-01-01\]/).count()) === 1,
  );

  // Slice 3: 04 Executive 12-Language Training & Completion Rate Feedback
  await root.getByRole('tab', { name: /04 대표이사 다국어 안전교육/ }).click();
  const langPills = root.getByRole('group', { name: '12개 국어 모국어 미리보기 선택' }).locator('button');
  recordCheck('Slice 3 displays all 12 language pills', (await langPills.count()) === 12);
  await langPills.nth(2).click(); // 중국어
  await root.getByRole('button', { name: '전원 서명·이수 100% 완료 확인' }).first().click();
  recordCheck(
    'Slice 3 100% signature completion rate feeds back to 3D sphere HUD',
    (await root.locator('.nexus-detail-signals').getByText('이수 100%').count()) === 1,
  );

  // Multi-Viewport Responsive & Touch UX Simulation (360, 390, 768, 1366, 1440, 1920)
  for (const vp of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1366, height: 900 },
    { width: 1440, height: 960 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(vp);
    for (const tabName of [
      /30초 사진점검 · 3축분류 · 조치·인계/,
      /건설기계 사용전 사진·경영진 보고/,
      /04 대표이사 다국어 안전교육/,
      /01 본사 행선지 · 순회점검/,
      /05 · 02 AI 사고조사 · 본사 승인/,
    ]) {
      await root.getByRole('tab', { name: tabName }).click();
      const dim = await root.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
      recordCheck(`${vp.width}px no horizontal overflow on tab ${tabName}`, dim.scroll <= dim.client + 2, dim);
    }
    if (vp.width === 390) {
      const tabBox = await root.getByRole('tab', { name: /04 대표이사 다국어 안전교육/ }).boundingBox();
      recordCheck('390px mobile workbench tab touch target height >= 48px', Boolean(tabBox && tabBox.height >= 48), tabBox);
      // Verify active node button does NOT overlap the central PSI emblem wordmark
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
      await root.locator('.nexus-header').scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(outDir, 'nexus-v2-hero-390.png'), fullPage: false });
      await page.screenshot({ path: resolve(outDir, 'nexus-v2-mobile-390.png'), fullPage: true });
    }
    if (vp.width === 1440) {
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
      await root.locator('.nexus-bento-board').scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(outDir, 'nexus-v2-bento-1440.png'), fullPage: false });
      await root.locator('.nexus-header').scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.screenshot({ path: resolve(outDir, 'nexus-v2-hero-1440.png'), fullPage: false });
      await page.screenshot({ path: resolve(outDir, 'nexus-v2-desktop-1440.png'), fullPage: true });
    }
  }

  // Verify Phase 2 Dashboard Bridge on PrecisionOperationsBoard
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
  console.log(`[SAFETY NEXUS v2.0 Closed-Loop PC/Mobile Simulation] ${checks.length}/${checks.length} checks PASSED.`);
  await page.close();
} finally {
  await browser.close();
}

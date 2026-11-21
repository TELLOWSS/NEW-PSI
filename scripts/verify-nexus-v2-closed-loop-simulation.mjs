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

  // Slice 4A: Register HQ Visit Plan & Pre-Visit Briefing
  await root.getByLabel('순회점검 대상 현장명').fill('제1현장 지하 2층 RC외벽');
  await root.getByLabel('순회점검 방문 목적').fill('지하 외벽 합벽 거푸집 측압·개구부 방호 확인');
  await root.getByRole('button', { name: /01 행선지·사전브리핑 등록 및 구체 포인트 록온/ }).click();
  recordCheck(
    'Slice 4A pre-visit briefing registered',
    (await root.getByText(/사전 위험 브리핑.*등록되었습니다/).count()) === 1,
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

  // Slice 2: 30s Photo Inspection -> 3-Axis Auto-Classification -> Action/Recheck/Handover progression
  await root.getByRole('tab', { name: /30초 사진점검 · 3축분류 · 조치·인계/ }).click();
  await root.getByPlaceholder(/예: 지하 2층 외벽 거푸집 타이볼트/).fill('103동 15층 외벽 갱폼 인양고리 및 앵커볼트 점검');
  recordCheck(
    'Slice 2 auto-matches GF-LIFT-03 seed for gangform observation',
    (await root.locator('.nexus-3axis-matched-case').getByText(/GF-LIFT-03/).count()) === 1,
  );
  await root.getByRole('button', { name: /30초 조치·재점검·인계 등록 및 구체 환류/ }).click();
  recordCheck(
    'Slice 2 case registered and sphere locked onto node #03',
    (await root.locator('.nexus-node.node-2').getAttribute('aria-pressed')) === 'true',
  );
  await root.getByRole('button', { name: '교대 인계 대기 전환' }).first().click();
  await root.getByRole('button', { name: '조치완료 · 재점검 요청' }).first().click();
  await root.getByRole('button', { name: '현장 재점검 확인 · 종결' }).first().click();
  recordCheck(
    'Slice 2 lifecycle progressed to closed',
    (await root.locator('.nexus-3axis-case-list').getByText('재점검 확인 종결').count()) >= 1,
  );

  // Slice 4B: 05 AI Root-Cause Investigation -> HQ Approval -> 02 Incident DB & 04 Training Auto-Propagation
  await root.getByRole('tab', { name: /05 · 02 AI 사고조사 · 본사 승인/ }).click();
  await root.getByLabel('사고조사 현장명').fill('제1현장 지하 2층 북측 외벽');
  await root.getByLabel('사고조사 경위 원문').fill('지하 2층 외벽 합벽 거푸집 타이볼트 간격 미흡 배부름 및 피트 개구부 덮개 미고정 아차사고');
  await root.getByRole('button', { name: /05 AI 사고조사 초안 등록/ }).click();
  recordCheck(
    'Slice 4B AI investigation 6W & 3-tier root cause draft created',
    (await root.getByText(/6하원칙·시계열·3단계 원인\(직접\/기여\/근본\) 구조화가 완료/).count()) === 1,
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
      await page.screenshot({ path: resolve(outDir, 'nexus-v2-mobile-390.png'), fullPage: true });
    }
    if (vp.width === 1440) {
      await page.screenshot({ path: resolve(outDir, 'nexus-v2-desktop-1440.png'), fullPage: true });
    }
  }

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

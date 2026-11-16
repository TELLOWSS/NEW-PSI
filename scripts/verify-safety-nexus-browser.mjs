import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
  // For cinematic acceptance, browser QA itself MUST actually execute the GPU
  // shader. Fallback usability is verified independently below.
  check('시네마틱 GPU 셰이더 실제 가동',renderer==='webgl',
    {renderer,reason:'2D fallback cannot certify native GPU lighting or camera art'});
  check('후속조치 이력 카드 6종 구분', await root.locator('.nexus-followup-card').count() === 6, 'unresolved, overdue, interim, planned, reopened, evidence verified');
  check('현장 실천·재점검 5종 분리', await root.locator('.nexus-recheck-card').count() === 5,
    'education delivered, observed, rechecked, needs recheck, overdue recheck');
  check('교육과 조치완료 자동판정 분리', await root.locator('.nexus-practice').getByText(/안전행동이 관찰되었더라도 조치 완료/).count() === 1,
    'no automatic action closure on education or observation');
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
  check('모션 중지 시 연결선도 정지', await root.locator('.nexus-focus-link path').evaluate(el => getComputedStyle(el).animationPlayState) === 'paused', 'CSS motion paused');

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
  const cinemaControl=root.getByRole('button',{name:'12초 시네마틱 보기'});
  check('12초 시네마틱 명시적 재생 버튼',await cinemaControl.isVisible(), 'opt-in; no autoplay lockout');
  await cinemaControl.click();
  check('12초 연출이 사용자 클릭으로 시작',await root.locator('.nexus-stage').getAttribute('data-cinematic')==='playing','explicit playback');
  const cinematicFrames=[];
  const saveStoryFrame=async(time)=>{
    const shot=await root.locator('.nexus-stage').screenshot();
    const digest=createHash('sha256').update(shot).digest('hex').slice(0,16);
    cinematicFrames.push({second:time,sha256Prefix:digest});
    await writeFile(resolve(output,'nexus-cinema-'+String(time).padStart(2,'0')+'s.png'),shot);
  };
  await saveStoryFrame(0);
  await page.waitForTimeout(3000);
  await saveStoryFrame(3);
  await page.waitForTimeout(3000);
  await saveStoryFrame(6);
  await page.waitForTimeout(4000);
  await saveStoryFrame(10);
  check('10초 이상 연속 재생에서 서로 다른 광원·궤도 프레임',new Set(cinematicFrames.map(x=>x.sha256Prefix)).size>=3,cinematicFrames);
  check('시연 연출이 실제 위험 예측으로 오인되지 않음',
    await root.getByText('그래픽 시연 / 실시간 위험 경보 아님').count()===1, 'design-only visual cue');
  await page.waitForTimeout(2400);
  check('12초 종료 후 일반 조작 복귀',
    await root.locator('.nexus-stage').getAttribute('data-cinematic')==='idle',
    'no mandatory waiting or forced navigation');
  await page.keyboard.press('Escape');
  check('Escape로 몰입 보기 종료', await root.evaluate(el => !el.classList.contains('is-immersive')), 'safe return to shell');

  // In-app reduced motion must work even when OS preference is "no-preference".
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.nexus-footer input[type="checkbox"]').check();
  check('움직임 축소 옵션', await root.locator('.nexus-footer input[type="checkbox"]').isChecked(), 'reduced motion');
  const stoppedEffect = await root.locator('.nexus-focus-link path').evaluate(el => getComputedStyle(el).animationName);
  check('앱 설정으로 CSS 궤도 움직임까지 중단', stoppedEffect === 'none', { animationName: stoppedEffect });
  check('모션 축소에서는 12초 시네마틱 재생 차단',
    await root.getByRole('button',{name:'12초 시네마틱 보기'}).isDisabled(),
    'reduced-motion accessibility gate');

  // Record a genuine continuous 12-second Chromium clip for HUMAN motion review.
  // Time-sampled PNGs verify change, but they cannot prove smooth movement.
  const movieContext = await browser.newContext({
    viewport:{width:1440,height:960},deviceScaleFactor:1,
    recordVideo:{dir:output,size:{width:1440,height:960}}
  });
  const moviePage=await movieContext.newPage();
  await moviePage.addInitScript(()=>sessionStorage.setItem('isAdminAuthenticated','true'));
  await moviePage.route('**/api/admin/auth',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({ok:true,authenticated:true})
  }));
  let movie;
  try{
    await moviePage.goto(baseUrl,{waitUntil:'domcontentloaded'});
    await moviePage.getByRole('button',{name:'안전지능 네트워크 · 시제품'}).first().click();
    await moviePage.locator('.safety-nexus').waitFor({state:'visible',timeout:20000});
    await moviePage.getByRole('button',{name:/전체 화면 몰입 보기/}).click();
    await moviePage.getByRole('button',{name:'12초 시네마틱 보기'}).click();
    await moviePage.waitForTimeout(12400);
    movie=moviePage.video();
    check('연속 모션 비교용 브라우저 영상 캡처',Boolean(movie),'12+ seconds of synthetic Chromium animation');
  }finally{
    await moviePage.close();
    await movieContext.close();
  }
  if(movie){
    const moviePath=resolve(output,'nexus-cinematic-12s.webm');
    await movie.saveAs(moviePath);
    const movieSize=(await (await import('node:fs/promises')).stat(moviePath)).size;
    check('연속 시네마틱 영상 파일 무결성',movieSize>8192,{path:moviePath,bytes:movieSize});
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await root.getByRole('button', { name: /안전조치 현황 열기/ }).click();
  check('기존 업무 화면 이동', await page.locator('.safety-nexus').count() === 0, 'navigated Q4');
  check('런타임 스크립트 오류 없음', failures.length === 0, failures);


  // Force the real 3D renderer's getContext() call to fail. The 2D Canvas
  // fallback must be visible, interactive, and free of unexpected page errors.
  const fallbackPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const fallbackErrors = [];
  fallbackPage.on('pageerror', error => fallbackErrors.push(error.message));
  await fallbackPage.addInitScript(() => {
    sessionStorage.setItem('isAdminAuthenticated', 'true');
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) return null;
      return getContext.call(this, kind, ...args);
    };
  });
  await fallbackPage.route('**/api/admin/auth', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, authenticated: true }),
  }));
  try {
    await fallbackPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await fallbackPage.getByRole('button', { name: '안전지능 네트워크 · 시제품' }).first().click();
    const fallbackRoot = fallbackPage.locator('.safety-nexus');
    await fallbackRoot.waitFor({ state: 'visible', timeout: 20000 });
    // Enter through the visible real desktop menu, then verify the 390px viewport.
    // The mobile sidebar is collapsed by design and its button is not initially accessible.
    await fallbackPage.setViewportSize({ width: 390, height: 900 });
    await fallbackRoot.locator('canvas.nexus-core-canvas:not([data-renderer])').waitFor({ state: 'visible', timeout: 12000 });
    check('WebGL 비활성 기기에서 Canvas 2D로 자동 복귀',
      await fallbackRoot.locator('canvas.nexus-core-canvas:not([data-renderer])').count() === 1,
      'forced getContext(webgl) = null');
    await fallbackRoot.locator('.nexus-node.node-4').click();
    check('2D 대체 엔진에서 Q5 노드 탐색', await fallbackRoot.locator('.nexus-node.node-4').getAttribute('aria-pressed') === 'true',
      'Q5 selected without GPU');
    await fallbackPage.screenshot({ path: resolve(output, 'nexus-forced-canvas-fallback-390.png'), fullPage: true });
    check('GPU 없이 런타임 오류 없음', fallbackErrors.length === 0, fallbackErrors);
  } finally {
    await fallbackPage.close();
  }

  // An artificial context-loss event checks that the lifecycle handler fails
  // safely. This is *not* a replacement for physical GPU loss/restoration QA.
  const lossPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  lossPage.on('pageerror', error => fallbackErrors.push(error.message));
  await lossPage.addInitScript(() => sessionStorage.setItem('isAdminAuthenticated', 'true'));
  await lossPage.route('**/api/admin/auth', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, authenticated: true }),
  }));
  try {
    await lossPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await lossPage.getByRole('button', { name: '안전지능 네트워크 · 시제품' }).first().click();
    const lossRoot = lossPage.locator('.safety-nexus');
    await lossRoot.waitFor({ state: 'visible', timeout: 20000 });
    const isGpu = await lossRoot.locator('canvas[data-renderer="webgl"]').count() === 1;
    if (isGpu) {
      await lossRoot.locator('canvas[data-renderer="webgl"]').evaluate(canvas =>
        canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
      await lossRoot.locator('canvas.nexus-core-canvas:not([data-renderer])').waitFor({ state:'visible', timeout:12000 });
      check('WebGL 컨텍스트 손실 이벤트 후 2D 대체',
        await lossRoot.locator('canvas.nexus-core-canvas:not([data-renderer])').count() === 1,
        'synthetic context-loss event, not physical GPU test');
    } else {
      check('WebGL 불가 상태에서도 2D 대체 유지',
        await lossRoot.locator('canvas.nexus-core-canvas:not([data-renderer])').count() === 1,
        'device has no WebGL');
    }
    check('GPU 손실 경로에서 스크립트 오류 없음', fallbackErrors.length === 0, fallbackErrors);
  } finally {
    await lossPage.close();
  }

  // Dedicated 390px touch/mobile Chromium context, not a desktop context resized
  // after the GPU has already allocated desktop particle counts.
  // These are *emulation indicators*, not an Android/iPhone hardware FPS claim.
  const mobilePage=await browser.newPage({
    viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true
  });
  const mobileErrors=[];
  mobilePage.on('pageerror',err=>mobileErrors.push(err.message));
  await mobilePage.addInitScript(()=>sessionStorage.setItem('isAdminAuthenticated','true'));
  await mobilePage.route('**/api/admin/auth',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({ok:true,authenticated:true})
  }));
  try{
    await mobilePage.goto(baseUrl,{waitUntil:'domcontentloaded'});
    await mobilePage.getByRole('navigation',{name:'모바일 하단 탐색'})
      .getByRole('button',{name:/더보기/}).click();
    await mobilePage.getByRole('dialog',{name:'전체 메뉴'})
      .getByRole('button',{name:'안전지능 네트워크 · 시제품'}).click();
    const mobileRoot=mobilePage.locator('.safety-nexus');
    await mobileRoot.waitFor({state:'visible',timeout:20000});
    const mobileCanvas=mobileRoot.locator('canvas.nexus-core-canvas');
    await mobileCanvas.waitFor({state:'visible',timeout:12000});
    check('실제 모바일 미디어쿼리에서 WebGL 캔버스 생성',
      await mobileCanvas.getAttribute('data-renderer')==='webgl',
      {viewport:'390x844',dpr:2,isMobile:true,hasTouch:true});
    const lod=await mobileCanvas.getAttribute('data-lod');
    check('모바일 GPU 입자 LOD 자동 선택', ['mobile-standard','mobile-conservative'].includes(lod),
      {lod,source:'hardware hint only; not a physical device benchmark'});
    const initialMotion=await mobileRoot.getByRole('button',{name:'모션 재생'}).count();
    check('모바일은 모션 정지로 안전하게 시작',initialMotion===1,
      {pausedOnMobile:true});
    await mobileRoot.getByRole('button',{name:'12초 시네마틱 보기'}).click();
    const telemetry=await mobilePage.evaluate(async()=>{
      const intervals=[];
      let last=0;
      const started=performance.now();
      await new Promise(resolve=>{
        const onFrame=(now)=>{
          if(last>0)intervals.push(now-last);
          last=now;
          if(now-started<3200)requestAnimationFrame(onFrame);
          else resolve(null);
        };
        requestAnimationFrame(onFrame);
      });
      intervals.sort((a,b)=>a-b);
      return {
        metric:'browser requestAnimationFrame cadence (not native GPU FPS)',
        samples:intervals.length,
        p50Ms:intervals[Math.floor(intervals.length*.5)]||0,
        p95Ms:intervals[Math.floor(intervals.length*.95)]||0,
        p99Ms:intervals[Math.floor(intervals.length*.99)]||0,
      };
    });
    await writeFile(resolve(output,'nexus-mobile-emulation.json'),
      JSON.stringify({emulation:{viewport:'390x844',deviceScaleFactor:2,isMobile:true,hasTouch:true},
        renderer:await mobileCanvas.getAttribute('data-renderer'),
        lod,telemetry,realDeviceValidated:false},null,2)+'\n');
    check('모바일 브라우저 애니메이션 프레임 지표 수집',
      telemetry.samples>=15 && telemetry.p95Ms>0 && Number.isFinite(telemetry.p95Ms),
      telemetry);
    await mobilePage.screenshot({path:resolve(output,'nexus-mobile-native-390-dpr2.png'),fullPage:true});
    check('모바일 터치 및 시네마틱 런타임 오류 없음',mobileErrors.length===0,mobileErrors);
  }finally{
    await mobilePage.close();
  }

  const report = { kind: 'synthetic-browser-review', visualApproval: false,
    pass: checks.every(c => c.passed), passed: checks.filter(c => c.passed).length,
    total: checks.length, checks, failures };
  await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('[Safety Nexus VG-2] ' + report.passed + '/' + report.total + ' checks passed. Art approval NOT claimed.');
  if (!report.pass) process.exitCode = 1;
} finally {
  await browser.close();
}

import {preview} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const root='http://127.0.0.1:3079';
const out='artifacts/audit/psi-l15-accessibility';
await mkdir(out,{recursive:true});
const server=await preview({preview:{host:'127.0.0.1',port:3079,strictPort:true}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
const cases=[
 {width:320,height:568,mode:'light'},
 {width:360,height:640,mode:'light'},
 {width:390,height:420,mode:'light'},
 {width:390,height:844,mode:'dark'},
 {width:640,height:720,mode:'light',scale:2,proxy:true},
 {width:768,height:844,mode:'light'},
 {width:1280,height:800,mode:'dark'},
 {width:1440,height:900,mode:'light'},
];

try{
 for(const c of cases){
  const context=await browser.newContext({
   viewport:{width:c.width,height:c.height},
   deviceScaleFactor:c.scale||1,
   reducedMotion:'reduce',
   colorScheme:c.mode,
  });
  const page=await context.newPage();
  const errors=[];
  page.setDefaultTimeout(32000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/admin/auth',route=>route.fulfill({json:{ok:true,authenticated:true}}));
  await page.route('**/api/admin/training',route=>route.fulfill({json:{ok:true,summary:{trainingSessions:0,trainingSubmissions:0}}}));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({body:'',contentType:'text/css'}));
  await page.addInitScript((mode)=>{
   sessionStorage.setItem('isAdminAuthenticated','true');
   localStorage.setItem('psi_theme_mode',mode);
  },c.mode);
  await page.goto(root+'/',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'현장 안전, 한눈에.'}).waitFor({timeout:40000});
  const modalTrigger=page.getByRole('button',{name:'메뉴 빠른 찾기'});
  await modalTrigger.click();
  const modal=page.getByRole('dialog',{name:'업무 메뉴 빠른 찾기'});
  await modal.waitFor();
  const input=modal.getByRole('combobox',{name:'업무 메뉴 검색어'});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='업무 메뉴 검색어');
  await input.fill('위험성');
  await modal.getByRole('option').first().waitFor();
  const size=await modal.evaluate(el=>{
   const b=el.getBoundingClientRect();
   return {x:b.left,y:b.top,width:b.width,height:b.height,viewportW:innerWidth,viewportH:innerHeight};
  });
  assert.ok(size.x>=-1 && size.x+size.width<=size.viewportW+1,
   'L15 quick find extends horizontally: '+JSON.stringify({c,size}));
  assert.ok(size.y>=-1 && size.y+size.height<=size.viewportH+2,
   'L15 quick find extends vertically: '+JSON.stringify({c,size}));
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','menu search must lock page scroll');
  const background=await page.evaluate(()=>{
   const root=document.getElementById('root');
   const dialog=document.querySelector('[role="dialog"][aria-labelledby="psi-quickfind-title"]');
   const underlyingButton=root?.querySelector('.psi-quickfind-trigger');
   underlyingButton?.focus();
   return {
    inert:root?.inert===true,
    portalOutsideRoot:!!dialog && !root?.contains(dialog),
    focusBlocked:!!underlyingButton && document.activeElement!==underlyingButton,
    dialogInteractive:!!dialog && !dialog.closest('[inert]'),
   };
  });
  assert.deepEqual(background,{inert:true,portalOutsideRoot:true,focusBlocked:true,dialogInteractive:true},
   'quick finder must make ONLY its nonportal app background inert');
  const close=modal.getByRole('button',{name:'검색 창 닫기'});
  const last=modal.getByRole('option').last();
  await last.focus();
  await page.keyboard.press('Tab');
  assert.equal(await close.evaluate(el=>document.activeElement===el),true,'quick find Tab must wrap to first');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await last.evaluate(el=>document.activeElement===el),true,'quick find Shift+Tab must wrap to last');
  await page.screenshot({path:`${out}/quickfind-${c.width}-${c.height}-${c.mode}.png`,fullPage:false});
  await page.keyboard.press('Escape');
  await modal.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='메뉴 빠른 찾기');
  assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden','quick find must restore scroll');
  assert.equal(await page.evaluate(()=>document.getElementById('root')?.inert),false,
   'quick find must release app inert after Escape');
  if(c.width===390 && c.height===844){
   // Current-page selection is a navigation, not an Escape/back action.
   await modalTrigger.click();
   await modal.waitFor();
   await modal.getByRole('option').first().click();
   await modal.waitFor({state:'hidden'});
   await page.waitForFunction(()=>document.activeElement?.id==='psi-main-content');
   assert.equal(await page.evaluate(()=>document.getElementById('root')?.inert),false,
    'QuickFind current-page selection must release inert');
   assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden',
    'QuickFind route selection must restore scrolling');
  }

  if(c.width<1024){
   const menuTrigger=page.getByRole('button',{name:'메뉴 열기',exact:true});
   await menuTrigger.click();
   const drawer=page.getByRole('dialog',{name:'전체 메뉴'});
   await drawer.waitFor();
   const drawerClose=drawer.getByRole('button',{name:'전체 메뉴 닫기'});
   await drawerClose.focus();
   await drawer.evaluate(el=>{
    const hidden=document.createElement('button');
    hidden.textContent='검증용 숨김 버튼';
    hidden.style.display='none';
    el.appendChild(hidden);
   });
   await page.keyboard.press('Shift+Tab');
   assert.equal(await drawer.evaluate(el=>el.contains(document.activeElement)),true,'mobile drawer focus escaped');
   const lastVisible=drawer.locator('button:visible:not([disabled]),a:visible[href]').last();
   await lastVisible.focus();
   await page.keyboard.press('Tab');
   assert.equal(await drawerClose.evaluate(el=>document.activeElement===el),true,
    'CSS-hidden last control must not block Tab wrapping');
   await page.keyboard.press('Escape');
   await drawer.waitFor({state:'hidden'});
   await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='메뉴 열기');
  }
  // L33: the desktop menu composition editor must remain usable with
  // large, accessible label and reordering targets at both desktop widths.
  if(c.width>=1024){
   const sidebar=page.locator('[data-psi-desktop-sidebar]');
   // L34: verify the actual desktop dock toggles without hiding routes,
   // preserves the active navigation, and meets the same 44px target policy.
   const panel=sidebar.locator('.psi-sidebar');
   const dockToggle=sidebar.getByRole('button',{name:'메뉴 접기'});
   const toggleSize=await dockToggle.boundingBox();
   assert.ok(toggleSize && toggleSize.height>=44 && toggleSize.width>=44,
    'L34 desktop menu collapse button must have a 44px touch target');
   await dockToggle.click();
   await sidebar.getByRole('button',{name:'메뉴 펼치기'}).waitFor();
   await page.waitForFunction(()=>
    Math.abs(document.querySelector('[data-psi-desktop-sidebar] .psi-sidebar')?.getBoundingClientRect().width-76)<2);
   await sidebar.getByRole('button',{name:'시스템 설정',exact:true}).waitFor();
   await sidebar.getByRole('button',{name:'메뉴 펼치기'}).click();
   await page.waitForFunction(()=>
    Math.abs(document.querySelector('[data-psi-desktop-sidebar] .psi-sidebar')?.getBoundingClientRect().width-248)<2);
   assert.equal(await panel.getAttribute('class')?.then(x=>x.includes('psi-sidebar--collapsed')),false,
    'L34 desktop dock should be expanded before menu editing');
   await sidebar.getByRole('button',{name:'시스템 설정',exact:true}).click();
   await page.getByRole('button',{name:'메뉴 구성 편집 열기'}).click();
   // Locate the actual heading first, then its parent section. A has()
   // locator rooted at sidebar accidentally scopes twice inside section.
   const editorHeading=sidebar.getByRole('heading',{name:'메뉴 구성 편집'});
   await editorHeading.waitFor();
   const editor=editorHeading.locator('xpath=..');
   const boxes=editor.getByRole('checkbox');
   assert.ok(await boxes.count()>0,'L33 desktop menu editor must retain user visibility checkboxes');
   const targets=await editor.evaluate(section=>
    Array.from(section.querySelectorAll('label,input[type="checkbox"],button')).map(el=>({
     kind:el.tagName.toLowerCase(),
     label:el.getAttribute('aria-label')||el.textContent?.trim().slice(0,28)||'',
     width:el.getBoundingClientRect().width,
     height:el.getBoundingClientRect().height,
    }))
   );
   assert.ok(targets.some(x=>x.kind==='button' && x.label.includes('위로 이동')),
    'L33 existing user-specific menu reorder actions must remain available');
   for(const target of targets){
    const minimum=target.kind==='input'?20:44;
    assert.ok(target.width>=minimum && target.height>=minimum,
     'L33 menu editor target below '+minimum+'px: '+JSON.stringify({c,target}));
   }
   // L34: hide an editable, originally visible menu item and verify
   // that both the actual sidebar and local-only quick finder agree.
   // Restore it before the remaining visual audit.
   const editable=boxes.first();
   const editableName=(await editable.evaluate(el=>el.closest('label')?.textContent?.trim()))||'';
   assert.ok(editableName,'L34 edited menu entry needs a readable accessible label');
   const originallyVisible=await editable.isChecked();
   assert.equal(originallyVisible,true,'L34 first editor item should be visible initially');
   await editable.uncheck();
   await page.waitForFunction(name=>
    !Array.from(document.querySelectorAll('[data-psi-desktop-sidebar] nav button'))
     .some(button=>button.textContent?.trim()===name),editableName);
   const storedHidden=await page.evaluate(name=>{
    const saved=JSON.parse(localStorage.getItem('psi_ui_composition_v1')||'{}');
    return Array.isArray(saved.hiddenSidebarPages) && saved.hiddenSidebarPages.includes('dashboard');
   },editableName);
   assert.equal(storedHidden,true,'L34 hidden menu selection must persist in existing composition settings');
   await modalTrigger.click();
   await modal.waitFor();
   const hiddenOptions=await modal.getByRole('option').allTextContents();
   assert.ok(!hiddenOptions.some(label=>label.includes(editableName)),
    'L34 quick finder must not reveal a user-hidden sidebar menu item');
   await page.keyboard.press('Escape');
   await modal.waitFor({state:'hidden'});
   await editable.check();
   await sidebar.getByRole('button',{name:editableName,exact:true}).waitFor();
   await modalTrigger.click();
   await modal.waitFor();
   const restoredOptions=await modal.getByRole('option').allTextContents();
   assert.ok(restoredOptions.some(label=>label.includes(editableName)),
    'L34 restored menu must reappear in quick finder without a reload');
   await page.keyboard.press('Escape');
   await modal.waitFor({state:'hidden'});
   await editor.getByRole('button',{name:/아래로 이동/}).first().click();
   assert.ok(await editor.getByRole('checkbox').count()>0,
    'L33 menu reordering should retain the existing edit controls');
   await page.screenshot({path:`${out}/sidebar-composition-${c.width}-${c.mode}.png`,fullPage:false});
   await page.getByRole('button',{name:'메뉴 구성 편집 닫기'}).click();
  }
  const checks=await page.evaluate(()=>{
   const shell=document.querySelector('.psi-app-shell.psi-platform-field-canvas');
   const main=document.querySelector('#psi-main-content');
   const top=document.querySelector('.psi-topbar');
   return {
    windowWidth:innerWidth,docWidth:document.documentElement.scrollWidth,
    height:window.getComputedStyle(shell).height,
    viewportHeight:window.innerHeight,
    mainWidth:main?.getBoundingClientRect().width||0,
    headerWidth:top?.getBoundingClientRect().width||0,
    dark:document.documentElement.classList.contains('dark'),
    scroll:document.body.style.overflow,
    reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
   };
  });
  assert.ok(checks.docWidth<=checks.windowWidth+2,'horizontal document overflow '+JSON.stringify({c,checks}));
  assert.ok(checks.mainWidth>0 && checks.headerWidth>0,'shell main or topbar missing');
  assert.equal(checks.dark,c.mode==='dark','dark mode state lost');
  assert.equal(checks.reduced,true,'reduced motion unavailable');
  assert.notEqual(checks.scroll,'hidden','dialog scroll lock left behind');
  assert.deepEqual(errors,[],'browser errors '+JSON.stringify(c));
  results.push({case:c,quickfind:size,shell:checks});
  await context.close();
 }
 await writeFile(`${out}/result.json`,JSON.stringify({result:'PASS',notes:['Device scale factor 2/640 CSS px is a reflow proxy, not actual 200% browser zoom','Synthetic Chromium does not prove Android/iOS, mother-tongue accuracy, or screen-reader behavior'],checks:results},null,2));
 console.log('PASS PSI L15/L33/L34 desktop dock, editable menu/quickfind sync and 44px accessibility: '+results.length+' synthetic browser cases');
}catch(error){
 await writeFile(`${out}/result.json`,JSON.stringify({result:'FAIL',message:error?.message||String(error),checks:results},null,2));
 throw error;
}finally{
 await browser.close();
 await new Promise(resolve=>server.httpServer.close(resolve));
}

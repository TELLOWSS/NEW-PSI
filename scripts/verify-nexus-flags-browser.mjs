import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const previous={ui:process.env.VITE_PSI_NEXUS_UI_ENABLED,threeD:process.env.VITE_PSI_NEXUS_3D_ENABLED};
try {
  for(const ui of ['true','false']) {
    process.env.VITE_PSI_NEXUS_UI_ENABLED=ui;
    process.env.VITE_PSI_NEXUS_3D_ENABLED='false';
    const server=await createServer({server:{host:'127.0.0.1',port:4193,strictPort:true}});
    await server.listen();
    const page=await browser.newPage();
    try {
      if(ui==='true') {
        await page.goto('http://127.0.0.1:4193/tests/fixtures/nexus-priority.html');
        await page.getByRole('button',{name:'간결한 보기 · 입체 기능 꺼짐'}).waitFor();
        assert.equal(await page.locator('canvas.nexus-core-canvas').count(),0);
        assert.equal(await page.getByRole('button',{name:'간결한 보기 · 입체 기능 꺼짐'}).isDisabled(),true);
        await page.getByRole('button',{name:'기한 초과 1건',exact:true}).first().click();
        await page.getByRole('heading',{name:'기한 초과 조치 1건'}).waitFor();
      } else {
        await page.addInitScript(()=>sessionStorage.setItem('isAdminAuthenticated','true'));
        await page.route('**/api/admin/auth',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"authenticated":true}'}));
        await page.goto('http://127.0.0.1:4193/');
        await page.locator('.psi-ops-toolbar').waitFor();
        assert.equal(await page.getByRole('button',{name:/안전지능 (연결 보기|네트워크)/}).count(),0);
      }
      console.log(`PASS: UI ${ui}, 3D false rollback`);
    } finally { await page.close(); await server.close(); }
  }
} finally {
  await browser.close();
  for(const [key,value] of [['VITE_PSI_NEXUS_UI_ENABLED',previous.ui],['VITE_PSI_NEXUS_3D_ENABLED',previous.threeD]]) {
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
}

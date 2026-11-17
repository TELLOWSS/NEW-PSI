import { createServer } from 'vite';
import { spawn } from 'node:child_process';
const server=await createServer({server:{host:'127.0.0.1',port:4194,strictPort:true,watch:{ignored:['**/artifacts/**']}}});
const run=script=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[script],{stdio:'inherit',env:{...process.env,
    PSI_UI_URL:'http://127.0.0.1:4194/',PSI_NEXUS_FIXTURE_URL:'http://127.0.0.1:4194/tests/fixtures/nexus-priority.html'}});
  child.on('error',reject);
  child.on('exit',code=>code===0?resolve():reject(new Error(`${script}: exit ${code}`)));
});
try {
  await server.listen();
  await run('scripts/verify-nexus-priority-browser.mjs');
  await run('scripts/verify-dashboard-nexus-entry.mjs');
  await run('scripts/verify-nexus-flags-browser.mjs');
} finally { await server.close(); }

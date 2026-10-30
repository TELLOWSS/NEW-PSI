import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export default defineConfig(({ mode }) => {
    loadEnv(mode, '.', '');
    const projectRoot = process.cwd();
    return {
      // Build provenance is public code identity only, never a token or a deployment approval.
      define: { __PSI_RELEASE_COMMIT__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '') },
      root: projectRoot,
      cacheDir: path.resolve(projectRoot, 'node_modules/.vite'),
      envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      optimizeDeps: {
        entries: ['index.html'],
      },
      plugins: [react(),{
        name:'inspector-product-metadata',
        configurePreviewServer(server) {
          // Match the explicit Vercel product rewrite when validating a local build.
          server.middlewares.use((request,_response,next)=>{
            const [pathname,query]=String(request.url || '').split('?');
            if(pathname==='/product'||pathname==='/product/')request.url='/product/index.html'+(query?'?'+query:'');
            next();
          });
        },
        async writeBundle(output,bundle) {
          const directory=path.resolve(output.dir || 'dist');
          const html=await readFile(path.join(directory,'index.html'),'utf8');
          const title='NEW-PSI 사진점검 | 사진 한 장에서 조치·보고서까지';
          const description='무엇이 문제인지 몰라도 사진 한 장에서 시작하세요. 위험 단서·전문가 검토·담당과 기한·개선 증빙·보고서와 조치대장까지, 로그인 없는 샘플 체험.';
          const product=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${title}</title>`)
            .replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${description}" />`)
            .replace('</head>',`<link rel="canonical" href="https://new-psi-eta.vercel.app/product" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="og:site_name" content="NEW-PSI" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="https://new-psi-eta.vercel.app/product" />
    <meta property="og:image" content="https://new-psi-eta.vercel.app/inspector-product-preview-v2.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="NEW-PSI 사진점검 제품 화면 · 체험용 도해" />
    <meta name="twitter:card" content="summary_large_image" />
    </head>`);
          await mkdir(path.join(directory,'product'),{recursive:true});
          await writeFile(path.join(directory,'product/index.html'),product);
          // Cache only the dedicated local page and its own build dependencies.
          const localEntry=Object.values(bundle).find(item=>item.type==='chunk'&&item.isEntry&&(item.name==='fieldLocal'||item.facadeModuleId?.replace(/\\\\/g,'/').includes('/field-local/')));
          if(!localEntry || localEntry.type!=='chunk')throw new Error('Local inspection entry missing');
          const localAssets=new Set<string>();
          const visit=(file:string)=>{if(localAssets.has(file))return;const item=bundle[file];if(!item||item.type!=='chunk')throw new Error('Missing offline chunk '+file);localAssets.add(file);for(const css of item.viteMetadata?.importedCss||[])localAssets.add(css);for(const dep of [...item.imports,...item.dynamicImports])visit(dep);};
          visit(localEntry.fileName);
          const offlineHtml=await readFile(path.join(directory,'field-local/index.html'),'utf8');
          const urls=['/field-local/index.html',...Array.from(localAssets).sort().map(file=>'/'+file)];
          const version=createHash('sha256').update(offlineHtml+JSON.stringify(urls)).digest('hex').slice(0,16);
          const worker=`
const CACHE='psi-local-shell-${version}', URLS=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);try{await cache.addAll(URLS);}catch(error){await caches.delete(CACHE);throw error;}})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('psi-local-shell-')&&name!==CACHE)await caches.delete(name);})()));
self.addEventListener('message',event=>{if(event.data?.type==='VERIFY_LOCAL_ASSETS'&&event.ports[0])event.waitUntil((async()=>{const cache=await caches.open(CACHE);const all=await Promise.all(URLS.map(url=>cache.match(url)));event.ports[0].postMessage({ok:all.every(Boolean)});})());});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;if(request.mode==='navigate'&&(url.pathname==='/field-local/'||url.pathname==='/field-local/index.html')){event.respondWith(caches.open(CACHE).then(cache=>cache.match('/field-local/index.html')).then(response=>response||fetch(request)));return;}if(URLS.includes(url.pathname)&&url.pathname!=='/field-local/index.html')event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname)).then(response=>response||fetch(request)));});
`;
          await writeFile(path.join(directory,'field-local/sw.js'),worker);

        },
      }],
      resolve: {
        preserveSymlinks: true,
        alias: {
          '@': projectRoot,
        }
      },
      build: {
        chunkSizeWarningLimit: 900,
        rollupOptions: {input:{main:path.resolve(projectRoot,'index.html'),fieldLocal:path.resolve(projectRoot,'field-local/index.html')}},
        // Let the bundler place shared modules from the actual import graph.
        // The former manual groups pulled charts onto the public React bootstrap path.
      }
    };
});

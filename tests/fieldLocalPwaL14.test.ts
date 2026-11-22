import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
const manifest=JSON.parse(read('public/field-local-l14.webmanifest'));

describe('L14 isolated field-local PWA pilot / no false offline or delivery claims',()=>{
 it('gives only the local entry its own stable installation identity and scope',()=>{
  expect(manifest.id).toBe('/field-local/');
  expect(manifest.start_url).toBe('/field-local/');
  expect(manifest.scope).toBe('/field-local/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.prefer_related_applications).toBe(false);
  expect(read('field-local/index.html')).toContain('href="/field-local-l14.webmanifest"');
  expect(read('index.html')).not.toContain('field-local-l14.webmanifest');
 });
 it('supplies real 192 and 512 PNG assets instead of asserting dimensions from names',()=>{
  for(const size of [192,512]){
   const path=`public/field-local-icon-l14-${size}.png`;
   const bytes=readFileSync(resolve(process.cwd(),path));
   expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
   expect(bytes.readUInt32BE(16)).toBe(size);
   expect(bytes.readUInt32BE(20)).toBe(size);
   expect(manifest.icons).toContainEqual({src:`/field-local-icon-l14-${size}.png`,sizes:`${size}x${size}`,type:'image/png',purpose:'any'});
  }
 });
 it('keeps the offline shell isolated and includes installation resources in verification',()=>{
  const build=read('vite.config.ts');
  const entry=read('field-local/main.tsx');
  expect(build).toContain("const urls=['/field-local/index.html','/field-local-l14.webmanifest','/field-local-icon-l14-192.png','/field-local-icon-l14-512.png'");
  expect(build).toContain("scope:'/field-local/'").toBe(false); // Scope belongs in entry registration, not build config
  expect(entry).toContain("scope:'/field-local/'");
  expect(entry).toContain("VERIFY_LOCAL_ASSETS");
  expect(entry).toContain("이 기기 오프라인 준비");
 });
 it('prompts only on explicit user action and never treats installation as secure data persistence',()=>{
  const entry=read('field-local/main.tsx');
  expect(entry).toContain("window.addEventListener('beforeinstallprompt',onInstallOffer)");
  expect(entry).toContain("onClick={()=>void requestInstall()}");
  expect(entry).toContain("await offer.prompt()");
  expect(entry).toContain("choice.outcome==='accepted'");
  expect(entry).toContain('서버 자동 전송이나 영구 보존을 뜻하지 않습니다');
  expect(entry).toContain("storage.persist()");
  expect(entry).not.toMatch(/navigator\.share\s*\(|postAdminJson|fetch\s*\(/);
 });
});

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
const config=JSON.parse(source('vercel.json'));
const header=(route:string,key:string)=>config.headers.find((entry:{source:string})=>entry.source===route)
 ?.headers.find((entry:{key:string})=>entry.key.toLowerCase()===key.toLowerCase())?.value;

describe('L17 isolated local PWA and source-only security release gate',()=>{
 it('blocks referrers and indexing on each local-device page alias without touching other services',()=>{
  for(const route of ['/field-local','/field-local/','/field-local/index.html']){
   expect(header(route,'Referrer-Policy')).toBe('no-referrer');
   expect(header(route,'X-Robots-Tag')).toContain('noindex');
   expect(header(route,'X-Robots-Tag')).toContain('nofollow');
  }
  expect(header('/api/(.*)','Cache-Control')).toContain('no-store');
  expect(header('/field-local/sw.js','Cache-Control')).toContain('no-cache');
  expect(header('/inspection-reply','Referrer-Policy')).toBe('no-referrer');
 });
 it('does not promote review-only OSS candidates into production dependencies',()=>{
  const manifest=JSON.parse(source('config/psi-oss-candidate-manifest.json'));
  const pkg=JSON.parse(source('package.json'));
  expect(manifest.reviewedSources).toHaveLength(7);
  expect(manifest.reviewedSources.every((source:{productionDependency:boolean})=>source.productionDependency===false)).toBe(true);
  expect(manifest.permittedVendoredSource.scope).toBe('development-only');
  const deps=Object.keys(pkg.dependencies||{}).join(' ').toLowerCase();
  for(const forbidden of ['voicestudio','hyperframes','@mattpocock/skills','shader-effects','diagram-design'])
   expect(deps).not.toContain(forbidden);
 });
 it('executes source-only audit in release workflow and discloses remaining CSP/RLS uncertainty',()=>{
  const gate=source('scripts/verify-psi-l17-security.mjs');
  const release=source('.github/workflows/verify.yml');
  expect(release).toContain('node scripts/verify-psi-l17-security.mjs');
  expect(release).toContain('artifacts/audit/psi-l17-security/result.json');
  expect(gate).toContain('sourceOnly:true');
  expect(gate).toContain('shareHash(b.token)');
  expect(gate).toContain('live Supabase RLS/tenant isolation');
  expect(gate).toContain('global CSP connect-src permits broad https:/wss:');
  expect(gate).not.toMatch(/fetch\s*\(|axios|child_process|spawn\s*\(/);
 });
});

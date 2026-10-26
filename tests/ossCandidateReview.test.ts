import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const manifest=JSON.parse(read('config/psi-oss-candidate-manifest.json'));
describe('third-party adoption license gate and PSI commercial boundary',()=>{
 it('lists all seven user-provided repositories without claiming blanket commercial approval',()=>{
  expect(manifest.reviewedSources).toHaveLength(7);
  expect(new Set(manifest.reviewedSources.map((r:{repository:string})=>r.repository)).size).toBe(7);
  expect(manifest.notice).toMatch(/NOT blanket commercial/);
  expect(manifest.reviewedSources.every((r:{productionDependency:boolean})=>!r.productionDependency)).toBe(true);
 });
 it('holds AGPL VoiceStudio and its non-commercial model weights out of proprietary PSI',()=>{
  const voice=manifest.reviewedSources.find((r:{repository:string})=>r.repository==='debpalash/VoiceStudio');
  expect(voice).toMatchObject({license:'AGPL-3.0-only',stage:'HOLD',productionDependency:false});
  expect(voice.reason).toContain('CC-BY-NC');
 });
 it('pins an unmodified MIT development-only skill with preserved upstream copyright',()=>{
  const r=manifest.permittedVendoredSource;
  expect(r).toMatchObject({license:'MIT',scope:'development-only',repository:'mattpocock/skills'});
  expect(r.upstreamCommit).toMatch(/^[0-9a-f]{40}$/);
  const base='.agents/skills/domain-modeling/';
  const license=read(base+'LICENSE'),skill=read(base+'SKILL.md');
  expect(license).toContain('Copyright (c) 2026 Matt Pocock');
  expect(license).toContain('Permission is hereby granted');
  expect(skill).toContain('name: domain-modeling');
  expect(skill).toContain('GLOSSARY-FORMAT.md');
  expect(read(base+'ORIGIN.md')).toContain(r.upstreamCommit);
  expect(read(base+'GLOSSARY-FORMAT.md')).toContain('# GLOSSARY.md Format');
  expect(read(base+'ADR-FORMAT.md')).toContain('# ADR Format');
 });
 it('prevents vendor dependency or platform preset smuggling into the production manifest',()=>{
  const pkg=JSON.parse(read('package.json'));
  const installed={...pkg.dependencies,...pkg.devDependencies};
  for(const name of ['shaders','laya','laya-ts','rea-agents','@hyperframes/core','@hyperframes/engine','voicestudio'])
   expect(installed).not.toHaveProperty(name);
  expect(manifest.blockers.join(' ')).toContain('Vercel Hobby');
 });
 it('records safety and product boundaries for future code reviewers',()=>{
  const review=read('docs/psi-ai-company/OSS_SOURCE_REVIEW_20261026.md');
  for(const s of ['협력사 안전관리비','실현장 사진','재점검','AGPL','Apache-2.0','MIT','WebGPU'])expect(review).toContain(s);
  expect(read('AGENTS.md')).toContain('OSS_SOURCE_REVIEW_20261026.md');
 });
});

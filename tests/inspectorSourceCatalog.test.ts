import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {sourceCatalog,reviewForSource} from '../lib/inspector/sourceReviewRegistry';
import {sourceReviewState,sourceEventStatus,koreaDay,type SourceReview} from '../lib/inspector/sourceReview';
import {sourceContentJson,validateSourceCatalog,officialSourceUrl,MAX_CATALOG_BYTES} from '../lib/inspector/sourceCatalogValidation';
import {LEGAL_CARDS,legalForTopics,legalForText,legalForInspection} from '../lib/inspector/legal';
import {INSPECTION_CASES} from '../lib/inspector/inspectionCases';
import {SAFETY_TRENDS} from '../lib/inspector/safetyTrends';
import {newInspectionDocument} from '../lib/inspector/types';
import {serializeSnapshot as canonicalJson} from '../lib/inspector/snapshot';

const digest=(value:unknown)=>createHash('sha256').update(sourceContentJson(value)).digest('hex');
const expected=Object.fromEntries([['legal',LEGAL_CARDS],['case',INSPECTION_CASES],['trend',SAFETY_TRENDS]].flatMap(([kind,items])=>(items as any[]).map(item=>[`${kind}:${item.id}`,digest(item)])));
const candidate=()=>{const next=structuredClone(sourceCatalog);next.version++;const record=next.records[0];record.revisions.push({...record.revisions[0],revision:2,status:'pending',note:'합성 갱신 후보'});return next;};
const options={baseline:sourceCatalog,expectedDigests:expected,day:'2026-10-27'};

describe('bounded administrator review catalog',()=>{
 it('binds every existing card/case/trend to its exact content without changing it',()=>{expect(Object.keys(expected)).toHaveLength(25);expect(validateSourceCatalog(sourceCatalog,{expectedDigests:expected,day:'2026-10-27'})).toEqual([]);expect(validateSourceCatalog(candidate(),options)).toEqual([]);});
 it('rejects rewrites/removals of old review history and no-op versions',()=>{const next=candidate();next.records[0].revisions[0].note='수정';expect(validateSourceCatalog(next,options).join()).toContain('과거 검토 이력');const deleted=candidate();deleted.records.shift();expect(validateSourceCatalog(deleted,options).join()).toContain('누락');const noop=structuredClone(sourceCatalog);noop.version++;expect(validateSourceCatalog(noop,options).join()).toContain('변경된 검토 이력');});
 it('rejects a reviewed label without original-check evidence, reviewer and deadline',()=>{const next=candidate(),review=next.records[0].revisions.at(-1)!;review.status='reviewed';expect(validateSourceCatalog(next,options).join()).toContain('원문 확인');});
 it.each(['https://www.moel.go.kr.evil.test/a','http://www.law.go.kr/a','https://user:pass@moel.go.kr/a','javascript:alert(1)','https://moel.go.kr:444/a','https://evil.test/?url=https://moel.go.kr'])('rejects non-official, credential-bearing or executable URL %s',url=>{expect(officialSourceUrl(url)).toBe(false);const next=candidate();next.records[0].revisions.at(-1)!.urls=[url];expect(validateSourceCatalog(next,options).length).toBeGreaterThan(0);});
 it('rejects malformed input, impossible dates, future checks, content drift, money changes and unbounded files without throwing',()=>{for(const value of [null,{},[1],{schemaVersion:1,version:2,records:[null]}])expect(()=>validateSourceCatalog(value,options)).not.toThrow();const next=candidate(),r=next.records[0].revisions.at(-1)!;r.checkedAt='2026-99-99';expect(()=>validateSourceCatalog(next,options)).not.toThrow();expect(validateSourceCatalog(next,options).length).toBeGreaterThan(0);r.checkedAt='2026-10-28';expect(validateSourceCatalog(next,options).join()).toContain('미래');r.checkedAt=null;r.contentSha256='a'.repeat(64);expect(validateSourceCatalog(next,options).join()).toContain('해시');(r as any).fineMaxKRW=1;expect(validateSourceCatalog(next,options).length).toBeGreaterThan(0);expect(validateSourceCatalog({big:'x'.repeat(MAX_CATALOG_BYTES+1)}).join()).toContain('192KiB');});
 it('exports, previews and applies only a local candidate, preserving history and leaving source content intact',()=>{
  const root=mkdtempSync(join(tmpdir(),'psi-source-catalog-')),script=resolve('scripts/manage-inspector-sources.mjs');
  try{
   mkdirSync(join(root,'data/inspector'),{recursive:true});mkdirSync(join(root,'lib/inspector'),{recursive:true});
   writeFileSync(join(root,'data/inspector/sourceReviews.json'),JSON.stringify(sourceCatalog));
   for(const [file,name,items] of [['legal','LEGAL_CARDS',LEGAL_CARDS],['inspectionCases','INSPECTION_CASES',INSPECTION_CASES],['safetyTrends','SAFETY_TRENDS',SAFETY_TRENDS]])writeFileSync(join(root,`lib/inspector/${file}.ts`),`export const ${name}=${JSON.stringify(items)}`);
   const run=(...args:string[])=>execFileSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8',timeout:30000});
   run('export','export.json');expect(JSON.parse(readFileSync(join(root,'export.json'),'utf8'))).toEqual(sourceCatalog);
   const next=candidate();writeFileSync(join(root,'candidate.json'),JSON.stringify(next));
   run('preview','candidate.json');expect(JSON.parse(readFileSync(join(root,'data/inspector/sourceReviews.json'),'utf8'))).toEqual(sourceCatalog);
   run('apply','candidate.json');expect(JSON.parse(readFileSync(join(root,'data/inspector/sourceReviews.json'),'utf8'))).toEqual(next);
   expect(run('check')).toContain('PASS');expect(()=>run('apply','candidate.json')).toThrow();
  }finally{if(!resolve(root).startsWith(resolve(join(tmpdir(),'psi-source-catalog-'))))throw new Error('Unexpected test directory');rmSync(root,{recursive:true,force:true});}
 },30000);
});

describe('source states, law edition candidates and old snapshots',()=>{
 it('never calls old/global reviewedAt a verified source state',()=>{expect(sourceReviewState(undefined,'2026-10-27').code).toBe('legacy');expect(sourceReviewState(reviewForSource('legal','opening'),'2026-10-27').code).toBe('legacy');});
 it('separates publication, check, review and stale dates using the Korean day',()=>{const review=reviewForSource('trend','moel-20117')!;expect(review.publishedAt).toBe('2026-10-20');expect(sourceReviewState(reviewForSource('case','moel-18869'),'2026-10-27').code).toBe('pending');expect(review.checkedAt).toBe('2026-10-27');expect(sourceReviewState(review,'2026-10-27').code).toBe('reviewed');expect(sourceReviewState(review,'2027-01-26').code).toBe('stale');expect(sourceReviewState(review,'2026-10-26').code).toBe('pending');expect(koreaDay(new Date('2026-10-26T15:00:00Z'))).toBe('2026-10-27');});
 it('records law history without deciding sanctions or pretending an overlapping edition is applicable',()=>{const review=reviewForSource('legal','opening')!;review.legalEditions=[{version:'합성 이전본',promulgatedAt:'2025-01-01',effectiveFrom:'2025-02-01',effectiveTo:'2026-02-28',url:'https://www.law.go.kr/',note:'합성 테스트'},{version:'합성 현재본',promulgatedAt:'2026-01-01',effectiveFrom:'2026-03-01',effectiveTo:null,url:'https://www.law.go.kr/',note:'합성 테스트'}];expect(sourceEventStatus(review,'2026-03-02')).toContain('합성 현재본');expect(sourceEventStatus(review,'2025-01-31')).toContain('확인 필요');review.legalEditions[0].effectiveTo=null;expect(sourceEventStatus(review,'2026-03-02')).toContain('확인 필요');});
 it('isolates metadata in new reports and preserves the canonical JSON/hash of a legacy report',()=>{
  const doc=newInspectionDocument();doc.notes='개구부 덮개';const current=legalForInspection(doc),legacy=structuredClone(current);delete legacy.catalogVersion;delete legacy.eventAt;delete legacy.unmatchedTopicIds;legacy.cards.forEach(c=>delete c.sourceReview);legacy.inspectionCases?.forEach(c=>delete c.sourceReview);legacy.recentTrends?.forEach(t=>delete t.sourceReview);
  const frozen=canonicalJson(legacy),hash=digest(legacy);const updated=legalForInspection(doc);updated.cards[0].sourceReview!.note='합성 변경';expect(canonicalJson(legacy)).toBe(frozen);expect(digest(legacy)).toBe(hash);expect(legalForInspection(doc).cards[0].sourceReview!.note).not.toBe('합성 변경');expect(legacy.cards[0].sourceReview).toBeUndefined();
 });
 it('omits withdrawn sources from new lookups while keeping saved snapshots intact',()=>{const card=LEGAL_CARDS[0],old=card.sourceReview!,frozen=legalForTopics([card.id]);try{card.sourceReview={...old,status:'withdrawn'};const next=legalForTopics([card.id]);expect(next.cards).toEqual([]);expect(next.unmatchedTopicIds).toEqual([card.id]);expect(next.recentTrends).toEqual([]);expect(frozen.cards).toHaveLength(1);}finally{card.sourceReview=old;}});
});

describe('hazard-specific classification with honest gaps',()=>{
 it.each(['슬래브 끝단','작업발판 끝단','바닥 끝단'])('finds a real floor edge: %s',text=>expect(legalForText(text).cards.map(c=>c.id)).toContain('opening'));
 it.each(['크레인 전도','굴착기 전도','지게차 전도','철근 전도'])('does not borrow housekeeping law for equipment/material overturning: %s',text=>expect(legalForText(text).cards.map(c=>c.id)).not.toContain('housekeeping'));
 it('retains actual housekeeping and material-end distinctions and does not fill unsupported mechanisms with generic trends',()=>{expect(legalForText('크레인 전도 우려, 통로 적치물 정리').cards.map(c=>c.id)).toContain('housekeeping');expect(legalForText('철근 끝단').cards.map(c=>c.id)).not.toContain('opening');const missing=legalForTopics(['unknown-hazard']);expect(missing.cards).toEqual([]);expect(missing.inspectionCases).toEqual([]);expect(missing.recentTrends).toEqual([]);expect(missing.unmatchedTopicIds).toEqual(['unknown-hazard']);});
});

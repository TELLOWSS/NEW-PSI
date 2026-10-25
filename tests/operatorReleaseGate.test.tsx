import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {currentReleaseLabel,validReleaseSha,evaluateReleaseEvidence} from '../utils/releaseGate';
import {OperatorReleaseProof} from '../components/management/OperatorReleaseProof';
import boundary from '../config/psi-product-boundaries.json';
const a='a'.repeat(40),b='b'.repeat(40);
describe('operator-only release provenance and deliberate gate',()=>{
 it('accepts only complete source hashes, never short or unsafe identifiers',()=>{
    expect(validReleaseSha(a)).toBe(a);
    expect(validReleaseSha(b.slice(0,8))).toBeNull();
    expect(validReleaseSha('x'.repeat(40))).toBeNull();
    expect(currentReleaseLabel()).toContain('빌드 코드');
 });
 it('blocks missing CI, mismatched preview, or missing data-change restore evidence',()=>{
    expect(evaluateReleaseEvidence({candidateSha:a,ciPassed:true,ciSha:a,previewReady:true,previewSha:b}).stage).toBe('blocked');
    const data=evaluateReleaseEvidence({candidateSha:a,ciPassed:true,ciSha:a,previewReady:true,previewSha:a,affectsStoredRecords:true});
    expect(data.stage).toBe('blocked');
    expect(data.blockers.join(' ')).toContain('복원 검증');
 });
 it('does not claim production just because CI/preview passed',()=>{
    const e=evaluateReleaseEvidence({candidateSha:a,ciPassed:true,ciSha:a,previewReady:true,previewSha:a,productionSha:b});
    expect(e.stage).toBe('ready-for-operator-review');
    expect(e.notes.join(' ')).toContain('운영 배포');
    const same=evaluateReleaseEvidence({candidateSha:a,ciPassed:true,ciSha:a,previewReady:true,previewSha:a,productionSha:a});
    expect(same.stage).toBe('production-sha-matches');
    expect(same.notes.join(' ')).toContain('별칭');
 });
 it('keeps the full programs for admins and contractor expense product independent',()=>{
    expect(boundary.rules['psi-core'].programSharedWithWorkers).toBe(false);
    expect(boundary.rules['psi-inspector'].programSharedWithWorkers).toBe(false);
    expect(boundary.rules['partner-safety-expense'].autoMergeAllowed).toBe(false);
    expect(boundary.rules['psi-inspector'].authRequired).toBe(true);
 });
 it('renders human-readable instructions but no fake live status or server backup confirmation',()=>{
    const html=renderToStaticMarkup(React.createElement(OperatorReleaseProof));
    expect(html).toContain('운영 버전·백업 확인');
    expect(html).toContain('근로자');
    expect(html).toContain('인스펙터 Supabase 사진/DB');
    expect(html).toContain('Vercel 운영 배포 확인');
    expect(html).toContain('버전 코드 복사');
    expect(html).not.toContain('서버 DB 복원 성공');
 });
});

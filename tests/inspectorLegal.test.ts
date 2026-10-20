import {describe,expect,it} from 'vitest';
import {LEGAL_CARDS,LEGAL_VERSION,legalForInspection,legalForText,sanctionText} from '../lib/inspector/legal';
import {newInspectionDocument} from '../lib/inspector/types';

describe('dated official legal references, independent of provider assertions',()=>{
    it('gives opening protection, concrete action and the correct conditional criminal ceiling',()=>{
        const r=legalForText('3층 개구부 덮개 없음');const card=r.cards.find(c=>c.id==='opening')!;
        expect(card.duties[0].label).toContain('제43조');expect(card.actions.join(' ')).toContain('접근을 통제');
        expect(card.sanctions[0]).toMatchObject({kind:'criminal',actor:'사업주',fineMaxKRW:50_000_000,prisonYears:5});
        expect(card.sanctions[0].condition).toContain('위반이 성립');expect(sanctionText(card.sanctions[0])).toBe('5년 이하 징역 또는 5,000만원 이하 벌금');
    });
    it('distinguishes the employer criminal responsibility from the worker administrative ceiling',()=>{
        const card=legalForText('안전모 미착용').cards.find(c=>c.id==='ppe')!;
        expect(card.sanctions.map(s=>[s.kind,s.actor,s.fineMaxKRW])).toEqual([['criminal','사업주',50_000_000],['administrative','근로자',3_000_000]]);
        expect(sanctionText(card.sanctions[1])).toBe('300만원 이하 과태료 (법정상한)');
    });
    it('provides the requested law-summary posting duty with an administrative, not criminal, amount',()=>{
        const card=legalForText('산업안전보건법령 요지 게시').cards.find(c=>c.id==='posting')!;
        expect(card.duties[0].label).toContain('제34조');expect(card.sanctions[0]).toMatchObject({kind:'administrative',fineMaxKRW:5_000_000});
    });
    it('does not substitute regular education amounts for special education',()=>{
        const card=legalForText('특별교육 미실시').cards[0];expect(card.sanctions.map(s=>s.fineMaxKRW)).toEqual([5_000_000,30_000_000]);
        expect(card.sanctions[1].condition).toContain('제3항');
    });
    it('makes no claim about unrecognized situations and never sums sanctions across photos',()=>{
        expect(legalForText('원인 미상').cards).toEqual([]);const r=legalForText('비계 개구부 감전');
        expect(r.cards.length).toBeGreaterThan(1);expect(r).not.toHaveProperty('totalFine');expect(r.version).toBe(LEGAL_VERSION);
    });
    it('uses only linked evidence and never treats a hypothesis or recommendation as an observed hazard',()=>{
        const doc=newInspectionDocument();doc.photoIds=['included','excluded'];doc.photoNotes={included:'비계',excluded:'감전'};
        doc.analyses.included={schema_version:'1.1',inspection_id:'i',photo_id:'included',source_photo_sha256:'a'.repeat(64),processing_mode:'CHATGPT_MANUAL',observed_facts:[],ai_hypotheses:[{text:'개구부',reason:'추측'}],requires_confirmation:[],recommended_controls:[{action:'화재 예방',priority:'routine'}],law_candidate_keywords:[],limitations:[]};
        expect(legalForInspection(doc,['included']).cards.map(c=>c.id)).toEqual(['scaffold']);
    });
    it('does not allow AI-generated fine amounts to become authoritative',()=>{
        const r=legalForText('개구부 과태료 999999999원 확정');expect(r.cards[0].sanctions[0].fineMaxKRW).toBe(50_000_000);
    });
    it('labels historical and future event dates outside the reviewed period, using the Korean day',()=>{
        expect(legalForText('비계','2025-10-20').dateStatus).toBe('outside-reviewed-period');expect(legalForText('비계','2027-01-08').dateStatus).toBe('outside-reviewed-period');
        expect(legalForText('비계','2026-10-20T15:30:00Z').dateStatus).toBe('outside-reviewed-period');
        expect(legalForText('비계','2026-10-20T00:00:00Z').dateStatus).toBe('reference-date');
    });
    it('pins every duty and sanction to an official statute source and returns isolated snapshots',()=>{
        for(const card of LEGAL_CARDS)for(const item of [...card.duties,...card.sanctions])expect(new URL(item.url).hostname).toBe('www.law.go.kr');
        const r=legalForText('개구부');r.cards[0].sanctions[0].fineMaxKRW=1;expect(legalForText('개구부').cards[0].sanctions[0].fineMaxKRW).toBe(50_000_000);
    });
});

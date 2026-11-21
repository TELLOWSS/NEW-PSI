import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ReportDeliveryEvidencePanel from '../components/report/ReportDeliveryEvidencePanel';
import {ShareDialog} from '../components/inspector/InspectorShareButton';
import {buildReportDeliveryEvidence,buildShareHandoffEvidence} from '../utils/reportDeliveryEvidenceL12';

const state=(patch:Partial<Parameters<typeof buildReportDeliveryEvidence>[0]>={})=>
    buildReportDeliveryEvidence({
        generationStatus:'idle',generationProgress:0,isGenerating:false,
        isPackagingEvidence:false,verificationChecked:false,verificationPassed:false,...patch,
    });
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');

describe('L12 document creation, download, transfer, receipt, verification and approval evidence',()=>{
    it('never invents download, recipient receipt or safety approval for an empty report',()=>{
        const data=state();
        expect(data.stages.map(s=>s.key)).toEqual(['create','device','handoff','receipt','verify','approval']);
        expect(data.stages[0].label).toBe('생성 시작 전');
        expect(data.stages[1].label).toContain('미확인');
        expect(data.stages[2].label).toContain('미확인');
        expect(data.stages[3].label).toContain('근거 없음');
        expect(data.safetyClearance).toBe(false);
        expect(data.distributionConfirmed).toBe(false);
    });
    it('records only a browser download request after generation success',()=>{
        const data=state({generationStatus:'success',generationProgress:100});
        expect(data.stages[0]).toMatchObject({state:'requested',label:'생성 처리 후 저장 요청 실행'});
        expect(data.stages[1]).toMatchObject({state:'unconfirmed'});
        expect(data.stages[2]).toMatchObject({state:'unconfirmed'});
        expect(data.nextCheck).toContain('다운로드 목록에서 실제 파일을 열어');
    });
    it('keeps processing and failure distinct from completed file generation',()=>{
        const running=state({generationStatus:'running',generationProgress:45,isGenerating:true});
        expect(running.stages[0].label).toContain('45%');
        expect(running.stages[0].state).toBe('running');
        const fail=state({generationStatus:'error',generationProgress:23});
        expect(fail.stages[0].state).toBe('attention');
        expect(fail.nextCheck).toContain('생성 오류');
        expect(fail.stages[1].state).toBe('unconfirmed');
    });
    it('limits successful hash validation to separately selected evidence files',()=>{
        const pass=state({generationStatus:'idle',verificationChecked:true,verificationPassed:true});
        expect(pass.stages[4]).toMatchObject({state:'reviewed'});
        expect(pass.stages[4].evidence).toContain('별도로 업로드해 검증한');
        expect(pass.stages[0].state).toBe('not-started');
        expect(pass.stages[3].state).toBe('unconfirmed');
        expect(pass.stages[5].state).toBe('unconfirmed');
        const fail=state({verificationChecked:true,verificationPassed:false});
        expect(fail.stages[4].state).toBe('attention');
    });
    it('share-app handoff or text copy cannot prove external dispatch or receipt',()=>{
        for(const result of ['handed-off','cancelled','unsupported','files-unsupported','failed'] as const){
            const data=buildShareHandoffEvidence(result);
            expect(data.transferConfirmed).toBe(false);
            expect(data.receiptConfirmed).toBe(false);
            expect(data.recipientLabel).toContain('확인 안 됨');
        }
        const copied=buildShareHandoffEvidence(null,true);
        expect(copied.appLabel).toContain('문구 복사');
        expect(copied.appLabel).toContain('인계 아님');
        expect(buildShareHandoffEvidence('handed-off').appLabel).toContain('실제 전송 미확인');
    });
    it('shows six steps and share uncertainty without inserting individual names or sending data',()=>{
        const html=renderToStaticMarkup(React.createElement(ReportDeliveryEvidencePanel,{evidence:state()}));
        expect(html).toContain('data-psi-report-delivery-l12="true"');
        expect((html.match(/data-psi-l12-stage=/g)||[]).length).toBe(6);
        expect(html).toContain('배포·수신 자동 확인 없음');
        expect(html).toContain('실제 다운로드·보관 미확인');
        const share=renderToStaticMarkup(React.createElement(ShareDialog,{title:'합성',text:'합성 검사',onClose:()=>{}}));
        expect(share).toContain('data-psi-share-evidence-l12="true"');
        expect(share).toContain('상대방 수신·열람 확인 안 됨');
        expect(share).toContain('카톡 등으로 보내기');
    });
    it('binds real existing report and inspector actions without a new API or receipt store',()=>{
        const page=read('pages/Reports.tsx');
        const share=read('components/inspector/InspectorShareButton.tsx');
        const builder=read('utils/reportDeliveryEvidenceL12.ts');
        expect(page).toContain('<ReportDeliveryEvidencePanel');
        expect(page).toContain('buildReportDeliveryEvidence({');
        expect(page).toContain('verificationChecked: Boolean(verificationResult)');
        expect(page).toContain('verificationPassed: Boolean(verificationResult?.isValid)');
        expect(page).toContain('id="psi-report-package-verification"');
        expect(page).toContain('브라우저 저장 요청됨 · 실제 파일 미확인');
        expect(share).toContain('buildShareHandoffEvidence(shareOutcome,copied)');
        expect(share).toContain('setShareOutcome(result)');
        expect(share).toContain("setCopied(result==='copied')");
        expect(builder).not.toMatch(/fetch\s*\(|localStorage|sessionStorage|indexedDB|setInterval\s*\(/);
    });
});

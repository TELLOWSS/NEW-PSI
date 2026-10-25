import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import type {InspectorAction} from '../lib/inspector/types';
import {summarizeActionRadar} from '../lib/inspector/actionRadar';
import InspectorActionRadar from '../components/inspector/InspectorActionRadar';

const make=(id:string,patch:Partial<InspectorAction>={}):InspectorAction=>({
    id,title:'발판 개구부 보호 확인',owner:'형틀반장',dueDate:'2026-10-25',status:'open',
    completionPhotoId:'',note:'',sourcePhotoIds:['photo-1'],...patch,
});
describe('inspector saved-action priority radar',()=>{
    const today='2026-10-25';
    it('keeps overdue separate from due-today and excludes verified actions from overdue',()=>{
        const result=summarizeActionRadar([
            make('late',{dueDate:'2026-10-24'}),
            make('today'),
            make('verified',{dueDate:'2026-09-01',status:'verified',verifiedAt:'2026-10-01T00:00:00Z'}),
        ],today);
        expect(result).toMatchObject({total:3,overdue:1,open:2,verified:1,dueToday:1});
        expect(result.immediateMessage).toContain('기한이 지난');
    });
    it('never treats a photo or a review request as a verified improvement',()=>{
        const result=summarizeActionRadar([make('review',{
            status:'review-requested',completionPhotoId:'improvement-photo',
        })],today);
        expect(result).toMatchObject({awaitingReinspection:1,verified:0,open:0});
        expect(result.immediateMessage).toContain('아직 완료 승인이 아닙니다');
    });
    it('keeps malformed legacy dates and missing assignments visible, without overdue false positives',()=>{
        const result=summarizeActionRadar([make('legacy',{owner:' ',dueDate:'2026-2-5'}),make('empty',{dueDate:''})],today);
        expect(result.overdue).toBe(0);
        expect(result.missingAssignment).toBe(2);
        expect(result.immediateMessage).toContain('보완');
    });
    it('never infers delivery, read receipts or zero site risks from no actions',()=>{
        const result=summarizeActionRadar([],today);
        expect(result.total).toBe(0);
        expect(result.immediateMessage).toContain('위험이나 조치 필요성이 없다는 뜻은 아닙니다');
        expect(result.scope).toContain('별도로 조회');
    });
    it('renders mobile-friendly saved-only counters and honest separate reply action',()=>{
        const html=renderToStaticMarkup(React.createElement(InspectorActionRadar,{
            actions:[make('first',{dueDate:'2026-10-23'})],
            onOpenActions:()=>{},
            onOpenInbox:()=>{},
        }));
        expect(html).toContain('조치 관리 우선순위');
        expect(html).toContain('data-action-radar="saved-only"');
        expect(html).toContain('조치 관리 열기');
        expect(html).toContain('회신 기록 확인');
        expect(html).toContain('링크 발송');
        expect(html).not.toContain('자동 완료');
    });
});

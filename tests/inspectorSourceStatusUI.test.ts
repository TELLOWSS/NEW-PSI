import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import InspectorSourceStatus from '../components/inspector/InspectorSourceStatus';
import InspectorLegalResult from '../components/inspector/InspectorLegalResult';
import {reviewForSource} from '../lib/inspector/sourceReviewRegistry';
import {legalForText} from '../lib/inspector/legal';

it('shows honest missing metadata for old report data without injecting current review claims',()=>{
 const legacy=legalForText('개구부');legacy.cards.forEach(c=>delete c.sourceReview);legacy.inspectionCases?.forEach(c=>delete c.sourceReview);legacy.recentTrends?.forEach(t=>delete t.sourceReview);
 const before=JSON.stringify(legacy),html=renderToStaticMarkup(React.createElement(InspectorLegalResult,{reference:legacy}));
 expect(html).toContain('기존 자료 · 검토 이력 보완 필요');expect(html).toContain('사건 당시 시행본 확인 필요');expect(html).toContain('법정상한');expect(html).not.toContain('원문 대조 기록 있음');expect(JSON.stringify(legacy)).toBe(before);
});
it('labels stale and withdrawn sources and never describes a missing law edition as an approved amount',()=>{
 const stale=reviewForSource('trend','moel-20117')!;stale.reviewDueAt='2026-10-26';const html=renderToStaticMarkup(React.createElement(InspectorSourceStatus,{review:stale,legal:true}));expect(html).toContain('검토 기한 경과');expect(html).toContain('공개일:');expect(html).toContain('원문 확인일:');expect(html).toContain('검토일:');expect(html).toContain('법정상한과 실제 적용 요건은 별개');
 expect(renderToStaticMarkup(React.createElement(InspectorSourceStatus,{review:{...stale,status:'withdrawn'}}))).toContain('사용 중단');
});

import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import InspectorManualContext from '../components/inspector/InspectorManualContext';
const render=(extra:Partial<React.ComponentProps<typeof InspectorManualContext>>={})=>renderToStaticMarkup(React.createElement(InspectorManualContext,{workType:'',topic:'',showTopic:true,disabled:false,onWorkType:()=>{},onTopic:()=>{},...extra}));
it('offers the requested construction trades without inferring a hazard from a trade',()=>{
 const html=render({workType:'철근'});for(const trade of ['형틀','철근','시스템비계','시스템동바리','콘크리트 타설','양중','해체작업'])expect(html).toContain(trade);
 expect(html).toContain('AI 판정·법 위반 확정이 아니며');expect(html).not.toContain('선택한 위험의 법령·사례·동향 확인');
});
it('preserves an existing custom work type as a selected option',()=>{
 expect(render({workType:'기존 현장의 특별공종'})).toMatch(/<option[^>]*selected[^>]*>기존 현장의 특별공종<\/option>/);
});
it('looks up the existing selected legal card without creating a photo analysis',()=>{
 const html=render({topic:'electric'});expect(html).toContain('선택한 위험의 법령·사례·동향 확인');expect(html).toContain('법정상한');expect(html).not.toContain('AI가 판정');
});
it('does not duplicate the risk selector once the existing result selector is available',()=>{
 const html=render({topic:'electric',showTopic:false});expect(html).toContain('공종');expect(html).not.toContain('직접 확인한 위험유형');expect(html).not.toContain('<details');
});
it('disables native inputs together during a save',()=>{expect(render({disabled:true})).toContain('<fieldset disabled=""');});

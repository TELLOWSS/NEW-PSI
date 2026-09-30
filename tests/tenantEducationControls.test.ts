import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {TenantEducationReleasePanel,TenantWorkerAccountPanel} from '../components/TenantEducationControls';
import WorkerTenantEducation from '../pages/WorkerTenantEducation';
it.each(['owner','admin','reviewer','viewer'])('does not fetch on entry and limits publication controls for %s',role=>{
 const request=vi.fn();const html=renderToStaticMarkup(React.createElement(TenantEducationReleasePanel,{role,draft:{id:'test',title:'Test',siteName:'Site',sourceTextKo:'Text',workerIds:['test'],revision:1,createdAt:'',updatedAt:''},request,onAccessLost:vi.fn()}));
 expect(html.includes('지정 대상자에게 교육 배포')).toBe(['owner','admin'].includes(role));expect(html).toContain('초안을 수정하면 이전 배포');expect(request).not.toHaveBeenCalled();
});
it('requires explicit account lookup before displaying email entry',()=>{
 const request=vi.fn();const html=renderToStaticMarkup(React.createElement(TenantWorkerAccountPanel,{worker:{id:'test',name:'Worker',active:true},request,onAccessLost:vi.fn()}));
 expect(html).toContain('교육 계정 확인');expect(html).not.toContain('<form');expect(request).not.toHaveBeenCalled();
});
it('rejects absent selectors without showing login or education content',()=>{
 const html=renderToStaticMarkup(React.createElement(WorkerTenantEducation));expect(html).toContain('올바른 교육 링크가 아닙니다');expect(html).not.toContain('<form');expect(html).not.toContain('<article');
});

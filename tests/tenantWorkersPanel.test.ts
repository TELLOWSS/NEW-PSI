import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import TenantWorkersPanel from '../components/TenantWorkersPanel';

describe('worker registry role and initial requests', () => {
    it.each(['owner','admin'])('allows %s to register with a non-sensitive company code', role => {
        const request=vi.fn();
        const html=renderToStaticMarkup(React.createElement(TenantWorkersPanel,{role,request,onAccessLost:vi.fn()}));
        expect(html).toContain('기업 내 관리번호');
        expect(html).toContain('주민등록번호나 전화번호를 사용하지');
        expect(html).toContain('<form'); expect(request).not.toHaveBeenCalled();
    });
    it.each(['reviewer','viewer','unknown'])('keeps %s read-only without fetching data on entry', role => {
        const request=vi.fn();
        const html=renderToStaticMarkup(React.createElement(TenantWorkersPanel,{role,request,onAccessLost:vi.fn()}));
        expect(html).not.toContain('<form'); expect(html).toContain('목록 조회');
        expect(request).not.toHaveBeenCalled();
    });
});

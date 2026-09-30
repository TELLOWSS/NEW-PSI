import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import TenantTrainingDraftsPanel from '../components/TenantTrainingDraftsPanel';

describe('education draft initial access and disclosure', () => {
    it.each(['owner', 'admin', 'reviewer'])('allows %s to prepare a draft without requesting data on entry', role => {
        const request = vi.fn();
        const html = renderToStaticMarkup(React.createElement(TenantTrainingDraftsPanel, { role, request, onAccessLost: vi.fn() }));
        expect(html).toContain('교육 원문 (한국어)');
        expect(html).toContain('근로자에게 배포되지 않으며');
        expect(html).toContain('maxLength="10000"');
        expect(request).not.toHaveBeenCalled();
    });
    it.each(['viewer', 'unknown'])('keeps %s read-only and does not fetch records', role => {
        const request = vi.fn();
        const html = renderToStaticMarkup(React.createElement(TenantTrainingDraftsPanel, { role, request, onAccessLost: vi.fn() }));
        expect(html).toContain('목록 조회');
        expect(html).toContain('조회 권한');
        expect(html).not.toContain('<form');
        expect(request).not.toHaveBeenCalled();
    });
});

import {describe,it,expect} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DEFAULT_FREE_TIER_SCENARIO,estimateFreeTierCapacity} from '../utils/freeTierCapacity';
import {FreeTierCapacityPlanner} from '../components/management/FreeTierCapacityPlanner';

describe('PSI Hobby planner: illustrative estimates, never real usage',()=>{
    it('computes monthly storage, all-uncached file downloads and shared team deployment percentage',()=>{
        const result=estimateFreeTierCapacity({photosPerMonth:1024,averagePhotoKB:512,downloadsPerPhoto:2,analysisAttemptsPerPhoto:1,teamDeploymentsPerDay:80});
        expect(result.newStorageMiB).toBe(512);
        expect(result.uncachedDownloadGiBUpper).toBe(1);
        expect(result.analysisAttempts).toBe(1024);
        expect(result.hobbyDeploymentSharePct).toBe(80);
        expect(result.notes.join(' ')).toContain('70%');
    });
    it('clamps invalid and gigantic user inputs, does not produce infinity or negative values',()=>{
        const a=estimateFreeTierCapacity({photosPerMonth:-50,averagePhotoKB:Infinity,downloadsPerPhoto:-5,analysisAttemptsPerPhoto:NaN,teamDeploymentsPerDay:-20});
        expect(a.newStorageMiB).toBe(0);
        expect(a.analysisAttempts).toBe(0);
        expect(a.hobbyDeploymentSharePct).toBe(0);
        const b=estimateFreeTierCapacity({photosPerMonth:1e12,averagePhotoKB:1e12,downloadsPerPhoto:1e12,analysisAttemptsPerPhoto:1e12,teamDeploymentsPerDay:1e12});
        expect(b.newStorageMiB).toBeLessThanOrEqual(300000);
        expect(Number.isFinite(b.uncachedDownloadGiBUpper)).toBe(true);
        expect(b.notes.join(' ')).toContain('하루 100회');
    });
    it('makes clear it excludes current usage, other provider traffic and AI costs',()=>{
        const x=estimateFreeTierCapacity(DEFAULT_FREE_TIER_SCENARIO);
        expect(x.notes.join(' ')).toContain('실제 운영 사용량');
        expect(x.notes.join(' ')).toContain('외부 AI');
    });
    it('renders an explicitly manual scenario with Hobby non-commercial restriction, not a fake meter',()=>{
        const html=renderToStaticMarkup(React.createElement(FreeTierCapacityPlanner));
        expect(html).toContain('무료 운영 용량 계획');
        expect(html).toContain('실시간 사용량 아님');
        expect(html).toContain('개인·비상업적');
        expect(html).toContain('협력사 안전관리비');
        expect(html).toContain('사진·배포 계획 직접 계산');
        expect(html).not.toContain('정확한 남은 무료량');
    });
});

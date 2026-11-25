import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFieldPhotoLifecycleStages, type FieldPhotoLifecycleInput } from '../lib/inspector/fieldPhotoLifecycle';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const options = (overrides: Partial<FieldPhotoLifecycleInput> = {}): FieldPhotoLifecycleInput => ({
    photoCount: 1,
    localStoreAvailable: true,
    photoPending: false,
    photoSaving: false,
    invalidStoredPhoto: false,
    sharing: false,
    shareResult: null,
    ...overrides,
});

describe('L08 field photo lifecycle status derives only verified local events', () => {
    it('keeps local IndexedDB separate from phone gallery, server and site verification', () => {
        const stages = getFieldPhotoLifecycleStages(options());
        expect(stages.map(stage => stage.key)).toEqual(['local', 'handoff', 'receipt', 'review']);
        expect(stages[0].status).toContain('브라우저 보관');
        expect(stages[0].detail).toContain('휴대전화 사진첩');
        expect(stages[1].status).toBe('공유 시도 전');
        expect(stages[2].status).toBe('수신 기록 없음');
        expect(stages[3].status).toBe('별도 점검 필요');
        expect(stages[3].detail).toContain('자동 연결되지 않습니다');
    });
    it('distinguishes save-in-progress, failed new photo and inaccessible store', () => {
        expect(getFieldPhotoLifecycleStages(options({ photoPending: true, photoSaving: true }))[0].status).toBe('새 사진 보관 중');
        expect(getFieldPhotoLifecycleStages(options({ photoPending: true }))[0].status).toBe('새 사진 보관 재시도 필요');
        const missing = getFieldPhotoLifecycleStages(options({ localStoreAvailable: false, photoCount: 0 }))[0];
        expect(missing.status).toBe('사진함 읽기 확인 필요');
        expect(missing.detail).toContain('유무도 확정할 수 없습니다');
    });
    it('shows integrity discrepancy before any green local status', () => {
        const [local] = getFieldPhotoLifecycleStages(options({ invalidStoredPhoto: true }));
        expect(local.tone).toBe('review');
        expect(local.status).toContain('불일치');
    });
    it('does not confuse OS handoff with recipient receipt', () => {
        const stages = getFieldPhotoLifecycleStages(options({ shareResult: 'handed-off' }));
        expect(stages[1].status).toContain('수신 미확인');
        expect(stages[1].tone).toBe('ready');
        expect(stages[2].status).toBe('수신 기록 없음');
        expect(stages[3].status).toBe('별도 점검 필요');
    });
    it.each(['failed', 'cancelled', 'unsupported', 'files-unsupported'] as const)(
        'never marks an %s OS share as delivered', shareResult => {
            const stages = getFieldPhotoLifecycleStages(options({ shareResult }));
            expect(stages[1].status).toContain('미완료');
            expect(stages[1].tone).toBe('review');
        },
    );
    it('sharing in progress suppresses the prior handoff status', () => {
        const stages = getFieldPhotoLifecycleStages(options({ sharing: true, shareResult: 'handed-off' }));
        expect(stages[1].status).toContain('확인 중');
        expect(stages[1].status).not.toContain('수신 미확인');
    });
    it('wires real photo events and resets stale status on selected/metadata changes', () => {
        const page = read('pages/FieldCamera.tsx');
        const panel = read('components/inspector/FieldPhotoLifecyclePanel.tsx');
        expect(page).toContain('getFieldPhotoLifecycleStages({photoCount:photos.length');
        expect(page).toContain('setShareOutcome(result)');
        expect(page).toContain('setShareOutcome(null);},[selected,photos,activeId,site,location]');
        expect(page).toContain('<FieldPhotoLifecyclePanel stages={lifecycleStages}/>');
        expect(panel).toContain('data-psi-photo-lifecycle="true"');
        expect(panel).toContain('data-stage={stage.key}');
        expect(panel).toContain('{stage.detail}');
        expect(read('pages/field-camera.css')).toContain('.field-camera-lifecycle-grid');
        const logic = read('lib/inspector/fieldPhotoLifecycle.ts');
        expect(logic).not.toMatch(/fetch\s*\(|setInterval\s*\(|indexedDB\.|localStorage|sessionStorage/i);
        expect(panel).not.toMatch(/fetch\s*\(|setInterval\s*\(|indexedDB\.|localStorage|sessionStorage/i);
    });
});

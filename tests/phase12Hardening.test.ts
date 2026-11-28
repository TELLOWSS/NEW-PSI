import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    assertHarnessReanalysisAllowed,
    buildHarnessApprovalDecision,
    HarnessTransitionError,
} from '../lib/server/harness/router';
import {
    enqueueNexusOfflineMutation,
    flushNexusOfflineQueue,
    readNexusOfflineQueue,
    resetNexusOfflineQueue,
} from '../utils/nexusOfflineQueue';
import {
    enqueueTrainingSubmission,
    flushQueuedTrainingSubmissions,
    listQueuedTrainingSubmissions,
    removeQueuedTrainingSubmission,
} from '../utils/trainingSubmissionQueue';
import { exportAccidentRecordsToCsv } from '../utils/accidentBigData';
import {
    PSI_REGISTERED_INDEXED_DBS,
    PSI_OPERATIONAL_LOCAL_STORAGE_KEYS,
    purgeAllRegisteredAppStorage,
} from '../utils/storageRegistry';
import type { AccidentBigDataRecord } from '../types';

const readWorkspaceFile = (relPath: string): string =>
    readFileSync(resolve(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');

describe('Phase 1 + Phase 2 security, integrity & reliability hardening', () => {
    beforeEach(() => {
        resetNexusOfflineQueue();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('P0-2: preserves queued offline items when Supabase session is active without serverSender and serializes concurrent flushes', async () => {
        enqueueNexusOfflineMutation(
            {
                kind: 'pipeline_case',
                siteId: 'SITE-TEST',
                recordId: 'CASE-P02-01',
                summary: '오프라인 보존 검증',
            },
            '2026-11-28T08:00:00Z',
        );

        let sentCount = 0;
        const [first, second] = await Promise.all([
            flushNexusOfflineQueue(async () => {
                await new Promise((r) => setTimeout(r, 15));
                sentCount += 1;
            }),
            flushNexusOfflineQueue(async () => {
                sentCount += 10;
            }),
        ]);
        expect(sentCount).toBe(1);
        expect(first.flushedCount).toBe(1);
        expect(second.flushedCount).toBe(1);

        resetNexusOfflineQueue();
        enqueueNexusOfflineMutation(
            {
                kind: 'equipment_photo',
                siteId: 'SITE-TEST',
                recordId: 'CASE-P02-02',
                summary: '세션 활성 + serverSender 미연결 시 큐 보존',
            },
            '2026-11-28T08:05:00Z',
        );

        vi.stubGlobal('navigator', { onLine: true });
        vi.doMock('../lib/supabaseClient', () => ({
            isSupabaseConfigured: true,
            supabase: {
                auth: {
                    getSession: async () => ({ data: { session: { access_token: 'active-token' } } }),
                },
            },
        }));

        const { syncNexusOfflineQueueWithServer } = await import('../utils/nexusSyncEngine');
        const telemetry = await syncNexusOfflineQueueWithServer();
        expect(telemetry.syncedCount).toBe(0);
        expect(telemetry.pendingCount).toBe(1);
        expect(readNexusOfflineQueue()).toHaveLength(1);
    });

    it('P0-3: supports full harness request-reanalysis -> resume -> DONE/NEEDED lifecycle without permanent IN_PROGRESS lock', () => {
        const requested = buildHarnessApprovalDecision({
            action: 'request-reanalysis',
            currentDecision: 'IMMEDIATE_ATTENTION',
            currentWorkflowState: 'awaiting_manager_approval',
            currentApprovalState: 'PENDING',
            currentSecondPassStatus: 'NEEDED',
        });
        expect(requested.workflowState).toBe('manager_revised');
        expect(requested.secondPassStatus).toBe('NEEDED');

        expect(() =>
            assertHarnessReanalysisAllowed({
                currentWorkflowState: 'second_pass_analyzing',
                currentApprovalState: 'PENDING',
                currentSecondPassStatus: 'NEEDED',
            }),
        ).not.toThrow();

        expect(() =>
            assertHarnessReanalysisAllowed({
                currentWorkflowState: 'second_pass_analyzing',
                currentApprovalState: 'PENDING',
                currentSecondPassStatus: 'IN_PROGRESS',
            }),
        ).toThrow(HarnessTransitionError);

        const reanalyzeSource = readWorkspaceFile('lib/server/harness/handlers/reanalyze.ts');
        expect(reanalyzeSource).toContain("secondPassStatus: decisionResult.workflowState === 'completed' ? 'DONE' : 'NEEDED'");
    });

    it('P0-4: enforces homonym LIMIT 2 guard and rate limiting in send-report-message handler', () => {
        const source = readWorkspaceFile('lib/server/admin/send-report-message.ts');
        expect(source).toContain('.limit(2)');
        expect(source).toContain('동명이인');
        expect(source).toContain("scope: 'admin.send-report-message'");
        expect(source).toContain('createSupabaseServerClient()');
    });

    it('P0-5: uses valid single-escaped ISO timestamp cursor regex in inspector global-action-register', () => {
        const source = readWorkspaceFile('lib/server/admin/inspector.ts');
        expect(source).toContain('!/^\\d{4}-\\d{2}-\\d{2}T[\\d:.]+(?:Z|\\+00:00)$/.test(body.before)');
        expect(source).not.toContain('\\\\d{4}');
        const isoRegex = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|\+00:00)$/;
        expect(isoRegex.test('2026-11-28T09:00:00.000Z')).toBe(true);
        expect(isoRegex.test('2026-11-28T09:00:00+00:00')).toBe(true);
    });

    it('P0-7: signals data-psi-mounted in useEffect and avoids innerHTML in bootstrap fatal handler', () => {
        const source = readWorkspaceFile('index.tsx');
        expect(source).toContain('const BootstrapMountSignal');
        expect(source).toContain("document.documentElement.dataset.psiMounted = '1'");
        expect(source).toContain('<BootstrapMountSignal>');
        expect(source).not.toMatch(/innerHTML\s*=/);
        expect(source).toContain('.textContent =');
    });

    it('P0-9: scopes print #root hide rule and keeps single-escaped responsive utility selector in workspaces CSS', () => {
        const stylesSource = readWorkspaceFile('styles.css');
        const workspaceCssSource = readWorkspaceFile('styles/psi-platform-workspaces.css');
        expect(stylesSource).toContain('body:has(> .report-print-container) #root');
        expect(workspaceCssSource).toContain('.lg\\:block');
        expect(workspaceCssSource).not.toContain('.lg\\\\:block');
    });

    it('P1-B2: lists in-memory fallback submissions and serializes concurrent training queue flushes', async () => {
        const submission = await enqueueTrainingSubmission({
            sessionId: 'sess-p1b2',
            workerId: 'worker-p1b2',
        });
        expect(submission.id).toBeTruthy();

        const listed = await listQueuedTrainingSubmissions();
        expect(listed.some((item) => item.id === submission.id)).toBe(true);

        let sendCalls = 0;
        const [res1, res2] = await Promise.all([
            flushQueuedTrainingSubmissions(async () => {
                await new Promise((r) => setTimeout(r, 15));
                sendCalls += 1;
                return 'accepted';
            }),
            flushQueuedTrainingSubmissions(async () => {
                sendCalls += 10;
                return 'accepted';
            }),
        ]);
        expect(sendCalls).toBe(1);
        expect(res1.accepted).toBe(1);
        expect(res2.accepted).toBe(1);

        await removeQueuedTrainingSubmission(submission.id);
    });

    it('P1-F4: neutralizes CSV formula injection in accident big-data export and purges registered app storage keys', async () => {
        const maliciousRecord: AccidentBigDataRecord = {
            id: 'acc-1',
            occurredDate: '2026-11-28',
            timeSlot: '오전',
            sourceContractor: '=cmd|"/C calc"!A0',
            siteName: '+SUM(1,2)',
            jobField: '철근',
            workStage: '설치·조립',
            workTask: '-1+1',
            hazardType: '추락',
            severity: '중대재해',
            causingAgent: '@SUM(A1)',
            summary: '일반 요약',
            directCause: '직접 원인',
            rootCause: '근본 원인',
            preventionMeasure: '예방 대책',
            preWorkCheckpoints: ['점검1'],
            educationKeywords: ['키워드1'],
            sourceAiProvider: 'manual',
            sourceFormatNote: 'test-fixture',
            piiMasked: true,
            importedAt: '2026-11-28T00:00:00Z',
            fingerprint: 'fp-acc-1',
        };
        const csv = exportAccidentRecordsToCsv([maliciousRecord]);
        expect(csv).toContain('"\t=cmd|""/C calc""!A0"');
        expect(csv).toContain('"\t+SUM(1,2)"');
        expect(csv).toContain('"\t-1+1"');
        expect(csv).toContain('"\t@SUM(A1)"');

        expect(PSI_REGISTERED_INDEXED_DBS).toEqual(
            expect.arrayContaining([
                'PSI_Enterprise_V4',
                'psi-offline-queue',
                'psi-inspector-local-records',
                'psi-field-camera',
            ]),
        );

        const backingStore = new Map<string, string>([
            [PSI_OPERATIONAL_LOCAL_STORAGE_KEYS[0], '[]'],
            ['PSI_evidence_sample_1', '{"ok":true}'],
            ['psi_theme_mode', 'light'],
        ]);
        const mockLocalStorage = {
            get length() {
                return backingStore.size;
            },
            key(index: number) {
                return Array.from(backingStore.keys())[index] ?? null;
            },
            getItem(k: string) {
                return backingStore.get(k) ?? null;
            },
            setItem(k: string, v: string) {
                backingStore.set(k, v);
            },
            removeItem(k: string) {
                backingStore.delete(k);
            },
        };
        vi.stubGlobal('window', {
            localStorage: mockLocalStorage,
            dispatchEvent: vi.fn(),
        });

        await purgeAllRegisteredAppStorage({ skipPrimaryDb: true });
        expect(backingStore.has(PSI_OPERATIONAL_LOCAL_STORAGE_KEYS[0])).toBe(false);
        expect(backingStore.has('PSI_evidence_sample_1')).toBe(false);
        expect(backingStore.get('psi_theme_mode')).toBe('light');
    });
});

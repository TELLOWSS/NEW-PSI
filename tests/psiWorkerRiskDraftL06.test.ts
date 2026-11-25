import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PSI_FORM_QUESTIONS } from '../config/psiFormMaster';
import { checkWorkerRiskDraft, emptyWorkerRiskDraft, printableWorkerRiskDraft } from '../utils/workerRiskDraftL06';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('L06 Q1-Q5 worker self-writing pilot without submission', () => {
    it('follows the existing five-question form master without introducing Q6', () => {
        expect(PSI_FORM_QUESTIONS.map(question => question.key)).toEqual(['Q1','Q2','Q3','Q4','Q5']);
        const draft = emptyWorkerRiskDraft();
        expect(Object.keys(draft.answers)).toEqual(['Q1','Q2','Q3','Q4','Q5']);
        expect(checkWorkerRiskDraft(draft).missing).toEqual(['Q1','Q2','Q3','Q4','Q5']);
    });

    it('accepts self-reported single-character Q3 but no unfilled Q1, Q2, Q4, Q5', () => {
        const draft = emptyWorkerRiskDraft();
        draft.grade = '상';
        draft.answers.Q3 = '상';
        let result = checkWorkerRiskDraft(draft);
        expect(result.completedCount).toBe(1);
        expect(result.missing).toEqual(['Q1','Q2','Q4','Q5']);
        for (const key of ['Q1','Q2','Q4','Q5'] as const) draft.answers[key] = '확인';
        result = checkWorkerRiskDraft(draft);
        expect(result.readyForReview).toBe(true);
        expect(result.completedCount).toBe(5);
        expect(result.submitted).toBe(false);
        expect(result.serverReceived).toBe(false);
        expect(result.approved).toBe(false);
    });

    it('prints only the entered five answers without adding identity or approving a risk level', () => {
        const draft = emptyWorkerRiskDraft();
        draft.answers.Q1 = '슬라브 보 철근';
        draft.grade = '중';
        draft.gradeReason = '상부 낙하 우려';
        const rows = printableWorkerRiskDraft(draft);
        expect(rows).toHaveLength(5);
        expect(rows[0].answer).toBe('슬라브 보 철근');
        expect(rows[2].answer).toBe('중 · 상부 낙하 우려');
        expect(rows.map(item => item.key)).toEqual(['Q1','Q2','Q3','Q4','Q5']);
    });

    it('prints only the L06 trial and does not unhide the production report root', () => {
        const ui = source('pages/WorkerRiskDraft.tsx');
        const css = source('styles.css');
        const chromium = source('scripts/verify-psi-l06-worker-draft.mjs');
        expect(css).toContain('#root {');
        expect(css).toContain('display: none !important;');
        expect(ui).toContain("import '../styles.css';");
        expect(ui).toContain('className="psi-l06-worker-draft ');
        expect(ui).toContain('psi-l06-review-print');
        expect(ui).toContain('psi-l06-review-disclaimer');
        expect(css).toContain('#root:has(.psi-l06-worker-draft)');
        expect(css).toContain('display: block !important;');
        expect(css).toContain('.psi-l06-review-actions');
        expect(css).toContain('L24: only the L06 unauthenticated practice route');
        expect(chromium).toContain('await page.pdf(');
        expect(chromium).toContain('assert.equal(pdf.numPages, 1,');
        expect(chromium).toContain('a4-five-question-long-trial.pdf');
        expect(chromium).toContain('longPdf.numPages > 1');
        expect(chromium).toContain("normalizedLongText.includes('END' + key)");
        expect(chromium).toContain("normalizedLongText.includes('정식제출이아닙니다')");
        expect(chromium).toContain('for (const key of [\'Q1\', \'Q2\', \'Q3\', \'Q4\', \'Q5\'])');
        expect(ui).toContain('인쇄한 종이도 정식 제출이 아닙니다.');
    });

    it('refuses partial Ctrl+P trial answers while keeping an A4 non-submission notice', () => {
        const ui = source('pages/WorkerRiskDraft.tsx');
        const css = source('styles.css');
        const browser = source('scripts/verify-psi-l06-worker-draft.mjs');
        expect(ui).toContain('psi-l06-incomplete-print-warning hidden');
        expect(ui).toContain('psi-l06-edit-form space-y-4');
        expect(ui).toContain('작성 중인 연습 기록은 인쇄할 수 없습니다');
        expect(ui).toContain('정식 제출이 아닙니다');
        expect(css).toContain('.psi-l06-worker-draft .psi-l06-edit-form');
        expect(css).toContain('.psi-l06-worker-draft .psi-l06-incomplete-print-warning');
        expect(browser).toContain('a4-unfinished-trial-no-answers.pdf');
        expect(browser).toContain('hiddenEditForm: true, visibleWarning: true');
        expect(browser).toContain("!unfinishedText.includes('가설작업발판설치')");
        expect(browser).toContain("unfinishedText.includes('정식제출이아닙니다')");
    });

    it('requires explicit cancelable confirmation before discarding in-memory answers', () => {
        const ui = source('pages/WorkerRiskDraft.tsx');
        const browser = source('scripts/verify-psi-l06-worker-draft.mjs');
        expect(ui).toContain('const [resetPending, setResetPending] = useState(false)');
        expect(ui).toContain('role="group" aria-label="작성 내용 초기화 확인"');
        expect(ui).toContain('aria-expanded={resetPending}');
        expect(ui).toContain('초기화 후에는 되돌릴 수 없습니다.');
        expect(ui).toContain('취소하고 계속 작성');
        expect(ui).toContain('초기화 확정');
        expect(ui).toContain('onClick={reset}');
        expect(ui).toContain("event.key === 'Escape'");
        expect(ui).toContain('resetCancelRef.current?.focus()');
        expect(browser).toContain('First reset tap must preserve typed Q1');
        expect(browser).toContain('Cancel must preserve Q1');
        expect(browser).toContain('Escape must dismiss reset confirmation');
        expect(browser).toContain('Long Q1-Q5 record must survive until the explicit confirmation');
    });

    it('guards unsaved browser navigation without adding persistence or a fake receipt', () => {
        const ui = source('pages/WorkerRiskDraft.tsx');
        const chromium = source('scripts/verify-psi-l06-worker-draft.mjs');
        expect(ui).toContain('const hasInMemoryAnswers = PSI_FORM_QUESTIONS.some(');
        expect(ui).toContain("draft.gradeReason.trim().length > 0");
        expect(ui).toContain('Boolean(draft.grade)');
        expect(ui).toContain("window.addEventListener('beforeunload', warnBeforeUnload)");
        expect(ui).toContain("window.removeEventListener('beforeunload', warnBeforeUnload)");
        expect(ui).toContain("event.returnValue = '';");
        expect(ui).toContain('모바일에서는 경고가 생략될 수 있습니다');
        expect(chromium).toContain('const probeUnloadWarning = () => page.evaluate(');
        expect(chromium).toContain('Blank practice form must not block browser navigation');
        expect(chromium).toContain('Canceling reset must preserve the unload warning');
        expect(chromium).toContain('After confirmed clear, navigation must no longer be warned');
        expect(chromium).toContain('Final confirmed clear must release the beforeunload guard');
        expect(ui).not.toMatch(/window\.confirm|window\.alert|navigator\.sendBeacon|localStorage|sessionStorage|indexedDB/);
    });

    it('shows an explicit unsaved status on narrow screens but excludes it from A4 and confirms real Chromium close', () => {
        const ui = source('pages/WorkerRiskDraft.tsx');
        const css = source('styles.css');
        const browser = source('scripts/verify-psi-l06-worker-draft.mjs');
        expect(ui).toContain('hasInMemoryAnswers && (');
        expect(ui).toContain('data-testid="l06-unsaved-status"');
        expect(ui).toContain('임시 작성 중 · 저장되지 않음');
        expect(ui).toContain('검토 후 인쇄해도 정식 제출·접수는 아닙니다');
        expect(css).toContain('.psi-l06-worker-draft .psi-l06-unsaved-status,');
        expect(browser).toContain('390-unsaved-warning.png');
        expect(browser).toContain('hiddenUnsavedStatus: true');
        expect(browser).toContain('unsavedHidden: true');
        expect(browser).toContain("nativePage.goto(host + '/worker-risk-draft?leave-attempt=1'");
        expect(browser).toContain("nativeDialogTypes.includes('beforeunload')");
        expect(browser).toContain('Dismissed real browser navigation must preserve the in-memory Q1 answer');
        expect(browser).toContain("nativePage.goto(host + '/worker-risk-draft?after-confirmed-reset=1'");
        expect(browser).toContain('L29 final confirmed reset must clear the unsaved warning');
    });

    it('returns accessible keyboard focus to the review heading and persistent reset trigger', () => {
        const ui = source('pages/WorkerRiskDraft.tsx');
        const chromium = source('scripts/verify-psi-l06-worker-draft.mjs');
        expect(ui).toContain('const reviewHeadingRef = useRef<HTMLHeadingElement>(null)');
        expect(ui).toContain('const resetTriggerRef = useRef<HTMLButtonElement>(null)');
        expect(ui).toContain('if (review) reviewHeadingRef.current?.focus()');
        expect(ui).toContain('resetTriggerRef.current?.focus({ preventScroll: true })');
        expect(ui).toContain('ref={reviewHeadingRef} tabIndex={-1}');
        expect(ui).toContain('ref={resetTriggerRef} type="button"');
        expect(ui).toContain('onClick={cancelReset}');
        expect(ui).toContain("event.stopPropagation(); cancelReset();");
        expect(chromium).toContain("document.activeElement?.textContent?.trim() === '내가 작성한 내용 확인'");
        expect(chromium).toContain('L30 review heading must accept programmatic focus');
        expect(chromium).toContain('L30 cancelled confirmation must return keyboard focus');
        expect(chromium).toContain('L30 Escape must restore reset button focus');
        expect(chromium).toContain('L30 confirmed reset must retain a meaningful keyboard focus');
    });

    it('describes required-field validation and refocuses Q1/Q3 without inventing a submission', () => {
        const ui = source('pages/WorkerRiskDraft.tsx');
        const chromium = source('scripts/verify-psi-l06-worker-draft.mjs');
        expect(ui).toContain('const [invalidQuestion, setInvalidQuestion] = useState<PsiQuestionKey | null>(null)');
        expect(ui).toContain('const showCurrentValidation = invalidQuestion === currentQuestion.key');
        expect(ui).toContain('setInvalidQuestion(currentQuestion.key)');
        expect(ui).toContain('setInvalidQuestion(status.missing[0])');
        expect(ui).toContain('aria-invalid={showCurrentValidation || undefined}');
        expect(ui).toContain("aria-describedby={showCurrentValidation ? 'psi-l06-error-Q3' : undefined}");
        expect(ui).toContain("aria-describedby={showCurrentValidation ? 'psi-l06-error-' + question.key : undefined}");
        expect(ui).toContain('data-testid="l06-question-error"');
        expect(ui).toContain('Q3 위험수준은 상·중·하 중 하나를 선택해 주세요.');
        expect(ui).toContain('문항을 두 글자 이상 구체적으로 작성해 주세요.');
        expect(chromium).toContain('L31 missing Q1 should focus its required textarea');
        expect(chromium).toContain('L31 one-character Q1 must stay invalid');
        expect(chromium).toContain('L31 missing Q3 should focus its self-rated risk select');
        expect(chromium).toContain('L31 choosing a self-reported grade clears the warning');
    });

    it('audits six actual Chromium widths, touch controls and visible keyboard focus without changing submission rules', () => {
        const css = source('styles.css');
        const chromium = source('scripts/verify-psi-l06-worker-draft.mjs');
        expect(css).toContain('L32: keyboard focus is visible across the worker practice form');
        expect(css).toContain('.psi-l06-worker-draft :is(button, textarea, select):focus-visible');
        expect(css).toContain('outline: 3px solid #4338ca;');
        expect(css).toContain('.psi-l06-worker-draft [aria-invalid="true"]:focus-visible');
        expect(chromium).toContain('const responsiveWidths = [320, 360, 390, 768, 1024, 1440]');
        expect(chromium).toContain('async (responsivePage, width, state)');
        expect(chromium).toContain('result.scrollWidth <= width + 1');
        expect(chromium).toContain('button.height >= 44');
        expect(chromium).toContain("await responsivePage.keyboard.press('Tab')");
        expect(chromium).toContain('keyboardFocus.outlineWidth >= 3');
        expect(chromium).toContain("await inspectReflow(responsivePage, width, 'review')");
        expect(chromium).toContain("await inspectReflow(responsivePage, width, 'reset-confirmation')");
        expect(chromium).toContain('auditedRequests, []');
        expect(chromium).toContain('320-unsaved.png');
        expect(chromium).toContain("width + '-review.png'");
    });

    it('remains explicitly identity-free, in-memory and unconnected to submission APIs', () => {
        const ui = source('pages/WorkerRiskDraft.tsx');
        const helper = source('utils/workerRiskDraftL06.ts');
        const entry = source('index.tsx');
        expect(entry).toContain("'/worker-risk-draft'");
        expect(entry).toContain('<WorkerRiskDraft />');
        expect(ui).toContain('저장·제출 기능 없음');
        expect(ui).toContain('정식 근로자 제출');
        expect(ui).toContain('작성 내용 확인');
        expect(ui).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|indexedDB|localStorage|sessionStorage|supabase|worker\.authenticate|requestTenantWorkspace/);
        expect(helper).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|indexedDB|localStorage|sessionStorage|supabase/);
    });
});

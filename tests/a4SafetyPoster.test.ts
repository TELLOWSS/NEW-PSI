import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import A4SafetyPoster, {
    buildA4SafetyPosterModel,
    type A4SafetyPosterTranslation,
    type A4SafetyPosterTranslationLabels,
} from '../components/tbm/A4SafetyPoster';
import { TRAINING_LANGUAGE_OPTIONS } from '../utils/constructionTrainingTranslation';
import type { TbmEducationDraft } from '../utils/tbmEducationStudio';

const createDraft = (overrides: Partial<TbmEducationDraft> = {}): TbmEducationDraft => ({
    month: '2026-08',
    workType: '철골',
    title: '2026년 8월 철골 위험성평가 교육자료',
    coreMessage: '작업 전 작업발판과 추락방지 시설을 확인하고 조건이 달라지면 즉시 멈춥니다.',
    opening: '예정 작업의 위험요인과 안전조치를 작업 전에 함께 확인합니다.',
    risks: [],
    videoScenes: [{
        id: 'video-opening',
        seconds: 300,
        title: '핵심 안전교육',
        narration: '작업 전 위험을 확인합니다.',
        visualGuide: '핵심 문구 표시',
    }],
    accidentCases: [],
    focusPoints: [
        '작업발판과 개구부 덮개의 고정 상태를 직접 확인합니다.',
        '작업구역과 장비 이동 동선을 분리합니다.',
        '현장 조건이 바뀌면 작업을 멈추고 관리자에게 알립니다.',
    ],
    notices: ['작업구역 변경사항을 교육 전에 최종 확인합니다.'],
    checklist: [
        '오늘 수행할 작업과 순서를 확인합니다.',
        '주요 위험이 발생하는 위치를 확인합니다.',
        '안전시설과 장비 상태를 직접 확인합니다.',
    ],
    confirmationQuestions: [],
    closingCommitment: '위험을 발견하면 즉시 멈추고 관리자와 위험성평가를 다시 확인합니다.',
    sourceCount: 2,
    generatedAt: '2026-07-28T00:00:00.000Z',
    ...overrides,
});

describe('A4SafetyPoster', () => {
    it('switches to field-focus cards without inventing high-grade risks', () => {
        const model = buildA4SafetyPosterModel(createDraft(), 'ko-KR', 'balanced');

        expect(model.priorityMode).toBe('field-focus');
        expect(model.priorityCards).toHaveLength(3);
        expect(model.priorityCards.every((card) => card.source === null)).toBe(true);
        expect(model.priorityCards.map((card) => card.body).join(' ')).toContain('작업발판');
        expect(model.priorityCards.map((card) => card.title).join(' ')).not.toContain('상등급 위험');
    });

    it('shows only confirmed meeting risks and labels their bars as evidence strength', () => {
        const draft = createDraft({
            risks: [{
                id: 'risk-1',
                risk: '개구부 추락',
                action: '개구부 덮개와 안전난간 고정 상태를 확인합니다.',
                evidenceLabels: ['회의자료 상등급 8월 위험성평가.pdf'],
                score: 8,
                owner: '안전관리자',
                managerConfirmed: true,
            }, {
                id: 'risk-unconfirmed',
                risk: '일반 추천 위험',
                action: '현장을 확인합니다.',
                evidenceLabels: ['근로자 설문'],
                score: 99,
                owner: '',
                managerConfirmed: false,
            }],
        });

        const model = buildA4SafetyPosterModel(draft, 'ko-KR', 'balanced');

        expect(model.priorityMode).toBe('high-grade-risks');
        expect(model.priorityCards).toHaveLength(1);
        expect(model.priorityCards[0].title).toBe('개구부 추락');
        expect(model.priorityCards[0].evidenceSegments).toBe(4);
        expect(model.labels.evidenceStrength).toBe('근거 강도');
        expect(model.labels.evidenceStrength).not.toContain('위험도');
    });

    it('renders PPE only when a specific item is stated in source text', () => {
        const genericPpeModel = buildA4SafetyPosterModel(createDraft({
            focusPoints: ['작업에 맞는 보호구 상태를 확인합니다.'],
            checklist: [],
            notices: [],
        }), 'ko-KR', 'balanced');
        const explicitPpeModel = buildA4SafetyPosterModel(createDraft({
            focusPoints: ['안전모와 안전대를 올바르게 착용하고 체결 상태를 확인합니다.'],
        }), 'ko-KR', 'balanced');

        expect(genericPpeModel.ppeItems).toHaveLength(0);
        expect(explicitPpeModel.ppeItems.map((item) => item.type)).toEqual(['helmet', 'harness']);
    });

    it('uses block-level translations without losing the confirmed-risk relationship', () => {
        const draft = createDraft({
            risks: [{
                id: 'risk-1',
                risk: '추락',
                action: '안전난간을 확인합니다.',
                evidenceLabels: ['회의자료 상등급 정기회의.pptx'],
                score: 5,
                owner: '관리자',
                managerConfirmed: true,
            }],
        });
        const translation: A4SafetyPosterTranslation = {
            title: 'August Steel Work Safety',
            opening: 'Check the work conditions together.',
            coreMessage: 'Stop work immediately when conditions change.',
            risks: [{ risk: 'Fall', action: 'Check guardrails before work.', owner: 'Supervisor' }],
            focus: ['Separate people from equipment routes.'],
            notices: ['Confirm changes before the briefing.'],
            closingCommitment: 'Stop, report and reassess.',
        };

        const model = buildA4SafetyPosterModel(draft, 'en-US', 'balanced', translation);

        expect(model.title).toBe('August Steel Work Safety');
        expect(model.priorityCards[0]).toMatchObject({
            title: 'Fall',
            body: 'Check guardrails before work.',
            owner: 'Supervisor',
        });
        expect(model.priorityCards[0].source?.id).toBe('risk-1');
    });

    it('emits fixed A4 and overflow-measurement markers for print QA', () => {
        const shortDraft = createDraft({
            title: '안전교육',
            opening: '작업 전 확인',
            coreMessage: '위험하면 즉시 멈춥니다.',
            focusPoints: ['발판 고정 확인'],
            notices: [],
            checklist: [],
            closingCommitment: '멈추고 보고합니다.',
        });
        const html = renderToStaticMarkup(React.createElement(A4SafetyPoster, {
            draft: shortDraft,
            languageCode: 'ko-KR',
            targetPeriodLabel: '2026. 8. 1.~8. 31.',
            fitMode: 'spacious',
            videoDuration: 300,
        }));

        expect(html).toContain('data-a4-safety-poster="true"');
        expect(html).toContain('data-overflow-check="true"');
        expect(html).toContain('width:210mm');
        expect(html).toContain('height:297mm');
        expect(html).toContain('data-content-volume="short"');
    });

    it.each([
        ['uz-UZ', 'ISHCHILAR UCHUN BIR SAHIFALIK XAVFSIZLIK', 'TO‘XTANG', 'O‘zbekcha', 'Noto Sans'],
        ['kk-KZ', 'ЖҰМЫСШЫҒА АРНАЛҒАН БІР БЕТ ҚАУІПСІЗДІК', 'ТОҚТАҢЫЗ', 'Қазақ тілі', 'Segoe UI'],
        ['ne-NP', 'कामदारका लागि एक-पृष्ठ सुरक्षा', 'रोक्नुहोस्', 'नेपाली', 'Noto Sans Devanagari'],
        ['my-MM', 'အလုပ်သမားများအတွက် တစ်မျက်နှာ ဘေးကင်းရေး', 'ရပ်ပါ', 'မြန်မာဘာသာ', 'Noto Sans Myanmar'],
        ['fil-PH', 'ISANG-PAHINANG KALIGTASAN PARA SA MANGGAGAWA', 'HUMINTO', 'Wikang Filipino', 'Noto Sans'],
        ['hi-IN', 'कामगारों के लिए एक-पृष्ठ सुरक्षा', 'रुकें', 'हिन्दी', 'Noto Sans Devanagari'],
        ['bn-BD', 'শ্রমিকের জন্য এক পাতার নিরাপত্তা নির্দেশিকা', 'থামুন', 'বাংলা', 'Noto Sans Bengali'],
        ['ur-PK', 'کارکن کے لیے ایک صفحے کی حفاظتی ہدایت', 'رکیں', 'اردو', 'Noto Sans Arabic'],
        ['si-LK', 'සේවකයන් සඳහා එක් පිටුවක ආරක්ෂක මාර්ගෝපදේශය', 'නවත්වන්න', 'සිංහල', 'Noto Sans Sinhala'],
    ])('uses native fixed poster copy and typography for %s', (code, badge, stop, languageName, fontName) => {
        const draft = createDraft();
        const model = buildA4SafetyPosterModel(draft, code, 'balanced');
        const html = renderToStaticMarkup(React.createElement(A4SafetyPoster, {
            draft,
            languageCode: code,
            targetPeriodLabel: '2026-08',
            fitMode: 'balanced',
            videoDuration: 300,
        }));

        expect(model.labels.posterBadge).toBe(badge);
        expect(model.labels.stop).toBe(stop);
        expect(model.labels.posterBadge).not.toBe('WORKER SAFETY ONE-PAGER');
        expect(model.labels.stop).not.toBe('STOP');
        expect(html).toContain(languageName);
        expect(html).toContain(fontName);
        if (code === 'ur-PK') expect(html).toContain('dir="rtl"');
    });

    it('preserves long safety sentences so overflow QA can block export instead of truncating content', () => {
        const longCoreMessage = '작업구역의 안전난간, 개구부 덮개, 작업발판 고정 상태를 작업 시작 전에 직접 확인하고, 장비 위치나 작업 순서 또는 인원이 달라지면 즉시 작업을 멈춘 뒤 관리자에게 보고하여 위험성평가와 안전조치를 다시 확인합니다.'.repeat(3);
        const draft = createDraft({ coreMessage: longCoreMessage });
        const model = buildA4SafetyPosterModel(draft, 'ko-KR', 'dense');
        const html = renderToStaticMarkup(React.createElement(A4SafetyPoster, {
            draft,
            languageCode: 'ko-KR',
            targetPeriodLabel: '2026-08',
            fitMode: 'dense',
            videoDuration: 300,
        }));

        expect(model.coreMessage).toBe(longCoreMessage);
        expect(model.coreMessage).not.toContain('…');
        expect(html).toContain(longCoreMessage);
        expect(html).toContain('data-overflow-check="true"');
    });

    it('renders every fixed label, PPE notice and minute unit without English fallback in all supported worker languages', () => {
        const draft = createDraft({
            focusPoints: ['안전모를 착용하고 고정 상태를 확인합니다.'],
            sourceCount: 0,
        });
        const englishLabels = buildA4SafetyPosterModel(draft, 'en-US', 'balanced').labels;
        const englishEntries = Object.entries(englishLabels) as Array<
            [keyof A4SafetyPosterTranslationLabels, string]
        >;

        expect(TRAINING_LANGUAGE_OPTIONS).toHaveLength(18);
        for (const { code } of TRAINING_LANGUAGE_OPTIONS) {
            const model = buildA4SafetyPosterModel(draft, code, 'balanced');
            const html = renderToStaticMarkup(React.createElement(A4SafetyPoster, {
                draft,
                languageCode: code,
                targetPeriodLabel: '2026-08',
                fitMode: 'balanced',
                videoDuration: 300,
            }));

            expect(model.labels.educationVideo).not.toBe('');
            expect(model.labels.sourceCount).not.toBe('');
            expect(model.labels.ppeEvidenceOnly).not.toBe('');
            expect(model.labels.minuteUnit).not.toBe('');
            expect(html).toContain(model.labels.educationVideo);
            expect(html).toContain(`${model.labels.sourceCount} 0`);
            expect(html).toContain(`5 ${model.labels.minuteUnit}`);
            expect(html).toContain(model.labels.ppeEvidenceOnly);

            if (code === 'en-US') continue;
            for (const [key, englishValue] of englishEntries) {
                // STOP is an intentional universal mark on the Korean master, not a fallback.
                if (code === 'ko-KR' && key === 'stop') continue;
                expect(model.labels[key], `${code}.${key}`).not.toBe(englishValue);
            }
            expect(html).not.toContain('>5 min<');
            expect(html).not.toContain('>Video<');
            expect(html).not.toContain('>Sources 0<');
            expect(html).not.toContain('Only PPE explicitly stated in the source');
        }
    });

    it('renders all seven explicitly stated PPE items in the worker language without English PPE fallback', () => {
        const draft = createDraft({
            focusPoints: ['안전모, 안전대, 보호장갑, 보안경, 방진마스크, 안전화, 귀마개를 착용합니다.'],
        });
        const englishPpe = buildA4SafetyPosterModel(draft, 'en-US', 'balanced').ppeItems;

        expect(englishPpe).toHaveLength(7);
        for (const { code } of TRAINING_LANGUAGE_OPTIONS) {
            const model = buildA4SafetyPosterModel(draft, code, 'balanced');
            const html = renderToStaticMarkup(React.createElement(A4SafetyPoster, {
                draft,
                languageCode: code,
                targetPeriodLabel: '2026-08',
                fitMode: 'balanced',
                videoDuration: 300,
            }));

            expect(model.ppeItems).toHaveLength(7);
            for (const item of model.ppeItems) {
                expect(item.label).not.toBe('');
                expect(html).toContain(item.label);
                if (code === 'en-US') continue;
                const englishLabel = englishPpe.find((candidate) => candidate.type === item.type)?.label;
                expect(item.label, `${code}.${item.type}`).not.toBe(englishLabel);
                expect(html).not.toContain(`>${englishLabel}<`);
            }
        }
    });

    it('reverses both work-flow and emergency arrows for Urdu RTL reading order', () => {
        const html = renderToStaticMarkup(React.createElement(A4SafetyPoster, {
            draft: createDraft(),
            languageCode: 'ur-PK',
            targetPeriodLabel: '2026-08',
            fitMode: 'balanced',
            videoDuration: 300,
        }));

        expect(html).toContain('dir="rtl"');
        expect(html).toContain('←');
        expect(html).not.toContain('→');
    });
});

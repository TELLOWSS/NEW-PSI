import React, { useMemo, useState } from 'react';
import {
    DEFAULT_EXTERNAL_AI_LANGUAGES,
    EXTERNAL_AI_PROVIDERS,
    buildExternalAiPrompt,
    parseExternalAiResult,
    type ExternalAiProvider,
} from '../../utils/externalAiHandoff';
import {
    TRAINING_LANGUAGE_LABELS,
    type TrainingLanguageCode,
} from '../../utils/constructionTrainingTranslation';
import type { TbmEducationDraft, TbmEvidenceSource } from '../../utils/tbmEducationStudio';
import { CountryFlag } from '../shared/CountryFlag';

interface ExternalAiHandoffPanelProps {
    sources: TbmEvidenceSource[];
    month: string;
    workType: string;
    draft: TbmEducationDraft;
    onImport: (draft: TbmEducationDraft, translations: Record<string, string>) => void;
    onUseLocalDraft: () => void;
    onNotice: (message: string) => void;
}

const LANGUAGE_OPTIONS = (Object.keys(TRAINING_LANGUAGE_LABELS) as TrainingLanguageCode[])
    .filter((code) => code !== 'ko-KR');

export function ExternalAiHandoffPanel({
    sources,
    month,
    workType,
    draft,
    onImport,
    onUseLocalDraft,
    onNotice,
}: ExternalAiHandoffPanelProps) {
    const [languageCodes, setLanguageCodes] = useState<TrainingLanguageCode[]>(DEFAULT_EXTERNAL_AI_LANGUAGES);
    const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
    const [rawResult, setRawResult] = useState('');
    const [aiMode, setAiMode] = useState<'generation' | 'translation'>('generation');
    const prompt = useMemo(
        () => buildExternalAiPrompt({ sources, month, workType, languageCodes, draft, mode: aiMode }),
        [languageCodes, month, sources, workType, draft, aiMode],
    );

    const toggleLanguage = (code: TrainingLanguageCode) => {
        setLanguageCodes((current) =>
            current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
        );
    };

    const openProvider = async (provider: ExternalAiProvider) => {
        if (!privacyConfirmed) {
            onNotice('외부 AI로 보내기 전에 개인정보 포함 여부 확인을 체크해 주세요.');
            return;
        }

        const opened = window.open(EXTERNAL_AI_PROVIDERS[provider].url, '_blank');
        if (!opened) {
            onNotice('새 창이 차단되었습니다. 브라우저의 팝업 허용 후 다시 눌러 주세요.');
            return;
        }
        opened.opener = null;

        try {
            await navigator.clipboard.writeText(prompt);
            onNotice(`${EXTERNAL_AI_PROVIDERS[provider].label}를 열고 요청문을 복사했습니다. 새 창에서 붙여넣어 실행해 주세요.`);
        } catch {
            onNotice(`${EXTERNAL_AI_PROVIDERS[provider].label}를 열었습니다. 오른쪽 요청문을 직접 복사해 붙여넣어 주세요.`);
        }
    };

    const importResult = () => {
        if (!rawResult.trim()) {
            onNotice('AI가 반환한 결과를 먼저 붙여넣어 주세요.');
            return;
        }
        try {
            const result = parseExternalAiResult(rawResult, draft);
            onImport(result.draft, result.translations);
        } catch (error) {
            onNotice(error instanceof Error ? error.message : 'AI 결과를 읽지 못했습니다.');
        }
    };

    return (
        <div className="space-y-4 no-print">
            <section className="psi-enterprise-panel p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="psi-eyebrow">외부 AI 활용</p>
                        <h3 className="mt-2 text-xl font-black">자료는 여기서 정리하고, 초안 작성은 선택한 AI에서 진행합니다.</h3>
                        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 psi-copy-muted">
                            사용 중인 ChatGPT, Claude, Gemini 웹 계정을 활용할 수 있습니다. 개인정보를 확인한 뒤 바로가기를 누르면 교육자료 작성 요청문이 복사됩니다.
                        </p>
                    </div>
                    <button type="button" onClick={onUseLocalDraft} className="psi-button-secondary">
                        AI 없이 기본 초안 만들기
                    </button>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {[
                        ['1', '언어 선택', '필요한 번역 언어를 고릅니다.'],
                        ['2', 'AI에서 작성', '바로가기를 열고 복사된 요청문을 붙여넣습니다.'],
                        ['3', '결과 반영', 'AI 답변을 붙여넣어 교육자료에 반영합니다.'],
                    ].map(([step, title, description]) => (
                        <article key={step} className="psi-step-card">
                            <span>{step}</span>
                            <div><b>{title}</b><p>{description}</p></div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="psi-enterprise-panel p-5">
                    <h3 className="text-base font-black">AI 분석 및 번역 모드</h3>
                    <p className="mt-1 text-xs font-semibold psi-copy-muted">AI에 요청할 작업의 목적을 선택하세요.</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 mb-4">
                        <button
                            type="button"
                            onClick={() => setAiMode('generation')}
                            className={`min-h-11 rounded-xl px-3 py-2 text-xs font-black transition-colors ${
                                aiMode === 'generation'
                                    ? 'bg-blue-700 text-white shadow-md'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                            }`}
                        >
                            신규 초안 분석 및 번역
                        </button>
                        <button
                            type="button"
                            onClick={() => setAiMode('translation')}
                            className={`min-h-11 rounded-xl px-3 py-2 text-xs font-black transition-colors ${
                                aiMode === 'translation'
                                    ? 'bg-blue-700 text-white shadow-md'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                            }`}
                        >
                            기존 초안 유지 및 번역
                        </button>
                    </div>

                    <h3 className="text-base font-black">다국어 결과 선택</h3>
                    <p className="mt-1 text-xs font-semibold psi-copy-muted">다음 달 TBM 교육자료에 필요한 언어만 선택하세요.</p>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {LANGUAGE_OPTIONS.map((code) => (
                            <label key={code} className={`psi-choice-chip ${languageCodes.includes(code) ? 'is-selected' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={languageCodes.includes(code)}
                                    onChange={() => toggleLanguage(code)}
                                />
                                <span>
                                    <CountryFlag code={code} />
                                    {TRAINING_LANGUAGE_LABELS[code]}
                                </span>
                            </label>
                        ))}
                    </div>
                    <label className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                        <input
                            type="checkbox"
                            checked={privacyConfirmed}
                            onChange={(event) => setPrivacyConfirmed(event.target.checked)}
                            className="mt-1"
                        />
                        <span>자료에 불필요한 이름, 연락처, 주민번호 등 개인정보가 없는지 확인했습니다.</span>
                    </label>
                    <div className="mt-4 grid gap-2">
                        {(Object.entries(EXTERNAL_AI_PROVIDERS) as Array<[ExternalAiProvider, typeof EXTERNAL_AI_PROVIDERS[ExternalAiProvider]]>).map(([id, provider]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => void openProvider(id)}
                                disabled={!privacyConfirmed}
                                className={`psi-provider-button ${privacyConfirmed ? '' : 'cursor-not-allowed opacity-50'}`}
                            >
                                <span><b>{provider.label} 열기</b><small>{provider.description}</small></span>
                                <strong>{privacyConfirmed ? '복사 후 바로가기' : '개인정보 확인 필요'}</strong>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="psi-enterprise-panel p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-base font-black">AI에 전달할 요청문</h3>
                            <p className="mt-1 text-xs font-semibold psi-copy-muted">근거 자료 {sources.length}개가 반영되었습니다.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(prompt).then(
                                () => onNotice('AI 요청문을 복사했습니다.'),
                                () => onNotice('클립보드 복사가 차단되었습니다. 아래 내용을 직접 복사해 주세요.'),
                            )}
                            className="psi-button-secondary"
                        >
                            요청문 복사
                        </button>
                    </div>
                    <textarea readOnly value={prompt} rows={18} className="psi-input mt-4 w-full resize-y p-4 text-xs leading-5" aria-label="외부 AI 요청문" />
                </div>
            </section>

            <section className="psi-enterprise-panel p-5 sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-black">AI 작성 결과 가져오기</h3>
                        <p className="mt-1 text-xs font-semibold psi-copy-muted">AI 답변 전체를 붙여넣으면 교육자료 초안과 선택한 번역 결과를 반영합니다.</p>
                    </div>
                    <span className="psi-status-badge">반영 후 자유롭게 수정 가능</span>
                </div>
                <textarea
                    value={rawResult}
                    onChange={(event) => setRawResult(event.target.value)}
                    rows={12}
                    placeholder="AI가 작성한 결과 전체를 여기에 붙여넣으세요."
                    className="psi-input mt-4 w-full p-4 text-xs leading-5"
                    aria-label="외부 AI 작성 결과"
                />
                <button type="button" onClick={importResult} className="psi-button-primary mt-4 w-full">
                    교육자료 초안에 반영
                </button>
            </section>
        </div>
    );
}

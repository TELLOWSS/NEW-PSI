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
    const prompt = useMemo(
        () => buildExternalAiPrompt({ sources, month, workType, languageCodes }),
        [languageCodes, month, sources, workType],
    );

    const toggleLanguage = (code: TrainingLanguageCode) => {
        setLanguageCodes((current) =>
            current.includes(code)
                ? current.filter((item) => item !== code)
                : [...current, code],
        );
    };

    const openProvider = async (provider: ExternalAiProvider) => {
        if (!privacyConfirmed) {
            onNotice('외부 AI로 보내기 전에 개인정보 포함 여부 확인에 체크해 주세요.');
            return;
        }

        window.open(EXTERNAL_AI_PROVIDERS[provider].url, '_blank', 'noopener,noreferrer');
        try {
            await navigator.clipboard.writeText(prompt);
            onNotice(`${EXTERNAL_AI_PROVIDERS[provider].label}를 열고 프롬프트를 복사했습니다. 새 창에서 Ctrl+V로 붙여넣어 실행해 주세요.`);
        } catch {
            onNotice('AI 창은 열었습니다. 아래 프롬프트를 직접 복사해 붙여넣어 주세요.');
        }
    };

    const importResult = () => {
        if (!rawResult.trim()) {
            onNotice('AI가 반환한 JSON 결과를 먼저 붙여넣어 주세요.');
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
                        <p className="psi-eyebrow">External AI Workspace</p>
                        <h3 className="mt-2 text-xl font-black">자료는 앱이 정리하고, 정밀 분석은 선택한 AI에서</h3>
                        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 psi-copy-muted">
                            Plus·Pro 웹 계정을 그대로 사용합니다. 앱은 근거와 출력 형식을 완성된 프롬프트로 만들고, 결과 JSON을 다시 받아 한 장 자료와 다국어 교육에 연결합니다.
                        </p>
                    </div>
                    <button type="button" onClick={onUseLocalDraft} className="psi-button-secondary">
                        AI 없이 기본 초안
                    </button>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {[
                        ['1', '프롬프트 준비', '자료·5단계·금지 규칙을 자동 구성'],
                        ['2', 'AI에서 분석', '복사 후 새 창에서 붙여넣어 실행'],
                        ['3', '결과 반영', 'JSON을 붙여넣어 편집·출력·번역'],
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
                    <h3 className="text-base font-black">다국어 결과 선택</h3>
                    <p className="mt-1 text-xs font-semibold psi-copy-muted">필요한 언어만 선택하면 프롬프트와 결과 길이를 줄일 수 있습니다.</p>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {LANGUAGE_OPTIONS.map((code) => (
                            <label key={code} className={`psi-choice-chip ${languageCodes.includes(code) ? 'is-selected' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={languageCodes.includes(code)}
                                    onChange={() => toggleLanguage(code)}
                                />
                                <span>{TRAINING_LANGUAGE_LABELS[code]}</span>
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
                        <span>자료에 불필요한 이름·연락처 등 개인정보가 없는지 확인했습니다. 앱은 전화번호·이메일·주민번호 형식을 1차로 가립니다.</span>
                    </label>
                    <div className="mt-4 grid gap-2">
                        {(Object.entries(EXTERNAL_AI_PROVIDERS) as Array<[ExternalAiProvider, typeof EXTERNAL_AI_PROVIDERS[ExternalAiProvider]]>).map(([id, provider]) => (
                            <button key={id} type="button" onClick={() => void openProvider(id)} className="psi-provider-button">
                                <span><b>{provider.label} 열기</b><small>{provider.description}</small></span>
                                <strong>복사 + 바로가기</strong>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="psi-enterprise-panel p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-base font-black">자동 생성 프롬프트</h3>
                            <p className="mt-1 text-xs font-semibold psi-copy-muted">{prompt.length.toLocaleString()}자 · 근거 자료 {sources.length}개</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(prompt).then(
                                () => onNotice('프롬프트를 복사했습니다.'),
                                () => onNotice('클립보드 복사가 차단되었습니다. 아래 내용을 직접 복사해 주세요.'),
                            )}
                            className="psi-button-secondary"
                        >
                            프롬프트 복사
                        </button>
                    </div>
                    <textarea readOnly value={prompt} rows={18} className="psi-input mt-4 w-full resize-y p-4 font-mono text-xs leading-5" aria-label="외부 AI용 자동 생성 프롬프트" />
                </div>
            </section>

            <section className="psi-enterprise-panel p-5 sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-black">AI 결과 가져오기</h3>
                        <p className="mt-1 text-xs font-semibold psi-copy-muted">AI 답변의 JSON 전체를 붙여넣으면 기존 입력칸을 자동으로 채우고, 번역문도 교육 배포 단계에 함께 보냅니다.</p>
                    </div>
                    <span className="psi-status-badge">초안은 반영 후 자유롭게 수정 가능</span>
                </div>
                <textarea
                    value={rawResult}
                    onChange={(event) => setRawResult(event.target.value)}
                    rows={12}
                    placeholder='{"draft": {...}, "translations": {...}}'
                    className="psi-input mt-4 w-full p-4 font-mono text-xs leading-5"
                    aria-label="외부 AI JSON 결과"
                />
                <button type="button" onClick={importResult} className="psi-button-primary mt-4 w-full">
                    AI 결과를 한 장 초안에 반영
                </button>
            </section>
        </div>
    );
}

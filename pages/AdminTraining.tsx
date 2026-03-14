import React, { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { AppSettings } from '../types';

const LANGUAGE_OPTIONS = [
    { code: 'ko-KR', label: '한국어 (ko-KR)' },
    { code: 'en-US', label: '영어 (en-US)' },
    { code: 'vi-VN', label: '베트남어 (vi-VN)' },
    { code: 'cmn-CN', label: '중국어 (cmn-CN)' },
    { code: 'th-TH', label: '태국어 (th-TH)' },
    { code: 'id-ID', label: '인도네시아어 (id-ID)' },
    { code: 'uz-UZ', label: '우즈베크어 (uz-UZ)' },
    { code: 'mn-MN', label: '몽골어 (mn-MN)' },
    { code: 'km-KH', label: '크메르어 (km-KH)' },
    { code: 'ru-RU', label: '러시아어 (ru-RU)' },
    { code: 'kk-KZ', label: '카자흐어 (kk-KZ)' },
    { code: 'ne-NP', label: '네팔어 (ne-NP)' },
    { code: 'my-MM', label: '미얀마어 (my-MM)' },
    { code: 'fil-PH', label: '필리핀어 (fil-PH)' },
    { code: 'hi-IN', label: '힌디어 (hi-IN)' },
    { code: 'bn-BD', label: '벵골어 (bn-BD)' },
    { code: 'ur-PK', label: '우르두어 (ur-PK)' },
    { code: 'si-LK', label: '싱할라어 (si-LK)' },
] as const;

const CURRENT_SITE_LANGUAGE_SET = [
    'ko-KR',
    'vi-VN',
    'cmn-CN',
    'mn-MN',
    'id-ID',
    'ru-RU',
    'kk-KZ',
    'uz-UZ',
    'th-TH',
    'km-KH',
    'my-MM',
] as const;

const VALID_LANGUAGE_CODES = new Set(LANGUAGE_OPTIONS.map((item) => item.code));

const normalizeLanguagePreset = (input?: string[]): string[] => {
    if (!Array.isArray(input)) return [...CURRENT_SITE_LANGUAGE_SET];
    const normalized = Array.from(new Set(input.filter((code) => VALID_LANGUAGE_CODES.has(code))));
    if (normalized.length === 0) return [...CURRENT_SITE_LANGUAGE_SET];
    return normalized;
};

const AdminTraining: React.FC = () => {
    const [sourceTextKo, setSourceTextKo] = useState('');
    const [loading, setLoading] = useState(false);
    const [mobileUrl, setMobileUrl] = useState('');
    const [message, setMessage] = useState('');
    const [failedLanguages, setFailedLanguages] = useState<string[]>([]);
    const [failedLanguageAttempts, setFailedLanguageAttempts] = useState<Record<string, string[]>>({});
    const [savedPreset, setSavedPreset] = useState<string[]>([...CURRENT_SITE_LANGUAGE_SET]);
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([...CURRENT_SITE_LANGUAGE_SET]);

    const shareText = mobileUrl
        ? [
            '[PSI 다국어 안전교육 링크]',
            mobileUrl,
            failedLanguages.length > 0
                ? `음성 미생성 언어(텍스트 대체): ${failedLanguages.join(', ')}`
                : '모든 선택 언어의 음성 안내가 생성되었습니다.',
        ].join('\n')
        : '';

    useEffect(() => {
        const raw = localStorage.getItem('psi_app_settings');
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw) as AppSettings;
            const preset = normalizeLanguagePreset(parsed.trainingLanguagePreset);
            setSavedPreset(preset);
            setSelectedLanguages(preset);
        } catch {
            setSavedPreset([...CURRENT_SITE_LANGUAGE_SET]);
        }
    }, []);

    const toggleLanguage = (code: string) => {
        setSelectedLanguages((prev) => {
            if (prev.includes(code)) {
                const next = prev.filter((item) => item !== code);
                if (next.length === 0) return prev;
                return next;
            }
            return [...prev, code];
        });
    };

    const handleCreate = async () => {
        if (!sourceTextKo.trim()) {
            alert('한국어 안내 문구를 입력해 주세요.');
            return;
        }

        if (selectedLanguages.length === 0) {
            alert('최소 1개 언어를 선택해 주세요.');
            return;
        }

        setLoading(true);
        setMessage('');
        setMobileUrl('');
        setFailedLanguages([]);
        setFailedLanguageAttempts({});

        try {
            const response = await fetch('/api/admin/create-training', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceTextKo, selectedLanguages }),
            });

            const contentType = response.headers.get('content-type') || '';
            const raw = await response.text();
            let data: any = null;

            if (raw && contentType.includes('application/json')) {
                try {
                    data = JSON.parse(raw);
                } catch {
                    throw new Error('서버 JSON 응답 파싱에 실패했습니다.');
                }
            }

            if (!response.ok) {
                const serverMessage = data?.message || data?.error || `요청 실패 (HTTP ${response.status})`;
                throw new Error(serverMessage);
            }

            if (!data) {
                throw new Error('서버가 비어있는 응답을 반환했습니다.');
            }

            if (!data.ok) {
                throw new Error(data.message || data.error || '세션 생성 실패');
            }

            setMobileUrl(data.mobileUrl || '');
            const failed = Array.isArray(data.failedLanguages) ? data.failedLanguages : [];
            setFailedLanguages(failed);
            setFailedLanguageAttempts(data?.failedLanguageAttempts && typeof data.failedLanguageAttempts === 'object' ? data.failedLanguageAttempts : {});
            if (failed.length > 0) {
                setMessage('생성 완료(부분 성공): 일부 언어는 음성 생성에 실패하여 텍스트 안내로 대체됩니다.');
            } else {
                setMessage('생성 완료! 아래 QR을 근로자에게 공유하세요.');
            }
        } catch (error: any) {
            setMessage(`오류: ${error?.message || '알 수 없는 오류'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCopyShareText = async () => {
        if (!shareText) {
            alert('복사할 공유 텍스트가 없습니다. 먼저 생성을 완료해 주세요.');
            return;
        }

        try {
            await navigator.clipboard.writeText(shareText);
            setMessage('공유 텍스트를 복사했습니다. 메신저에 붙여넣어 전달해 주세요.');
        } catch {
            setMessage('클립보드 복사에 실패했습니다. 텍스트를 직접 복사해 주세요.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                <h2 className="text-2xl font-black text-slate-900">관리자 다국어 음성 안내 생성</h2>
                <p className="text-sm font-bold text-slate-500 mt-2">한국어 핵심 위험성평가 문구를 입력하면 다국어 TTS와 근로자 QR 링크를 생성합니다.</p>

                <textarea
                    value={sourceTextKo}
                    onChange={(e) => setSourceTextKo(e.target.value)}
                    rows={8}
                    placeholder="예: 이달 핵심 위험은 추락, 협착, 전도입니다."
                    className="w-full mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm"
                />

                <div className="mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-black text-slate-600">생성 언어 선택 (최소 1개)</p>
                        <button
                            type="button"
                            onClick={() => setSelectedLanguages([...savedPreset])}
                            className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-black border border-indigo-200 hover:bg-indigo-100"
                        >
                            설정 기본값 적용
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {LANGUAGE_OPTIONS.map((lang) => (
                            <label key={lang.code} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50">
                                <input
                                    type="checkbox"
                                    checked={selectedLanguages.includes(lang.code)}
                                    onChange={() => toggleLanguage(lang.code)}
                                />
                                <span className="text-xs font-bold text-slate-700">{lang.label}</span>
                            </label>
                        ))}
                    </div>
                    <p className="mt-2 text-[11px] font-bold text-slate-500">
                        기본값은 설정 페이지의 "다국어 교육 기본 언어 세트"를 따르며, 미설정 시 현장 다국적 기본 세트가 적용됩니다.
                    </p>
                </div>

                <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="mt-4 px-6 py-3 rounded-xl bg-indigo-600 text-white font-black text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {loading ? '생성 중...' : '생성'}
                </button>

                {message && <p className="mt-4 text-sm font-bold text-slate-700">{message}</p>}
                {failedLanguages.length > 0 && (
                    <div className="mt-3">
                        <p className="text-xs font-black text-amber-700 mb-2">음성 미생성 언어 (텍스트 대체)</p>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {failedLanguages.map((code) => (
                                <span
                                    key={code}
                                    className="px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-[11px] font-black"
                                >
                                    {code}
                                </span>
                            ))}
                        </div>
                        <div className="space-y-1">
                            {failedLanguages.map((code) => {
                                const attempts = failedLanguageAttempts[code] || [];
                                return (
                                    <p key={`${code}-attempts`} className="text-[11px] font-bold text-slate-600">
                                        {code} 시도 코드: {attempts.length > 0 ? attempts.join(', ') : '기록 없음'}
                                    </p>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {mobileUrl && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                    <h3 className="text-xl font-black text-slate-900">근로자 접속 QR</h3>
                    <p className="text-xs font-bold text-slate-500 mt-2 break-all">{mobileUrl}</p>
                    <div className="mt-4">
                        <QRCodeCanvas value={mobileUrl} size={220} />
                    </div>
                    <div className="mt-4">
                        <p className="text-xs font-black text-slate-600 mb-2">공유 텍스트</p>
                        <textarea
                            value={shareText}
                            readOnly
                            rows={4}
                            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-xs"
                        />
                        <button
                            type="button"
                            onClick={handleCopyShareText}
                            className="mt-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-black border border-slate-200 hover:bg-slate-200"
                        >
                            공유 텍스트 복사
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminTraining;

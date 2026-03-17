import React, { useMemo, useState } from 'react';

type AuthKeyType = 'phone' | 'birthDate' | 'passport';

export type AuthenticatedWorker = {
    workerId: string;
    name: string;
    nationality: string;
};

interface AuthGatewayProps {
    onAuthenticated: (worker: AuthenticatedWorker) => void;
    title?: string;
    subtitle?: string;
}

const failMessage = '근로자 명부에 등록되지 않은 정보입니다. 관리자에게 문의하세요.';

const keyLabels: Record<AuthKeyType, string> = {
    phone: '핸드폰 번호',
    birthDate: '생년월일',
    passport: '여권번호',
};

const placeholders: Record<AuthKeyType, string> = {
    phone: '예: 01012345678',
    birthDate: '예: 900101 또는 19900101',
    passport: '예: M12345678',
};

const inputModeByType: Record<AuthKeyType, React.HTMLAttributes<HTMLInputElement>['inputMode']> = {
    phone: 'numeric',
    birthDate: 'numeric',
    passport: 'text',
};

const maxLengthByType: Record<AuthKeyType, number> = {
    phone: 20,
    birthDate: 8,
    passport: 20,
};

const normalizePhone = (value: string) => value.replace(/\D/g, '');
const normalizeBirthDate = (value: string) => value.replace(/\D/g, '');
const normalizePassport = (value: string) => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export const AuthGateway: React.FC<AuthGatewayProps> = ({
    onAuthenticated,
    title = '근로자 본인 확인',
    subtitle = '등록된 근로자 명부 키(핸드폰/생년월일/여권번호) 중 하나로 인증해 주세요.',
}) => {
    const [keyType, setKeyType] = useState<AuthKeyType>('phone');
    const [keyValue, setKeyValue] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const normalizedValue = useMemo(() => {
        if (keyType === 'phone') return normalizePhone(keyValue);
        if (keyType === 'birthDate') return normalizeBirthDate(keyValue);
        return normalizePassport(keyValue);
    }, [keyType, keyValue]);

    const canSubmit = Boolean(normalizedValue) && !submitting;

    const handleSubmit = async () => {
        if (!normalizedValue) {
            setErrorMessage('본인 확인 정보를 입력해 주세요.');
            return;
        }

        if (keyType === 'birthDate' && !(normalizedValue.length === 6 || normalizedValue.length === 8)) {
            setErrorMessage('생년월일은 6자리 또는 8자리로 입력해 주세요.');
            return;
        }

        setSubmitting(true);
        setErrorMessage('');

        try {
            const response = await fetch('/api/worker/authenticate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyType,
                    keyValue: normalizedValue,
                }),
            });

            const result = await response.json();
            if (!response.ok || !result?.ok || !result?.worker) {
                throw new Error(result?.message || failMessage);
            }

            onAuthenticated({
                workerId: String(result.worker.worker_id || '').trim(),
                name: String(result.worker.name || '').trim(),
                nationality: String(result.worker.nationality || '').trim(),
            });
        } catch (error: any) {
            setErrorMessage(error?.message || failMessage);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div>
                <h2 className="text-2xl font-black text-slate-900">{title}</h2>
                <p className="mt-2 text-sm font-bold text-slate-500">{subtitle}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="본인 확인 키 선택">
                {(['phone', 'birthDate', 'passport'] as AuthKeyType[]).map((type) => {
                    const active = keyType === type;
                    return (
                        <button
                            key={type}
                            type="button"
                            onClick={() => {
                                setKeyType(type);
                                setKeyValue('');
                                setErrorMessage('');
                            }}
                            className={`rounded-xl border px-3 py-3 text-sm font-black ${active ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700'}`}
                        >
                            {keyLabels[type]}
                        </button>
                    );
                })}
            </div>

            <div>
                <label className="block text-xs font-black text-slate-500 mb-2">{keyLabels[keyType]}</label>
                <input
                    type={keyType === 'passport' ? 'text' : 'tel'}
                    inputMode={inputModeByType[keyType]}
                    autoComplete="off"
                    value={keyValue}
                    onChange={(event) => {
                        const value = event.target.value;
                        if (keyType === 'phone') {
                            setKeyValue(normalizePhone(value));
                        } else if (keyType === 'birthDate') {
                            setKeyValue(normalizeBirthDate(value));
                        } else {
                            setKeyValue(value.toUpperCase());
                        }
                    }}
                    maxLength={maxLengthByType[keyType]}
                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 font-bold"
                    placeholder={placeholders[keyType]}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            void handleSubmit();
                        }
                    }}
                />
                <p className="mt-2 text-[11px] font-bold text-slate-500">※ 등록된 정보와 정확히 일치해야 교육 화면에 진입할 수 있습니다.</p>
            </div>

            <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
                {submitting ? '확인 중...' : '본인 확인 후 교육 시작'}
            </button>

            {errorMessage && <p className="text-sm font-bold text-rose-700">{errorMessage}</p>}
        </div>
    );
};

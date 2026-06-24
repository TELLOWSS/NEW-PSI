import React, { useState } from 'react';
import { ActionButton } from './shared/ActionButton';

interface AdminLockScreenProps {
    onUnlock: (password: string, bypass?: boolean) => void | Promise<void>;
    errorMessage?: string;
    isSubmitting?: boolean;
}

export const AdminLockScreen: React.FC<AdminLockScreenProps> = ({
    onUnlock,
    errorMessage,
    isSubmitting = false,
}) => {
    const [password, setPassword] = useState('');
    const [bypass, setBypass] = useState(() => {
        try {
            return localStorage.getItem('psi_admin_bypass_ui') === 'true';
        } catch {
            return false;
        }
    });

    const isBypassAllowedEnv =
        import.meta.env.DEV ||
        import.meta.env.VITE_ALLOW_ADMIN_BYPASS === 'true' ||
        (typeof window !== 'undefined' && window.location.hostname === 'localhost');

    const handleBypassChange = (enabled: boolean) => {
        setBypass(enabled);
        try {
            localStorage.setItem('psi_admin_bypass_ui', enabled ? 'true' : 'false');
        } catch {
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center px-4 transition-colors duration-200">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl transition-colors duration-200">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        onUnlock(password, bypass);
                    }}
                    className="space-y-4"
                >
                    {isBypassAllowedEnv && (
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60">
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">비밀번호 입력 우회 (개발용)</span>
                            <button
                                type="button"
                                onClick={() => handleBypassChange(!bypass)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    bypass ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                                }`}
                                role="switch"
                                aria-checked={bypass}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        bypass ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                    )}
                    <input
                        type="password"
                        name="admin-password"
                        autoComplete="current-password"
                        aria-label="관리자 비밀번호"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={bypass ? "비밀번호 우회 활성화됨" : "비밀번호 입력"}
                        disabled={bypass}
                        autoFocus={!bypass}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-800 disabled:opacity-50 transition-colors duration-200"
                    />
                    <ActionButton
                        type="submit"
                        disabled={isSubmitting}
                        variant="indigoSolid"
                        fullWidth
                        className="px-4 py-3 text-sm font-black"
                    >
                        {isSubmitting ? '확인 중...' : bypass ? '개발자 우회 로그인' : '관리자 모드 진입'}
                    </ActionButton>
                </form>
                <p className="mt-3 text-center text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">
                    관리자 비밀번호는 서버 운영 설정값으로 관리됩니다. 분실 시 Vercel 환경변수 `ADMIN_LOGIN_PASSWORD` 또는 `PSI_ADMIN_PASSWORD`를 재설정해 주세요.
                </p>
                {errorMessage && (
                    <p className="mt-3 text-center text-xs font-bold text-rose-600 dark:text-rose-300">{errorMessage}</p>
                )}
            </div>
        </div>
    );
};

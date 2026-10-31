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

    const isBypassAllowedEnv = import.meta.env.DEV;
    const effectiveBypass = isBypassAllowedEnv && bypass;

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
                        onUnlock(password, effectiveBypass);
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
                        placeholder={effectiveBypass ? "비밀번호 우회 활성화됨" : "비밀번호 입력"}
                        disabled={effectiveBypass}
                        autoFocus={!effectiveBypass}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-800 disabled:opacity-50 transition-colors duration-200"
                    />
                    <ActionButton
                        type="submit"
                        disabled={isSubmitting}
                        variant="indigoSolid"
                        fullWidth
                        className="px-4 py-3 text-sm font-black"
                    >
                        {isSubmitting ? '확인 중...' : effectiveBypass ? '개발자 우회 로그인' : '관리자 모드 진입'}
                    </ActionButton>
                </form>
                <a href="/product" aria-label="처음이라면 · 사진점검 제품 체험" className="mt-5 group flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-left transition-colors hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-800 text-emerald-100"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h4l2-2h4l2 2h4v14H4z"/><circle cx="12" cy="12" r="4"/></svg></span><span className="min-w-0 flex-1"><span className="block text-[10px] font-bold tracking-wider text-emerald-700 dark:text-emerald-300">로그인 없이 샘플 체험</span><span className="mt-1 block break-keep text-sm font-extrabold text-slate-800 dark:text-slate-100">사진점검 미리 체험하기</span><span className="mt-1 block break-keep text-[11px] leading-5 text-slate-600 dark:text-slate-300">위험·조치·보고서 미리보기</span></span><span aria-hidden="true" className="text-xl text-emerald-800 dark:text-emerald-200">↗</span></a>
                <a href="/field-local/" aria-label="로그인 없이 내 기기 점검 시작" className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-900 hover:bg-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200">내 기기에서 사진·점검·조치 기록하기 <span aria-hidden="true">↗</span></a>
                <p className="mt-3 text-center text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">
                    관리자 비밀번호는 체험 사용자에게 공유하지 마세요. 기기 점검은 클라우드에 자동 업로드되지 않습니다.
                </p>
                {errorMessage && (
                    <p className="mt-3 text-center text-xs font-bold text-rose-600 dark:text-rose-300">{errorMessage}</p>
                )}
            </div>
        </div>
    );
};

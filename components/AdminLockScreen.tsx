import React, { useState } from 'react';

interface AdminLockScreenProps {
    onUnlock: (password: string) => void;
    errorMessage?: string;
    isSubmitting?: boolean;
}

export const AdminLockScreen: React.FC<AdminLockScreenProps> = ({
    onUnlock,
    errorMessage,
    isSubmitting = false,
}) => {
    const [password, setPassword] = useState('');

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        onUnlock(password);
                    }}
                    className="space-y-4"
                >
                    <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="비밀번호 입력"
                        autoFocus
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                        관리자 모드 진입
                    </button>
                </form>
                {errorMessage && (
                    <p className="mt-3 text-center text-xs font-bold text-rose-600">{errorMessage}</p>
                )}
            </div>
        </div>
    );
};

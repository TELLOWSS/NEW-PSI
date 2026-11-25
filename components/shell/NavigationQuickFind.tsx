import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Page } from '../../types';

export type NavigationOption = {
    page: Page;
    label: string;
    group: string;
};

interface NavigationQuickFindProps {
    options: NavigationOption[];
    onNavigate: (page: Page) => void;
    shortcutsDisabled?: boolean;
}

const normalizeQuery = (value: string): string => value.normalize('NFKC').trim().toLocaleLowerCase();

export const filterNavigationOptions = (options: NavigationOption[], query: string): NavigationOption[] => {
    const normalized = normalizeQuery(query);
    if (!normalized) return options;
    return options.filter((option) =>
        normalizeQuery(`${option.label} ${option.group}`).includes(normalized),
    );
};

const isTypingTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
};

/**
 * A local-only menu finder, NOT a global search of worker/evidence records.
 * Search options must already be filtered using the same access rules as Sidebar.
 */
export const NavigationQuickFind: React.FC<NavigationQuickFindProps> = ({ options, onNavigate, shortcutsDisabled = false }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    // Closing the search and choosing a destination need different focus targets.
    const navigatedRef = useRef(false);
    const results = useMemo(() => filterNavigationOptions(options, query), [options, query]);

    const show = useCallback(() => {
        navigatedRef.current = false;
        setQuery('');
        setActiveIndex(0);
        setOpen(true);
    }, []);
    const dismiss = useCallback(() => setOpen(false), []);
    const navigate = useCallback((page: Page) => {
        // Guard against a stale row after a role/mode/composition change.
        if (!options.some((option) => option.page === page)) return;
        navigatedRef.current = true;
        dismiss();
        onNavigate(page);
    }, [dismiss, onNavigate, options]);

    useEffect(() => {
        const handleShortcut = (event: KeyboardEvent) => {
            if (shortcutsDisabled || event.defaultPrevented || event.altKey || event.shiftKey) return;
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
            if (isTypingTarget(event.target)) return;
            event.preventDefault();
            show();
        };
        window.addEventListener('keydown', handleShortcut);
        return () => window.removeEventListener('keydown', handleShortcut);
    }, [show, shortcutsDisabled]);

    useEffect(() => {
        if (!open) return;
        const previousFocus = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : triggerRef.current;

        const previousOverflow = document.body.style.overflow;
        // The portal is appended to document.body, OUTSIDE #root. Mark the
        // entire operational app inert while this aria-modal dialog is open.
        const appRoot = document.getElementById('root');
        const rootWasInert = appRoot?.inert ?? false;
        if (appRoot) appRoot.inert = true;
        document.body.style.overflow = 'hidden';
        const focusId = window.requestAnimationFrame(() => inputRef.current?.focus());
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                dismiss();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusableNodes = dialogRef.current?.querySelectorAll<HTMLElement>(
                'input:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])',
            );
            const focusable = (focusableNodes ? Array.from(focusableNodes) : []) as HTMLElement[];
            const visibleFocusable = focusable.filter((element) => element.getClientRects().length > 0);
            if (visibleFocusable.length === 0) {
                event.preventDefault();
                dialogRef.current?.focus();
                return;
            }
            const first = visibleFocusable[0];
            const last = visibleFocusable[visibleFocusable.length - 1];
            if (!dialogRef.current?.contains(document.activeElement)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            window.cancelAnimationFrame(focusId);
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
            if (appRoot) appRoot.inert = rootWasInert;
            const navigated = navigatedRef.current;
            navigatedRef.current = false;
            if (navigated) {
                // Route selection (including the current page) is not a cancel:
                // focus content after React releases the inert app background.
                window.requestAnimationFrame(() =>
                    document.getElementById('psi-main-content')?.focus({ preventScroll: true }),
                );
            } else if (previousFocus?.isConnected && previousFocus.getClientRects().length > 0 &&
                getComputedStyle(previousFocus).visibility !== 'hidden') {
                previousFocus.focus();
            }
        };
    }, [open, dismiss]);

    useEffect(() => {
        if (!open || results.length === 0) return;
        dialogRef.current?.querySelector<HTMLElement>(`#psi-quickfind-option-${activeIndex}`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [open, activeIndex, results.length]);

    useEffect(() => {
        if (open && results.length === 0) setActiveIndex(0);
        else if (open && activeIndex >= results.length) setActiveIndex(0);
    }, [open, activeIndex, results.length]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={show}
                aria-haspopup="dialog"
                aria-keyshortcuts="Control+K Meta+K"
                aria-label="메뉴 빠른 찾기"
                title="메뉴 빠른 찾기 (Ctrl 또는 ⌘ + K)"
                className="psi-quickfind-trigger flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-2 text-slate-700 hover:border-sky-400 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--psi-focus)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-sky-500 dark:hover:bg-slate-800 sm:px-3"
            >
                <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
                <span className="hidden text-xs font-semibold xl:inline">메뉴 찾기</span>
                <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400 2xl:inline">Ctrl K</kbd>
            </button>

            {open && createPortal(
                <div className="fixed inset-0 z-[900] flex items-start justify-center overflow-y-auto px-3 py-3 sm:pt-[min(12vh,90px)]">
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-label="메뉴 검색 닫기"
                        onClick={dismiss}
                        className="absolute inset-0 cursor-default bg-slate-950/70 backdrop-blur-[3px]"
                    />
                    <section
                        ref={dialogRef}
                        tabIndex={-1}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="psi-quickfind-title"
                        aria-describedby="psi-quickfind-help"
                        className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
                    >
                        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <h2 id="psi-quickfind-title" className="text-sm font-bold">업무 메뉴 빠른 찾기</h2>
                                <button
                                    type="button"
                                    onClick={dismiss}
                                    aria-label="검색 창 닫기"
                                    className="min-h-11 min-w-11 rounded-lg border border-slate-200 text-lg text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                >×</button>
                            </div>
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
                                onKeyDown={(event) => {
                                    if (event.key === 'ArrowDown' && results.length) {
                                        event.preventDefault();
                                        setActiveIndex((index) => (index + 1) % results.length);
                                    } else if (event.key === 'ArrowUp' && results.length) {
                                        event.preventDefault();
                                        setActiveIndex((index) => (index - 1 + results.length) % results.length);
                                    } else if (event.key === 'Enter' && results[activeIndex]) {
                                        event.preventDefault();
                                        navigate(results[activeIndex].page);
                                    }
                                }}
                                type="search"
                                role="combobox"
                                aria-label="업무 메뉴 검색어"
                                aria-autocomplete="list"
                                aria-controls="psi-quickfind-results"
                                aria-expanded={true}
                                aria-activedescendant={results[activeIndex] ? `psi-quickfind-option-${activeIndex}` : undefined}
                                placeholder="메뉴 이름 또는 업무 분야 검색"
                                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-offset-2 focus:outline-[var(--psi-focus)] dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            />
                            <p id="psi-quickfind-help" className="mt-2 text-xs text-slate-500 dark:text-slate-400">표시 중인 메뉴에서만 검색합니다. ↑↓ 선택 · Enter 이동 · Esc 닫기</p>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-2">
                            <p role="status" aria-live="polite" className="px-3 py-1 text-xs text-slate-500 dark:text-slate-400">
                                검색 가능한 메뉴 {results.length}개
                            </p>
                            <div id="psi-quickfind-results" role="listbox" aria-label="검색 결과">
                                {results.map((option, index) => (
                                    <button
                                        key={option.page}
                                        id={`psi-quickfind-option-${index}`}
                                        type="button"
                                        role="option"
                                        aria-selected={index === activeIndex}
                                        onMouseEnter={() => setActiveIndex(index)}
                                        onClick={() => navigate(option.page)}
                                        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--psi-focus)] ${index === activeIndex ? 'bg-emerald-50 text-emerald-900 dark:bg-teal-900/50 dark:text-teal-100' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                                    >
                                        <span className="min-w-0 truncate text-sm font-semibold">{option.label}</span>
                                        <span className="shrink-0 text-xs opacity-65">{option.group}</span>
                                    </button>
                                ))}
                                {results.length === 0 && (
                                    <div className="px-3 py-8 text-center text-sm text-slate-600 dark:text-slate-300">
                                        검색 결과가 없습니다. 다른 메뉴 이름을 입력해 주세요.
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                </div>, document.body,
            )}
        </>
    );
};

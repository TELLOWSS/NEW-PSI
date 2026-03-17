/**
 * apiCounterUtils.ts
 * 일일 Gemini API 호출 횟수를 localStorage에 추적합니다.
 * 자정 기준으로 날짜가 바뀌면 카운터가 자동 초기화됩니다.
 */

const COUNTER_KEY = 'psi_daily_api_counter';

export interface DailyCounterState {
    date: string; // 'YYYY-MM-DD'
    count: number;
    successCount: number;
    failCount: number;
}

const getTodayString = (): string => new Date().toISOString().slice(0, 10);

export const getApiCallState = (): DailyCounterState => {
    try {
        const raw = localStorage.getItem(COUNTER_KEY);
        if (!raw) return { date: getTodayString(), count: 0, successCount: 0, failCount: 0 };
        const parsed = JSON.parse(raw) as DailyCounterState;
        // 날짜가 바뀌면 자동 초기화
        if (parsed.date !== getTodayString()) {
            return { date: getTodayString(), count: 0, successCount: 0, failCount: 0 };
        }
        return {
            date: parsed.date || getTodayString(),
            count: parsed.count || 0,
            successCount: parsed.successCount || 0,
            failCount: parsed.failCount || 0,
        };
    } catch {
        return { date: getTodayString(), count: 0, successCount: 0, failCount: 0 };
    }
};

/**
 * API 호출 횟수를 증가시킵니다.
 * @param type 'success' | 'fail'
 */
export const incrementApiCallCount = (type: 'success' | 'fail' = 'success'): DailyCounterState => {
    const state = getApiCallState();
    const next: DailyCounterState = {
        date: state.date,
        count: state.count + 1,
        successCount: state.successCount + (type === 'success' ? 1 : 0),
        failCount: state.failCount + (type === 'fail' ? 1 : 0),
    };
    localStorage.setItem(COUNTER_KEY, JSON.stringify(next));
    return next;
};

/**
 * 오늘 카운터를 수동으로 초기화합니다.
 */
export const resetApiCallCount = (): void => {
    localStorage.setItem(COUNTER_KEY, JSON.stringify({
        date: getTodayString(),
        count: 0,
        successCount: 0,
        failCount: 0,
    }));
};

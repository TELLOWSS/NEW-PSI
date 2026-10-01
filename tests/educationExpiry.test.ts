import { afterEach, expect, it, vi } from 'vitest';
import { scheduleEducationExpiry } from '../utils/educationExpiry';
afterEach(()=>vi.useRealTimers());
it('removes material at the deadline without firing early or repeating',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));const expire=vi.fn();
 scheduleEducationExpiry('2026-10-01T00:01:00Z',expire);
 vi.advanceTimersByTime(59999);expect(expire).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(expire).toHaveBeenCalledTimes(1);
 vi.advanceTimersByTime(60000);expect(expire).toHaveBeenCalledTimes(1);
});
it('cancels an old deadline after logout, account change or replacement',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));const expire=vi.fn();
 const cancel=scheduleEducationExpiry('2026-10-01T00:01:00Z',expire);cancel();vi.advanceTimersByTime(60000);expect(expire).not.toHaveBeenCalled();
});
it.each(['invalid','2026-09-30T00:00:00Z','2026-10-01T00:00:00Z'])('fails closed for already expired or invalid deadline %s',deadline=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));const expire=vi.fn();
 scheduleEducationExpiry(deadline,expire);expect(expire).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});

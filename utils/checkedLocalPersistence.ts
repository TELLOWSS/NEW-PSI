export const LOCAL_RECORDS_CHANGED = 'psi:local-records-changed';

/** Report success only after the browser accepted the complete write. */
export function persistLocalRecords(key: string, value: unknown): boolean {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        window.alert('저장하지 못했습니다. 브라우저 저장 공간 또는 저장 권한을 확인해주세요. 입력 내용은 유지됩니다. 기존 자료를 백업한 뒤 다시 시도해주세요.');
        return false;
    }
    window.dispatchEvent(new Event(LOCAL_RECORDS_CHANGED));
    return true;
}

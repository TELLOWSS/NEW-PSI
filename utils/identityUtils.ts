import type { WorkerRecord } from '../types';
import { getWorkerUuidValue, isGeneratedEmployeeCredential, isGeneratedQrCredential } from './workerIdentity';

const EMPLOYEE_ID_REGEX = /^EMP-\d{4}-[A-Z0-9]{4,10}$/;
const QR_ID_REGEX = /^QR-[A-Z0-9-]{4,24}$/;

const normalizeToken = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
const compactToken = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

const stableHashBase36 = (seed: string): string => {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index++) {
        hash ^= seed.charCodeAt(index);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash >>> 0).toString(36).toUpperCase();
};

const getYear = (dateString?: string): string => {
    if (!dateString) return new Date().getFullYear().toString();
    const matched = /^\d{4}/.exec(dateString);
    return matched ? matched[0] : new Date().getFullYear().toString();
};

const getSeed = (record: WorkerRecord): string => {
    // 표시용 번호에도 이름·공종·팀장·점수를 넣지 않는다. 휴대 ID가 없으면 기록 단위다.
    return getWorkerUuidValue(record) || record.id;
};

const generateEmployeeId = (record: WorkerRecord): string => {
    const year = getYear(record.date);
    const serialCode = stableHashBase36(getSeed(record)).slice(0, 7).padEnd(7, '0');
    const suffix = `LCL${serialCode}`;
    return `EMP-${year}-${suffix}`;
};

const normalizeEmployeeId = (record: WorkerRecord): string => {
    const raw = (record.employeeId || '').trim();
    if (!raw) return generateEmployeeId(record);

    const normalized = normalizeToken(raw);
    if (EMPLOYEE_ID_REGEX.test(normalized)) return normalized;

    return generateEmployeeId(record);
};

const generateQrId = (record: WorkerRecord, employeeId: string): string => {
    const employeeSuffix = employeeId.split('-').pop() || '0000';
    void record;
    return `QR-LCL-${employeeSuffix}`;
};

const normalizeQrId = (record: WorkerRecord, employeeId: string): string => {
    const raw = (record.qrId || '').trim();
    const target = generateQrId(record, employeeId);
    if (!raw) return target;

    const normalized = normalizeToken(raw);
    // 외부에서 발급한 유효 QR를 현재 현장의 관리번호와 다르다는 이유로 교체하지 않는다.
    if (QR_ID_REGEX.test(normalized)) return normalized;

    return target;
};

const ensureUniqueEmployeeId = (employeeId: string, currentRecord: WorkerRecord, existingRecords: WorkerRecord[]): string => {
    const currentRecordId = currentRecord.id;
    const currentWorkerId = getWorkerUuidValue(currentRecord);
    const duplicateExists = (candidate: string) => existingRecords.some((record) => record.id !== currentRecordId
        && !(currentWorkerId && getWorkerUuidValue(record) === currentWorkerId)
        && (record.employeeId || '').toUpperCase() === candidate);

    if (!duplicateExists(employeeId)) return employeeId;

    const parts = employeeId.split('-');
    const prefix = `${parts[0] || 'EMP'}-${parts[1] || new Date().getFullYear().toString()}`;
    const suffix = parts.slice(2).join('') || '0000';
    const compact = compactToken(suffix).padEnd(10, '0');

    for (let attempt = 0; attempt < 20; attempt++) {
        const postfix = stableHashBase36(`${currentRecordId}|${attempt}`).slice(0, 2).padEnd(2, '0');
        const nextSuffix = `${compact.slice(0, 8)}${postfix}`.slice(0, 10);
        const candidate = `${prefix}-${nextSuffix}`;
        if (!duplicateExists(candidate)) return candidate;
    }

    const fallback = `${prefix}-${stableHashBase36(`${currentRecordId}|fallback`).slice(0, 10).padEnd(10, '0')}`;
    return fallback;
};

export const applyIdentityPolicy = (record: WorkerRecord, existingRecords: WorkerRecord[] = []): WorkerRecord => {
    const normalizedEmployeeId = normalizeEmployeeId(record);
    const wasEmployeeIdGenerated = isGeneratedEmployeeCredential(record)
        || !record.employeeId
        || normalizedEmployeeId !== normalizeToken(record.employeeId.trim());
    // 실제 관리번호는 여러 평가 기록에서 재사용된다. 표시용 자동 번호만 충돌 보정한다.
    const employeeId = wasEmployeeIdGenerated
        ? ensureUniqueEmployeeId(normalizedEmployeeId, record, existingRecords)
        : normalizedEmployeeId;
    const qrId = normalizeQrId(record, employeeId);
    const employeeIdGenerated = wasEmployeeIdGenerated;
    const qrIdGenerated = isGeneratedQrCredential(record)
        || !record.qrId
        || qrId !== normalizeToken(record.qrId.trim());
    const selectedCredentialWasGenerated = (record.matchMethod === 'employeeId' && employeeIdGenerated)
        || (record.matchMethod === 'qr' && qrIdGenerated);

    return {
        ...record,
        employeeId,
        employeeIdGenerated,
        qrId,
        qrIdGenerated,
        matchMethod: selectedCredentialWasGenerated ? 'unmatched' : record.matchMethod,
    };
};

export const validateIdentityPolicy = (record: WorkerRecord): { employeeIdValid: boolean; qrIdValid: boolean } => {
    const employee = (record.employeeId || '').toUpperCase();
    const qr = (record.qrId || '').toUpperCase();

    return {
        employeeIdValid: EMPLOYEE_ID_REGEX.test(employee),
        qrIdValid: QR_ID_REGEX.test(qr),
    };
};

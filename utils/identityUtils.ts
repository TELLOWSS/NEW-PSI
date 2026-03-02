import type { WorkerRecord } from '../types';

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
    return [
        record.id || '',
        record.name || '',
        record.date || '',
        record.jobField || '',
        record.teamLeader || '',
    ].join('|');
};

const toTeamCode = (teamLeader?: string): string => {
    const token = compactToken(teamLeader || 'X');
    return token.length > 0 ? token[0] : 'X';
};

const toRoleCode = (role?: WorkerRecord['role']): string => {
    if (role === 'leader') return 'L';
    if (role === 'sub_leader') return 'S';
    return 'W';
};

const toJobCode = (jobField?: string): string => {
    const raw = jobField || '';
    if (/(형틀|목공)/.test(raw)) return 'FC';
    if (/(철근|철골|용접)/.test(raw)) return 'ST';
    if (/(전기|전장|통신)/.test(raw)) return 'EL';
    if (/(설비|배관|기계)/.test(raw)) return 'ME';
    if (/(도장|마감|내장)/.test(raw)) return 'FN';
    if (/(토목|굴착|토공)/.test(raw)) return 'CV';
    return 'GN';
};

const generateEmployeeId = (record: WorkerRecord): string => {
    const year = getYear(record.date);
    const jobCode = toJobCode(record.jobField);
    const teamCode = toTeamCode(record.teamLeader);
    const roleCode = toRoleCode(record.role);
    const serialCode = stableHashBase36(getSeed(record)).slice(0, 4).padEnd(4, '0');
    const suffix = `${jobCode}${teamCode}${roleCode}${serialCode}`;
    return `EMP-${year}-${suffix}`;
};

const normalizeEmployeeId = (record: WorkerRecord): string => {
    const raw = (record.employeeId || '').trim();
    if (!raw) return generateEmployeeId(record);

    const normalized = normalizeToken(raw);
    if (EMPLOYEE_ID_REGEX.test(normalized)) return normalized;

    const compact = compactToken(normalized);
    if (compact.length >= 4) {
        const year = getYear(record.date);
        return `EMP-${year}-${compact.slice(-8).padStart(4, '0')}`;
    }

    return generateEmployeeId(record);
};

const generateQrId = (record: WorkerRecord, employeeId: string): string => {
    const employeeSuffix = employeeId.split('-').pop() || '0000';
    const gradeCode = record.safetyLevel === '고급' ? 'A' : record.safetyLevel === '중급' ? 'B' : 'C';
    return `QR-${employeeSuffix}-${gradeCode}`;
};

const normalizeQrId = (record: WorkerRecord, employeeId: string): string => {
    const raw = (record.qrId || '').trim();
    const target = generateQrId(record, employeeId);
    if (!raw) return target;

    const normalized = normalizeToken(raw);
    const employeeSuffix = employeeId.split('-').pop() || '';
    if (QR_ID_REGEX.test(normalized) && normalized.includes(employeeSuffix)) return normalized;

    const compact = compactToken(normalized);
    if (compact.length >= 4) {
        return target;
    }

    return target;
};

const ensureUniqueEmployeeId = (employeeId: string, currentRecordId: string, existingRecords: WorkerRecord[]): string => {
    const duplicateExists = (candidate: string) => existingRecords.some((record) => record.id !== currentRecordId && (record.employeeId || '').toUpperCase() === candidate);

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
    const employeeId = ensureUniqueEmployeeId(normalizedEmployeeId, record.id, existingRecords);
    const qrId = normalizeQrId(record, employeeId);

    return {
        ...record,
        employeeId,
        qrId,
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

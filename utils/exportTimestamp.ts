export type ExportTimestampMeta = {
    iso: string;
    kst: string;
};

type KstDateParts = {
    year: string;
    month: string;
    day: string;
    hour: string;
    minute: string;
    second: string;
};

const getKstDateParts = (date = new Date()): KstDateParts => {
    const formatted = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(date);

    const read = (type: Intl.DateTimeFormatPartTypes) => {
        return formatted.find((part) => part.type === type)?.value || '00';
    };

    return {
        year: read('year'),
        month: read('month'),
        day: read('day'),
        hour: read('hour'),
        minute: read('minute'),
        second: read('second'),
    };
};

export const buildKstDateToken = (date = new Date()): string => {
    const parts = getKstDateParts(date);
    return `${parts.year}${parts.month}${parts.day}`;
};

export const buildKstTimeToken = (date = new Date()): string => {
    const parts = getKstDateParts(date);
    return `${parts.hour}${parts.minute}${parts.second}`;
};

export const buildExportTimestampMeta = (date = new Date()): ExportTimestampMeta => {
    const iso = date.toISOString();
    const kst = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(date);

    return {
        iso,
        kst,
    };
};

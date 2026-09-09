/** Source evidence is not a display label: whitespace and line breaks are data. */
export const preserveEvidenceText = (value: unknown): string => typeof value === 'string' ? value : '';

/** Spreadsheet-facing reports only: the protective tab changes exported text.
 * Preserve original records and use JSON for lossless interchange/backups.
 * CSV protection is not universal across spreadsheet programs or re-saving.
 */
export function escapeSpreadsheetCsvCell(value: unknown): string {
    const original = String(value ?? '');
    const probe = original.normalize('NFKC').trimStart();
    const dangerousText = typeof value !== 'number' &&
        (/^[=+@-]/.test(probe) || /^[\t\r\n]/.test(original));
    const text = dangerousText ? `\t${original}` : original;
    return `"${text.replace(/"/g, '""')}"`;
}

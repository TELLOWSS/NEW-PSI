# Spreadsheet report exports

Spreadsheet-facing CSV downloads share `escapeSpreadsheetCsvCell`. Every cell is quoted; embedded quotes are doubled, and comma/CR/LF characters remain within the cell. Text beginning with a formula marker (including full-width variants or preceding whitespace) receives a protective tab inside the quoted cell. Leading tab/CR/LF text receives the same protection. Typed numeric values remain numeric text, including negative values.

Applied to evidence trails, language evidence, record details, reports, dashboard team/trade exports, settings evidence, judgment tagging, and worker message history/dashboard reports. The worker bulk-upload template serializer is unchanged because it is an interchange format.

This changes exported formula-like text by adding a tab. Original stored records and JSON backups are unchanged. Use JSON for lossless backups and interchange. This is a spreadsheet-oriented mitigation, not a guarantee across all spreadsheet applications, import settings, or save/reopen workflows. Actual desktop Excel save/reopen behavior has not been tested here.

Reference: [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection), including quoted-cell tab protection and its portability limitations.

Validation covers formula markers, full-width variants, whitespace/control prefixes, numeric values, separators, quotes, CR/LF, and integration with the language evidence report.

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const reportFile = path.join(root, 'reports', 'mobile-qa-evidence-status.md');
const finalizationFile = path.join(root, 'MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md');
const checklistFile = path.join(root, 'NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md');

const read = (filePath) => fs.readFileSync(filePath, 'utf8');
const write = (filePath, content) => fs.writeFileSync(filePath, content, 'utf8');

if (!fs.existsSync(reportFile)) {
  console.error(`[sync-mobile-qa-status] report not found: ${reportFile}`);
  process.exit(1);
}

const report = read(reportFile);
const totalExistingMatch = report.match(/- totalExisting:\s*(\d+)/);
const totalMissingMatch = report.match(/- totalMissing:\s*(\d+)/);
const statusMatch = report.match(/- status:\s*([A-Z_]+)/);

if (!totalExistingMatch || !totalMissingMatch || !statusMatch) {
  console.error('[sync-mobile-qa-status] failed to parse report totals/status');
  process.exit(1);
}

const existing = Number(totalExistingMatch[1]);
const missing = Number(totalMissingMatch[1]);
const status = statusMatch[1];

const interpretation =
  status === 'READY_FOR_FINALIZATION'
    ? '- 해석: 증빙 파일이 모두 확보되어 최종 `PASS/FAIL` 확정 가능'
    : '- 해석: 현재 증빙 파일 부재로 최종 `PASS/FAIL` 확정 불가, `CONDITIONAL PASS` 유지';

if (fs.existsSync(finalizationFile)) {
  let finalization = read(finalizationFile);
  finalization = finalization
    .replace(/- 캡처 존재:\s*\d+\/16/, `- 캡처 존재: ${existing}/16`)
    .replace(/- 누락:\s*\d+\/16/, `- 누락: ${missing}/16`)
    .replace(/- 해석:\s*.*/g, interpretation);
  write(finalizationFile, finalization);
  console.log(`[sync-mobile-qa-status] updated: ${path.basename(finalizationFile)}`);
}

if (fs.existsSync(checklistFile)) {
  let checklist = read(checklistFile);
  checklist = checklist.replace(/자동 점검 기준 현재\s*\d+\/16/g, `자동 점검 기준 현재 ${existing}/16`);
  checklist = checklist.replace(/존재 점검\(현재\s*\d+\/16\)/g, `존재 점검(현재 ${existing}/16)`);
  write(checklistFile, checklist);
  console.log(`[sync-mobile-qa-status] updated: ${path.basename(checklistFile)}`);
}

console.log(`[sync-mobile-qa-status] status=${status}, existing=${existing}, missing=${missing}`);

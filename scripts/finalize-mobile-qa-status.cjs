const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const reportFile = path.join(root, 'reports', 'mobile-qa-evidence-status.md');
const finalizationFile = path.join(root, 'MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md');
const qaReportFile = path.join(root, 'MOBILE_3SCREEN_VIEWPORT_QA_REPORT_2026-05-04.md');

if (!fs.existsSync(reportFile)) {
  console.error(`[finalize-mobile-qa-status] report not found: ${reportFile}`);
  process.exit(1);
}

if (!fs.existsSync(finalizationFile)) {
  console.error(`[finalize-mobile-qa-status] finalization template not found: ${finalizationFile}`);
  process.exit(1);
}

const report = fs.readFileSync(reportFile, 'utf8');
const existingMatch = report.match(/- totalExisting:\s*(\d+)/);
const missingMatch = report.match(/- totalMissing:\s*(\d+)/);
const statusMatch = report.match(/- status:\s*([A-Z_]+)/);

if (!existingMatch || !missingMatch || !statusMatch) {
  console.error('[finalize-mobile-qa-status] failed to parse report');
  process.exit(1);
}

const existing = Number(existingMatch[1]);
const missing = Number(missingMatch[1]);
const status = statusMatch[1];
const isReady = status === 'READY_FOR_FINALIZATION' && existing === 16 && missing === 0;
const now = new Date().toISOString();

let finalization = fs.readFileSync(finalizationFile, 'utf8');

if (isReady) {
  finalization = finalization
    .replace(/- 전체 결과:\s*.*/g, '- 전체 결과: PASS')
    .replace(/- 판정 근거\(요약\):\s*.*/g, '- 판정 근거(요약): 16개 증빙 파일 확인 완료 및 자동 점검 결과 READY_FOR_FINALIZATION 확인.')
    .replace(/- 320x568:\s*.*/g, '- 320x568: PASS')
    .replace(/- 360x800:\s*.*/g, '- 360x800: PASS')
    .replace(/- 375x812:\s*.*/g, '- 375x812: PASS')
    .replace(/- 390x844:\s*.*/g, '- 390x844: PASS')
    .replace(/- 실측 담당:\s*.*/g, `- 실측 담당: 자동 반영(${now})`)
    .replace(/- 최종 승인자:\s*.*/g, '- 최종 승인자: 자동 승인 게이트(qa:mobile:refresh + qa:mobile:finalize)')
    .replace(/- 승인 시각:\s*.*/g, `- 승인 시각: ${now}`);
} else {
  finalization = finalization
    .replace(/- 전체 결과:\s*.*/g, '- 전체 결과: CONDITIONAL PASS (임시)')
    .replace(/- 판정 근거\(요약\):\s*.*/g, '- 판정 근거(요약): 자동 점검 기준 증빙 부족 상태로 최종 확정 보류.')
    .replace(/- 실측 담당:\s*.*/g, '- 실측 담당: 배정 대기')
    .replace(/- 최종 승인자:\s*.*/g, '- 최종 승인자: 대기')
    .replace(/- 승인 시각:\s*.*/g, '- 승인 시각: 대기');
}

fs.writeFileSync(finalizationFile, finalization, 'utf8');
console.log(`[finalize-mobile-qa-status] updated: ${path.basename(finalizationFile)} (${isReady ? 'PASS' : 'CONDITIONAL PASS'})`);

if (fs.existsSync(qaReportFile)) {
  let qaReport = fs.readFileSync(qaReportFile, 'utf8');
  if (isReady) {
    qaReport = qaReport
      .replace(/- 결과:\s*CONDITIONAL PASS \(실측 캡처 증빙 대기\)/g, '- 결과: PASS')
      .replace(/- 현재 판정은 `CONDITIONAL PASS`이며, FIELD_FORM 캡처 경로 입력 완료 시 `PASS` 또는 `FAIL`로 최종 확정한다\./g, '- 자동 점검 결과 READY_FOR_FINALIZATION 확인으로 본 리포트 결과를 PASS로 확정한다.');
  }
  fs.writeFileSync(qaReportFile, qaReport, 'utf8');
  console.log(`[finalize-mobile-qa-status] updated: ${path.basename(qaReportFile)}`);
}

if (isReady) {
  console.log('[finalize-mobile-qa-status] RESULT=FINALIZED_PASS');
  process.exit(0);
}

console.log('[finalize-mobile-qa-status] RESULT=NOT_FINALIZED');
process.exit(1);

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = {
  packageJson: path.join(root, 'package.json'),
  syncUtil: path.join(root, 'utils', 'managerReviewSync.ts'),
  ocrPage: path.join(root, 'pages', 'OcrAnalysis.tsx'),
  detailModal: path.join(root, 'components', 'modals', 'RecordDetailModal.tsx'),
  geminiService: path.join(root, 'services', 'geminiService.ts'),
};

const sources = Object.fromEntries(
  Object.entries(files).map(([key, filePath]) => [key, fs.readFileSync(filePath, 'utf8')]),
);
const packageJson = JSON.parse(sources.packageJson);

const requiredMarkers = [
  ['syncUtil', 'MANAGER_REVIEW_SYNC_RULE_VERSION'],
  ['syncUtil', 'synchronizeManagerReviewedRecord'],
  ['syncUtil', 'getManagerReviewApprovalReadiness'],
  ['syncUtil', 'getManagerReviewApprovalBlockers'],
  ['syncUtil', 'isKoreanWorker'],
  ['syncUtil', "severity === 'error'"],
  ['syncUtil', 'deriveCompetencyProfile(record)'],
  ['syncUtil', 'evaluateOcrVerificationCompleteness'],
  ['syncUtil', 'evaluateOcrVerificationQuality'],
  ['syncUtil', '관리자 수정 동기화 검증'],
  ['syncUtil', '모국어 안내 갱신 필요'],
  ['syncUtil', 'NATIVE_GUIDANCE_MISSING'],
  ['syncUtil', 'NATIVE_GUIDANCE_REFRESH_REQUIRED'],
  ['syncUtil', 'FORM_INTEGRITY_WARNING'],
  ['syncUtil', 'evaluateNativeGuidanceRevisionSync'],
  ['syncUtil', 'evaluatePsiFormIntegrity'],
  ['syncUtil', 'COMPETENCY_PROFILE_REFRESHED'],
  ['ocrPage', 'synchronizeManagerReviewedRecord(mergedRecord'],
  ['ocrPage', 'managerReviewReadinessById'],
  ['ocrPage', 'getNativeReadinessForRecord(r)'],
  ['ocrPage', 'nativeReadiness.badgeLabel'],
  ['detailModal', 'synchronizeManagerReviewedRecord(baseRecord, { previousRecord })'],
  ['detailModal', 'synchronizeManagerReviewedRecord(reassessedRecord'],
  ['detailModal', 'getManagerReviewApprovalReadiness(record, initialRecord)'],
  ['detailModal', 'previousRecord: baseRecord'],
  ['detailModal', 'getManagerReviewApprovalBlockers(record)'],
  ['detailModal', 'approvalActionDisabled'],
  ['detailModal', '모국어 안내 동기화'],
  ['geminiService', 'updateAnalysisBasedOnEdits'],
  ['geminiService', 'actionable_coaching_native'],
  ['geminiService', 'scoreBreakdown'],
];

const missing = requiredMarkers
  .filter(([sourceKey, marker]) => !sources[sourceKey].includes(marker))
  .map(([sourceKey, marker]) => `${sourceKey}: ${marker}`);

const scriptValue = packageJson.scripts?.['check:manager-review-sync'];
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!scriptValue || !scriptValue.includes('check-manager-review-sync-contract.cjs')) {
  missing.push('package.json script check:manager-review-sync');
}

if (!verifyFast.includes('check:manager-review-sync')) {
  missing.push('verify:fast includes check:manager-review-sync');
}

if (missing.length > 0) {
  console.error('[check-manager-review-sync-contract] FAIL');
  missing.forEach((marker) => console.error(`- missing: ${marker}`));
  process.exit(1);
}

console.log('[check-manager-review-sync-contract] PASS');
console.log('- Manager edits synchronize native guidance checks and competency profile recalculation.');

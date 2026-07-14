const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const files = {
  packageJson: JSON.parse(read('package.json')),
  formMaster: read('config/psiFormMaster.ts'),
  integrity: read('utils/psiFormIntegrity.ts'),
  managerSync: read('utils/managerReviewSync.ts'),
  gemini: read('services/geminiService.ts'),
  gateway: read('api/gateway.ts'),
  detailModal: read('components/modals/RecordDetailModal.tsx'),
  fieldContext: read('pages/FieldContextInput.tsx'),
};

const failures = [];

const required = [
  ['config/psiFormMaster.ts', files.formMaster, 'PSI_FORM_MASTER_VERSION'],
  ['config/psiFormMaster.ts', files.formMaster, 'PSI_FORM_QUESTIONS'],
  ['config/psiFormMaster.ts', files.formMaster, 'PSI_STANDARD_JOB_FIELDS'],
  ['config/psiFormMaster.ts', files.formMaster, 'PSI_RISK_TYPE_CATALOG'],
  ['config/psiFormMaster.ts', files.formMaster, 'Q1 답변은 jobField를 대체하지 않는다'],
  ['config/psiFormMaster.ts', files.formMaster, '반복위반 패널티는 이번 한 장의 기록지 문구 반복이 아니라'],
  ['utils/psiFormIntegrity.ts', files.integrity, 'evaluatePsiFormIntegrity'],
  ['utils/psiFormIntegrity.ts', files.integrity, 'evaluateNativeGuidanceRevisionSync'],
  ['utils/psiFormIntegrity.ts', files.integrity, 'REPEAT_PENALTY_NOT_TRACKED'],
  ['utils/managerReviewSync.ts', files.managerSync, 'NATIVE_GUIDANCE_REFRESH_REQUIRED'],
  ['utils/managerReviewSync.ts', files.managerSync, 'FORM_INTEGRITY_WARNING'],
  ['utils/managerReviewSync.ts', files.managerSync, 'evaluatePsiFormIntegrity'],
  ['utils/managerReviewSync.ts', files.managerSync, 'evaluateNativeGuidanceRevisionSync'],
  ['services/geminiService.ts', files.gemini, 'PSI_FORM_MASTER_PROMPT_BLOCK'],
  ['api/gateway.ts', files.gateway, 'PSI_FORM_MASTER_PROMPT_BLOCK'],
  ['components/modals/RecordDetailModal.tsx', files.detailModal, 'getPsiQuestionLabel(ans.questionNumber)'],
  ['components/modals/RecordDetailModal.tsx', files.detailModal, 'getManagerReviewApprovalReadiness(record, initialRecord)'],
  ['components/modals/RecordDetailModal.tsx', files.detailModal, 'previousRecord: baseRecord'],
  ['pages/FieldContextInput.tsx', files.fieldContext, 'PSI_STANDARD_JOB_FIELDS'],
  ['pages/FieldContextInput.tsx', files.fieldContext, 'PSI_RISK_TYPE_CATALOG'],
  ['pages/FieldContextInput.tsx', files.fieldContext, 'priorityRisk'],
];

for (const [file, content, marker] of required) {
  if (!content.includes(marker)) failures.push(`${file}: missing "${marker}"`);
}

const checkScript = files.packageJson.scripts?.['check:form-master-sync'] || '';
const verifyFast = files.packageJson.scripts?.['verify:fast'] || '';

if (!checkScript.includes('check-form-master-sync-contract.cjs')) {
  failures.push('package.json script check:form-master-sync');
}

if (!verifyFast.includes('check:form-master-sync')) {
  failures.push('verify:fast includes check:form-master-sync');
}

if (failures.length > 0) {
  console.error('[check-form-master-sync-contract] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[check-form-master-sync-contract] PASS');
console.log('- PSI form master drives OCR prompts, question labels, manager review sync, risk taxonomy, and mobile field input.');

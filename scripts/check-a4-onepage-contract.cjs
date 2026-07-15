const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const files = {
  page: read('pages/A4EducationMaterial.tsx'),
  handoffPanel: read('components/tbm/ExternalAiHandoffPanel.tsx'),
  handoffPrompt: read('utils/externalAiHandoff.ts'),
  training: read('pages/AdminTraining.tsx'),
  studio: read('utils/tbmEducationStudio.ts'),
  sourceExtraction: read('utils/tbmSourceExtraction.ts'),
  packageJson: JSON.parse(read('package.json')),
};

const failures = [];

const required = [
  ['pages/A4EducationMaterial.tsx', files.page, 'finishCompactSentence'],
  ['pages/A4EducationMaterial.tsx', files.page, 'trimToReadableBoundary'],
  ['pages/A4EducationMaterial.tsx', files.page, 'completeA4Items'],
  ['pages/A4EducationMaterial.tsx', files.page, 'getHighGradeRiskShareItems'],
  ['pages/A4EducationMaterial.tsx', files.page, '회의자료에서 상등급으로 지정된 공유 항목이 없습니다'],
  ['pages/A4EducationMaterial.tsx', files.page, 'translationNeedsRefresh'],
  ['pages/A4EducationMaterial.tsx', files.page, 'currentPreviewIsStaleTranslation'],
  ['pages/A4EducationMaterial.tsx', files.page, 'openAiDraftStepWithCurrentSources'],
  ['pages/A4EducationMaterial.tsx', files.page, '상등급 검증 목록을 먼저 갱신했습니다'],
  ['pages/A4EducationMaterial.tsx', files.page, '기존 다국어 탭은 대조용으로 유지했습니다'],
  ['pages/A4EducationMaterial.tsx', files.page, '다국어 재생성 단계로 이동'],
  ['pages/A4EducationMaterial.tsx', files.page, '검수용 좌우대조'],
  ['pages/A4EducationMaterial.tsx', files.page, '언어별 출력본'],
  ['pages/A4EducationMaterial.tsx', files.page, "mode === 'translation' ? draft : nextDraft"],
  ['pages/A4EducationMaterial.tsx', files.page, "setViewMode('single')"],
  ['components/tbm/ExternalAiHandoffPanel.tsx', files.handoffPanel, '수정본 그대로 다국어만 갱신'],
  ['components/tbm/ExternalAiHandoffPanel.tsx', files.handoffPanel, "if (translationNeedsRefresh) setAiMode('translation')"],
  ['components/tbm/ExternalAiHandoffPanel.tsx', files.handoffPanel, '수정본 번역 요청문 복사'],
  ['utils/externalAiHandoff.ts', files.handoffPrompt, '[현재 검수 완료 한국어 원문]'],
  ['utils/externalAiHandoff.ts', files.handoffPrompt, '위험성평가 회의자료(PPT/PDF/문서)'],
  ['utils/externalAiHandoff.ts', files.handoffPrompt, '근로자 Q3 응답'],
  ['utils/externalAiHandoff.ts', files.handoffPrompt, 'findMatchingHighGradeRisk'],
  ['utils/externalAiHandoff.ts', files.handoffPrompt, '다음 페이지/다음 슬라이드에 이어지는 항목도 상등급 섹션'],
  ['utils/externalAiHandoff.ts', files.handoffPrompt, '새 초안을 만드는 단계가 아닙니다'],
  ['utils/tbmEducationStudio.ts', files.studio, '[오늘 반드시 전달할 한 문장]'],
  ['utils/tbmEducationStudio.ts', files.studio, '[현장중점관리 참고]'],
  ['utils/tbmEducationStudio.ts', files.studio, 'isMeetingRiskSource'],
  ['utils/tbmEducationStudio.ts', files.studio, 'HIGH_GRADE_SHARE_EVIDENCE_PATTERN'],
  ['utils/tbmEducationStudio.ts', files.studio, 'HIGH_GRADE_SECTION_START_PATTERN'],
  ['utils/tbmEducationStudio.ts', files.studio, 'HIGH_GRADE_SECTION_END_PATTERN'],
  ['utils/tbmEducationStudio.ts', files.studio, 'createSourceSegments'],
  ['utils/tbmEducationStudio.ts', files.studio, 'collectRiskCandidatesFromSegment'],
  ['utils/tbmEducationStudio.ts', files.studio, 'NON_HIGH_GRADE_ROW_PATTERN'],
  ['utils/tbmEducationStudio.ts', files.studio, 'collectFieldRecordFocusPoints'],
  ['utils/tbmEducationStudio.ts', files.studio, 'getHighGradeRiskShareItems'],
  ['utils/tbmEducationStudio.ts', files.studio, 'extractHighGradeRiskCandidatesFromText'],
  ['utils/tbmEducationStudio.ts', files.studio, '회의자료 상등급'],
  ['utils/tbmEducationStudio.ts', files.studio, 'draft.coreMessage'],
  ['pages/AdminTraining.tsx', files.training, 'translationNeedsRefresh'],
  ['pages/AdminTraining.tsx', files.training, '기존 번역은 재사용하지 않고'],
  ['utils/tbmEducationStudio.ts', files.studio, 'translationNeedsRefresh?: boolean'],
  ['utils/tbmSourceExtraction.ts', files.sourceExtraction, '--- page ${pageNumber} ---'],
  ['utils/tbmSourceExtraction.ts', files.sourceExtraction, '--- slide ${slides.length + 1} ---'],
];

for (const [file, content, marker] of required) {
  if (!content.includes(marker)) failures.push(`${file}: missing "${marker}"`);
}

if (files.page.includes('supplementalRisks') || files.studio.includes('기본 안전교육 보기글')) {
  failures.push('A4 high-grade risk sharing must not auto-fill supplemental/default risks');
}

if (files.studio.includes('isHighGradeRiskRecord') || files.studio.includes('getRecordSelfAssessedRiskLevel')) {
  failures.push('A4 high-grade risk sharing must not use worker Q3/self-assessed risk level as high-grade evidence');
}

if (files.page.includes('Q3 위험수준이 상등급') || files.studio.includes('Q3 위험수준이 상등급') || files.handoffPrompt.includes('"Q3 상"')) {
  failures.push('A4 high-grade risk sharing copy must point to meeting PPT/PDF, not Q3');
}

if (files.studio.includes('if (risk.managerConfirmed) return true')) {
  failures.push('A4 high-grade risk sharing must require meeting-material high-grade evidence, not managerConfirmed alone');
}

const compactTextBody = files.page.match(/const compactText =[\s\S]*?const compactLines =/);
if (!compactTextBody) {
  failures.push('pages/A4EducationMaterial.tsx: compactText block not found');
} else {
  if (compactTextBody[0].includes('...')) {
    failures.push('pages/A4EducationMaterial.tsx: compactText must not append ellipsis to worker-facing A4 text');
  }
  if (compactTextBody[0].includes('slice(0, Math.max(0, maxLength - 3))')) {
    failures.push('pages/A4EducationMaterial.tsx: compactText still uses hard cut fallback');
  }
}

const markPackageBody = files.page.match(/const markPackageDraftChanged =[\s\S]*?const buildCurrentFallbackDraft =/);
if (!markPackageBody) {
  failures.push('pages/A4EducationMaterial.tsx: markPackageDraftChanged block not found');
} else if (markPackageBody[0].includes('setTranslatedTexts({})')) {
  failures.push('pages/A4EducationMaterial.tsx: package review must not erase translated language tabs');
}

const previewBlock = files.page.match(/<article ref=\{sheetRef\}[\s\S]*?<div className="mt-4 grid gap-2 sm:grid-cols-4 no-print">/);
if (!previewBlock) {
  failures.push('pages/A4EducationMaterial.tsx: A4 preview block not found');
} else {
  for (const forbidden of ['line-clamp', 'truncate']) {
    if (previewBlock[0].includes(forbidden)) {
      failures.push(`pages/A4EducationMaterial.tsx: A4 preview block should not visually cut final text with ${forbidden}`);
    }
  }
}

const estimateLoadBody = files.page.match(/const estimateA4Load =[\s\S]*?const getA4FitMode =/);
if (!estimateLoadBody) {
  failures.push('pages/A4EducationMaterial.tsx: estimateA4Load block not found');
} else {
  if (!estimateLoadBody[0].includes("if (previewLanguage === 'ko-KR') return draftLoad + countPenalty")) {
    failures.push('pages/A4EducationMaterial.tsx: Korean and translated page load calculations must be separated');
  }
  if (!estimateLoadBody[0].includes("viewMode === 'single'")) {
    failures.push('pages/A4EducationMaterial.tsx: translated single-page fit mode must not be driven by Korean draft length');
  }
}

const checkScript = files.packageJson.scripts?.['check:a4-onepage'] || '';
const verifyFast = files.packageJson.scripts?.['verify:fast'] || '';

if (!checkScript.includes('check-a4-onepage-contract.cjs')) {
  failures.push('package.json script check:a4-onepage');
}

if (!verifyFast.includes('check:a4-onepage')) {
  failures.push('verify:fast includes check:a4-onepage');
}

if (failures.length > 0) {
  console.error('[check-a4-onepage-contract] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[check-a4-onepage-contract] PASS');
console.log('- A4 education output uses only meeting-material high-grade risks, keeps focus points separate, and preserves review-safe multilingual refresh.');

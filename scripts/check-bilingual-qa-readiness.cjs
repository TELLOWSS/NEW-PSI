const fs = require('fs');
const path = require('path');

const root = process.cwd();

const targets = {
  mockData: path.join(root, 'mockData.ts'),
  reportTemplate: path.join(root, 'components', 'ReportTemplate.tsx'),
  recordDetail: path.join(root, 'components', 'modals', 'RecordDetailModal.tsx'),
  individualReport: path.join(root, 'pages', 'IndividualReport.tsx'),
};

const requiredNationalities = [
  '베트남',
  '중국',
  '태국',
  '캄보디아',
  '인도네시아',
  '몽골',
  '러시아',
  '카자흐스탄',
  '미얀마',
];

const checks = [];

const safeRead = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    checks.push({
      name: `파일 열기 실패: ${filePath}`,
      pass: false,
      detail: String(error.message || error),
    });
    return '';
  }
};

const mockData = safeRead(targets.mockData);
const reportTemplate = safeRead(targets.reportTemplate);
const recordDetail = safeRead(targets.recordDetail);
const individualReport = safeRead(targets.individualReport);

if (mockData) {
  checks.push({
    name: 'QA 시드 배열 export 존재',
    pass: mockData.includes('export const qaBilingualWorkerSeedRecords'),
    detail: 'mockData.ts 에 qaBilingualWorkerSeedRecords export 확인',
  });

  for (const nation of requiredNationalities) {
    checks.push({
      name: `국적 샘플 포함: ${nation}`,
      pass: mockData.includes(`nationality: '${nation}'`),
      detail: `${nation} 샘플 데이터 존재 여부`,
    });
  }

  checks.push({
    name: 'Q1~Q5 모국어 번역 필드 포함',
    pass: mockData.includes('nativeTranslation') && mockData.includes("questionNumber: '5'"),
    detail: 'handwrittenAnswers 내 nativeTranslation 및 1~5 문항 구조 확인',
  });
}

if (reportTemplate) {
  checks.push({
    name: '리포트 앞/뒷장 제목 이중표기 유틸 존재',
    pass: reportTemplate.includes('getAppendixTitleNative') && reportTemplate.includes('getWorkerInfoNative'),
    detail: '외국인 제목 이중표기 함수 존재 여부',
  });

  checks.push({
    name: '리포트 재평가 메모 정제 적용',
    pass: reportTemplate.includes('sanitizeOperationalNote(entry.note || reassessmentFallback, record.nationality)'),
    detail: '기술/영문 에러 문구 정제 연결',
  });

  checks.push({
    name: '외국인 섹션 [KO] 보조 표기 존재',
    pass: reportTemplate.includes('[KO] <HighlightedText text={entry.text} />') || reportTemplate.includes('[KO] <HighlightedText text={frontVerdictKoText} />'),
    detail: '모국어 + 한국어 병기 표식 확인',
  });
}

if (recordDetail) {
  checks.push({
    name: '상세보기 재평가/타임라인 정제 적용',
    pass: recordDetail.includes('sanitizeOperationalNote(entry.note, record.nationality)'),
    detail: '근로자 상세보기에서 재평가/감사 로그 정제 적용',
  });

  checks.push({
    name: '상세보기 헤더 한글화 적용',
    pass: recordDetail.includes('한국어 해석 (KO)') && recordDetail.includes('모국어 안내 ('),
    detail: '영어 헤더(KOREAN INTERPRETATION/NATIVE SUPPORT) 제거 여부',
  });
}

if (individualReport) {
  checks.push({
    name: '개인 리포트 재평가 문구 한글화',
    pass: individualReport.includes("const reassessmentTitle = '재평가 타임라인';") && individualReport.includes("const reassessmentTag = '[재평가]';"),
    detail: 'Reassessment 영문 표기 제거 확인',
  });

  checks.push({
    name: '개인 리포트 재평가 메모 정제 적용',
    pass: individualReport.includes('sanitizeOperationalNote(entry.note || reassessmentFallback, record.nationality)'),
    detail: '재평가 메모 기술문구 정제 연결 확인',
  });
}

const passed = checks.filter((item) => item.pass).length;
const failed = checks.length - passed;

console.log('=== PSI 다국어 리포트 QA 체크리스트 ===');
for (const item of checks) {
  console.log(`${item.pass ? '✅' : '❌'} ${item.name}`);
  if (!item.pass) console.log(`   - ${item.detail}`);
}
console.log('----------------------------------------');
console.log(`총 ${checks.length}개 항목 중 ${passed}개 통과, ${failed}개 실패`);

if (failed > 0) {
  process.exit(1);
}

const fs = require('fs');
const path = require('path');

const sourcePath = path.resolve(__dirname, '..', 'services', 'geminiService.ts');
const source = fs.readFileSync(sourcePath, 'utf8');

const failures = [];

if (source.includes('|| /줄걸이|고리|체결|안전고리|안전벨트/.test(q4)')) {
  failures.push('Q4 single safety-equipment keyword still forces highest proficiency band.');
}

if (source.includes('const hasTimeAndWho = /전|후|시작|종료|내가|내가\\s*직접|팀원|신호수|확인/.test(q5);')) {
  failures.push('Q5 single 확인 keyword still forces improvementExecution >=14.');
}

if (source.includes('Q4 감소대책과 Q5 실천행동이 유사하여 반복 답변 패널티')) {
  failures.push('Same-record Q4/Q5 repetition must not be scored as repeatViolationPenalty.');
}

if (source.includes('껍데기 단어만 반복되면 즉시 -30점')) {
  failures.push('Single-record filler wording must not be described as repeatViolationPenalty.');
}

for (const marker of [
  'const controlKeywordCount',
  'const hasVerificationDetail',
  'const hasTimeMarker',
  'const actionKeywordCount',
  '안전장비 단일 조치 중심',
  'buildFallbackScoreBreakdownFromAnswers',
  '6대 지표 세부점수가 누락',
  'Q4 감소대책과 Q5 실천행동이 유사하여 개선이행도 감점',
  '현재 단일 기록지에서는 다음 운영 주기 이행 여부를 확정할 수 없어 반복위반 패널티를 추적관리 단계로 보류',
  'calcNgramSimilarity',
]) {
  if (!source.includes(marker)) failures.push(`Missing calibration marker: ${marker}`);
}

if (failures.length > 0) {
  console.error('[check-score-calibration-contract] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[check-score-calibration-contract] PASS');

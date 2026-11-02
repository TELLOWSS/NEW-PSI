/**
 * NEW-PSI F10 batch-33 simulation; no browser, network, writes or deployment.
 * An automated state matrix is not actual site inspection or a device test.
 */
import assert from 'node:assert/strict';
import {buildLocalRecheckQueue,LOCAL_RECHECK_BUCKETS,summarizeLocalRecheckQueue} from '../lib/inspector/localRecheckQueue.mjs';
import {buildLocalRecheckReport,formatLocalRecheckCsv,formatLocalRecheckPrintHtml} from '../lib/inspector/localRecheckReport.mjs';
import {selectLocalHandoffTargets} from '../lib/inspector/localRecheckHandoff.mjs';

const NOW = new Date(2026,10,2,12,0,0);
const STATUSES = ['pending','in_progress','review_requested','needs_work','verified'];
const RECHECKS = ['delayed','temporary_checked','needs_more','review_requested'];
const DATES = [
  ['2026-10-28','overdue'],
  ['2026-11-02','today'],
  ['2026-11-04','soon'],
  ['2026-11-08','scheduled'],
  ['','unscheduled'],
];
const CHRONOLOGY = [
  ['older','2026-10-28T08:00:00.000Z','2026-11-01T08:00:00.000Z',false],
  ['equal','2026-11-01T08:00:00.000Z','2026-11-01T08:00:00.000Z',false],
  ['newer','2026-11-02T08:00:00.000Z','2026-11-01T08:00:00.000Z',true],
];
const PRIVATE = 'SYNTHETIC-PRIVATE-DETAIL-MUST-NOT-EXPORT';
const buckets = new Set(LOCAL_RECHECK_BUCKETS);
const unresolved = new Set(['delayed','temporary_checked','needs_more']);
let cases = 0;
let exported = 0;
let conflicts = 0;
for (const status of STATUSES) for (const result of RECHECKS)
for (const [nextDate,normalBucket] of DATES)
for (const [chronology,verifiedAt,recheckedAt,verificationNewer] of CHRONOLOGY) {
  const followup = {
    status,
    assignee:PRIVATE,
    dueDate:'2026-10-01',
    temporaryMeasure:'접근통제는 기기 입력으로만 확인',
    history:[{
      status,assignee:PRIVATE,dueDate:'2026-10-01',
      temporaryMeasure:'접근통제는 기기 입력으로만 확인',
      note:PRIVATE,at:verifiedAt,
    }],
  };
  const recheck = {
    id:'00000000-0000-4000-8000-000000000011',result,
    at:recheckedAt, nextCheckDate:nextDate,
    followupStatus:status,photoSha256:'f'.repeat(64),
    reason:PRIVATE,note:PRIVATE,
  };
  const record={
    id:'synthetic-'+cases,
    note:PRIVATE,
    siteContext:{site:'TEST ONLY',building:'2001',level:'16F',trade:'형틀'},
    followup,rechecks:[recheck],
    additionalActions:[{
      id:'00000000-0000-4000-8000-000000000012',
      title:'=HYPERLINK("https://example.invalid")',
      followup,rechecks:[recheck],
    }],
  };
  const before = JSON.stringify(record);
  const queue = buildLocalRecheckQueue([record],NOW);
  assert.equal(queue.length,2);
  const mustConflict=status==='verified'&&unresolved.has(result)&&!verificationNewer;
  const expected=mustConflict?'conflict':status==='verified'?'verified':normalBucket;
  if (mustConflict) conflicts++;
  assert.ok(queue.every(item=>buckets.has(item.bucket)&&item.bucket===expected),
    'misclassified '+JSON.stringify({status,result,nextDate,chronology,expected,got:queue.map(x=>x.bucket)}));
  assert.ok(queue.every(item=>item.date===nextDate),'stale follow-up deadline resurrected');
  assert.ok(queue.every(item=>item.dateSource==='재점검 예정일'));
  assert.equal(summarizeLocalRecheckQueue(queue).total,2);
  const handoff=selectLocalHandoffTargets(queue);
  if (expected==='verified') assert.equal(handoff.length,0);
  else if(expected!=='scheduled')assert.equal(handoff.length,2);
  // Report paths are sampled across every status/result/date combination.
  if (cases%3===0) {
    const report=buildLocalRecheckReport(queue,[record],{generatedAt:NOW});
    const csv=formatLocalRecheckCsv(report);
    const html=formatLocalRecheckPrintHtml(report);
    assert.equal(report.summary.total,2);
    for(const value of [csv,html]){
      assert.ok(!value.includes(PRIVATE),'private details were exposed by default');
      assert.ok(!value.includes('f'.repeat(64)),'full photo digest leaked');
    }
    assert.ok(csv.includes("'=HYPERLINK"),'spreadsheet formula not escaped');
    assert.ok(!html.includes('<script>'),'print HTML script element');
    exported++;
  }
  assert.equal(JSON.stringify(record),before,'original record mutated');
  cases++;
}
assert.equal(cases,300);
assert.equal(exported,100);
assert.ok(conflicts>0);
console.log(JSON.stringify({
  status:'PASS',
  syntheticOnly:true,
  noDeployment:true,
  noRealDeviceClaim:true,
  matrixCases:cases,
  targetStatesChecked:cases*2,
  privacyExportsChecked:exported*2,
  contradictoryVerifiedCases:conflicts,
}));

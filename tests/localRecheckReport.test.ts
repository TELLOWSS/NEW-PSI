import {describe,it,expect} from 'vitest';
import {
  buildLocalRecheckReport,selectLocalRecheckReportTargets,
  formatLocalRecheckCsv,formatLocalRecheckPrintHtml,
  f10CsvCell,F10_LOCAL_REPORT_LIMIT,
} from '../lib/inspector/localRecheckReport.mjs';
import {buildLocalRecheckQueue} from '../lib/inspector/localRecheckQueue.mjs';

const now=new Date(2026,10,1,14,0);
const recheck={
  id:'123e4567-e89b-12d3-a456-426614174000',
  result:'delayed',reason:'보수 자재 공급 지연',note:'임시 통제 유지 점검',
  nextCheckDate:'2026-11-02',at:'2026-10-31T11:00:00.000Z',
  photoSha256:'a'.repeat(64),followupStatus:'in_progress',
};
const followup={
  status:'in_progress',assignee:'=HYPERLINK("https://bad.example/")',
  dueDate:'2026-10-25',temporaryMeasure:'임시 출입통제 유지',
  history:[{status:'in_progress',assignee:'담당자',dueDate:'2026-10-25',
    note:'진행 중',at:'2026-10-31T10:00:00.000Z'}],
};
const source={
  id:'synthetic-record-1',note:'<script>alert("bad")</script> 직접 확인 내용',
  siteContext:{site:'용인 <현장>',building:'2001동',level:'16F',trade:'형틀'},
  followup,rechecks:[recheck],
  photo:new Blob(['PRIVATE ORIGINAL PHOTO DATA'],{type:'image/png'}),
  additionalActions:[{
    id:'synthetic-action-1',title:'=2+2',
    followup:{...followup,status:'verified',assignee:'비공개 담당자',
      temporaryMeasure:'임시 안전조치 종결'},
    rechecks:[{...recheck,photoSha256:null,at:'2026-10-30T08:00:00.000Z',
      result:'review_requested',nextCheckDate:'2026-11-03'}],
  }],
};

describe('PSI F10 local-only management report',()=>{
  const create=(opts:Record<string,unknown>={})=>{
    const queue=buildLocalRecheckQueue([source],now);
    return buildLocalRecheckReport(queue,[source],{generatedAt:now,...opts});
  };
  it('provides accurate counts for actions, not photos or past events',()=>{
    const report=create();
    expect(report.summary).toMatchObject({total:2,inspectionCount:1,soon:1,verified:1});
    expect(report.entries).toHaveLength(2);
    expect(report.entries[0].date).toBe('2026-11-02');
    expect(report.entries[0].dateSource).toBe('재점검 예정일');
    expect(report.entries[0].hasEvidenceHash).toBe('연결 해시 기록 있음');
  });
  it('minimizes names and detailed notes by default, but keeps manual context',()=>{
    const report=create();
    expect(report.includeDetails).toBe(false);
    expect(report.includeAssignees).toBe(false);
    const output=formatLocalRecheckCsv(report);
    const print=formatLocalRecheckPrintHtml(report);
    for(const text of [output,print]){
      expect(text).not.toContain('비공개 담당자');
      expect(text).not.toContain('HYPERLINK');
      expect(text).not.toContain('보수 자재 공급 지연');
      expect(text).not.toContain('PRIVATE ORIGINAL PHOTO DATA');
      expect(text).not.toContain('a'.repeat(64));
      expect(text).not.toContain('alert("bad")');
      expect(text).toContain('2001동');
      expect(text).toContain('내부');
    }
    expect(print).toContain('현장 용인 &lt;현장&gt;');
    expect(print).not.toContain('<script>');
    expect(print).toContain("default-src 'none'");
    expect(print).not.toContain('<img');
    expect(print).not.toContain('https://bad.example');
    expect(report.warning).toContain('승인하지 않습니다');
  });
  it('user-selected detailed export includes free text safely escaped in HTML',()=>{
    const report=create({includeDetails:true,includeAssignees:true});
    expect(report.entries[0].reason).toBe('보수 자재 공급 지연');
    expect(report.entries[0].assignee).toContain('HYPERLINK');
    const csv=formatLocalRecheckCsv(report);
    const html=formatLocalRecheckPrintHtml(report);
    expect(csv).toContain("\"'=HYPERLINK");
    expect(csv).toContain('보수 자재 공급 지연');
    expect(csv).toContain('<script>'); // CSV stays plain UTF-8 text; strings are guarded for spreadsheet formula execution.
    expect(html).toContain('&lt;script&gt;alert(&quot;bad&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;https://bad.example/');
    expect(html).toContain('임시 안전조치 종결');
    expect(html).not.toContain('<img');
  });
  it('escapes Excel-style formula cells and CSV quotes, including hidden prefixes',()=>{
    for(const input of ['=1+1','+cmd','-cmd','@SUM(1)','  =2+2','\t=4+4','\u200b=5+5']){
      expect(f10CsvCell(input)).toMatch(/^"'/);
    }
    expect(f10CsvCell('a"b')).toBe('"a""b"');
    expect(f10CsvCell('line\nbreak')).toBe('"line break"');
    expect(f10CsvCell('일반 작업')).toBe('"일반 작업"');
    expect(f10CsvCell('2026-11-01')).toBe('"2026-11-01"');
  });
  it('filters current bucket or legacy visible rows without changing original data',()=>{
    const queue=buildLocalRecheckQueue([source],now);
    expect(selectLocalRecheckReportTargets([source],queue,'recheck:soon','visible',now)).toHaveLength(1);
    expect(selectLocalRecheckReportTargets([source],queue,'recheck:overdue','visible',now)).toEqual([]);
    expect(selectLocalRecheckReportTargets([source],queue,'all','visible',now)).toHaveLength(2);
    expect(selectLocalRecheckReportTargets([source],queue,'recheck:overdue','all',now)).toHaveLength(2);
    const before=JSON.stringify(source);
    create({includeDetails:true});
    expect(JSON.stringify(source)).toBe(before);
  });
  it('refuses missing target, zero target and unrealistic report sizes',()=>{
    const queue=buildLocalRecheckQueue([source],now);
    expect(()=>buildLocalRecheckReport([], [source],{generatedAt:now})).toThrow('내보낼');
    expect(()=>buildLocalRecheckReport(queue,[],{generatedAt:now})).toThrow('원본 점검');
    expect(()=>buildLocalRecheckReport(Array(F10_LOCAL_REPORT_LIMIT+1).fill(queue[0]),[source],{generatedAt:now}))
      .toThrow('500');
  });
  it('does not infer a source site when it was never recorded',()=>{
    const unnamed={...source,id:'unknown-site',siteContext:undefined};
    const report=buildLocalRecheckReport(buildLocalRecheckQueue([unnamed],now),[unnamed],{generatedAt:now});
    expect(report.entries[0].site).toBe('현장정보 미기록');
  });
});

import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// Source-only. This never contacts Supabase, the network or a real worker.
type Case={id:string;status:string;evidence:string|null;reviewedBy:string|null;
  reviewedAt:string|null;sourceSha:string|null;reason:string|null};
type Ledger={environment:{approved:boolean;projectRef:string|null;
  approvalEvidence:string|null;approvedBy:string|null};cases:Case[]};
const source=resolve('config/psi-l06-isolated-auth-acceptance-ledger.json');
const checker=resolve('scripts/check-psi-l06-isolated-auth-acceptance.mjs');
const baseline=()=>JSON.parse(readFileSync(source,'utf8')) as Ledger;
function invoke(change?:(draft:Ledger)=>void){
  const folder=mkdtempSync(join(tmpdir(),'psi-l06-ledger-'));
  try{
    const ledger=baseline();
    change?.(ledger);
    const file=join(folder,'ledger.json');
    writeFileSync(file,JSON.stringify(ledger));
    const result=spawnSync(process.execPath,[checker,file],{
      cwd:process.cwd(),encoding:'utf8',timeout:12000,env:{...process.env},
    });
    return {exit:result.status,output:result.stdout+result.stderr};
  }finally{
    rmSync(folder,{recursive:true,force:true});
  }
}
describe('L06 isolated real Auth evidence ledger must fail closed',()=>{
  it('only validates 25 NOT RUN cases, never marks real Supabase or release PASS',()=>{
    const result=invoke();
    expect(result.exit).toBe(0);
    expect(result.output).toContain('A01-A25=25; PASS=0; NOT_RUN=25');
    expect(result.output).toContain('REAL_AUTH_ACCEPTANCE=BLOCKED; RELEASE=BLOCKED');
  });
  it('refuses naming the operating PSI-Database as an isolated test project',()=>{
    const result=invoke(l=>{
      l.environment={approved:true,projectRef:'dpnmslogvwuzmighsgnt',
        approvedBy:'independent reviewer',approvalEvidence:'https://example.invalid/approval'};
    });
    expect(result.exit).not.toBe(0);
    expect(result.output).toContain('FORBIDDEN');
  });
  it('also rejects the existing non-approved second Supabase project',()=>{
    const result=invoke(l=>{
      l.environment={approved:true,projectRef:'reyevthxmksdmcomtrhs',
        approvedBy:'independent reviewer',approvalEvidence:'https://example.invalid/approval'};
    });
    expect(result.exit).not.toBe(0);
    expect(result.output).toContain('FORBIDDEN');
  });
  it('rejects claiming PASS without a separately approved sandbox, even with fake evidence',()=>{
    const result=invoke(l=>{
      l.cases[0]={id:'A01',status:'pass',evidence:'https://example.invalid/evidence',
        reviewedBy:'independent reviewer',reviewedAt:'2026-11-22T06:00:00Z',
        sourceSha:'a'.repeat(40),reason:'alleged independent signoff'};
    });
    expect(result.exit).not.toBe(0);
    expect(result.output).toContain('cannot PASS');
  });
  it('rejects unreviewed evidence placed on NOT RUN cases',()=>{
    const result=invoke(l=>{l.cases[2].evidence='https://example.invalid/evidence';});
    expect(result.exit).not.toBe(0);
    expect(result.output).toContain('NOT RUN must not contain fabricated evidence');
  });
  it('rejects missing or duplicate A01-A25 acceptance cases',()=>{
    const missing=invoke(l=>{l.cases.pop();});
    expect(missing.exit).not.toBe(0);
    const repeated=invoke(l=>{l.cases[24].id='A01';});
    expect(repeated.exit).not.toBe(0);
  });
  it('even 25 manually PASS-stamped cases never bypass L18 human release gating',()=>{
    const result=invoke(l=>{
      l.environment={approved:true,projectRef:'abcdefghijklmnopqrst',
        approvedBy:'independent reviewer',approvalEvidence:'https://example.invalid/approval'};
      l.cases.forEach(c=>Object.assign(c,{
        status:'pass',evidence:'https://example.invalid/evidence',
        reviewedBy:'independent reviewer',reviewedAt:'2026-11-22T06:00:00Z',
        sourceSha:'a'.repeat(40),reason:'test-only simulated approval, not a real test',
      }));
    });
    expect(result.exit).toBe(0);
    expect(result.output).toContain('REAL_AUTH_ACCEPTANCE=EVIDENCE_REVIEW_REQUIRED; RELEASE=BLOCKED');
  });
});

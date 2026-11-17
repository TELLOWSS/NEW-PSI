import React from 'react';
import { createRoot } from 'react-dom/client';
import { PracticeEvidencePanel } from '../../components/shared/PracticeEvidencePanel';
import { ScoreMetricEvidencePanel } from '../../components/shared/ScoreMetricEvidencePanel';
import { EvidenceScopePanel } from '../../components/shared/EvidenceScopePanel';
import { buildPracticeVerificationSummary } from '../../utils/practiceVerification';
import type { WorkerRecord } from '../../types';
import '../../pages/SafetyNexus.css';

const records=[{id:'synthetic-print',worker_uuid:'synthetic-print',name:'합성 근거',date:'2020-01-01',jobField:'합성 공종',safetyScore:70,scoreBreakdown:{psychological:10},
    practiceVerificationEvents:Array.from({length:30},(_,index)=>({id:`synthetic-education-${index}`,questionNumber:1,stage:'education',result:'delivered',timestamp:'2020-01-02T00:00:00Z',actor:'합성 관리자',evidenceNote:'인쇄에도 남아야 하는 합성 근거',sessionReference:'합성 회차'}))}] as WorkerRecord[];
function Fixture(){
    const [selected,setSelected]=React.useState<'education'|'field_check'|'recheck'|'needs'|'overdue'|null>('education');
    return <main className="safety-nexus"><PracticeEvidencePanel records={records} summary={buildPracticeVerificationSummary(records,{asOfDate:'2020-01-31'})} selected={selected} onSelect={setSelected} onOpenRecord={()=>{}}/>
        <ScoreMetricEvidencePanel records={records} scopeLabel="합성 범위" asOf="2020-01-31" onOpenRecord={()=>{}}/>
        <EvidenceScopePanel source="합성 자료" scope="합성 범위" asOf="2020-01-31" state="stale" review="실제 안전 검증 아님" nextAction="재조회 필요"/>
    </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

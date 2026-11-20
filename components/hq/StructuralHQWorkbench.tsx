import React, { useMemo, useState, type FormEvent } from 'react';
import './StructuralHQWorkbench.css';
import CorrectiveActionWorkbench from './CorrectiveActionWorkbench';
import IncidentSequenceWorkbench from './IncidentSequenceWorkbench';
import EvidenceLedgerWorkbench from './EvidenceLedgerWorkbench';
import IncidentReportRevisionWorkbench from './IncidentReportRevisionWorkbench';
import type {IncidentReportVersion} from './incidentReportRevisionModel';
import {checkEvidenceLinks,type EvidenceManifestRecord,type EvidenceLink} from './evidenceManifestModel';
import type {EvidenceKind} from './accidentSequenceModel';
import SiteTrainingWorkbench from './SiteTrainingWorkbench';
import type {InvestigationSequence,CorrectiveCoverage} from './accidentSequenceModel';
import HQOverviewDashboard, {type HqDestination} from './HQOverviewDashboard';
import type {HqZone} from './hqOverviewModel';
import type {CorrectiveAction} from './correctiveActionModel';
import {
  appendInvestigationEntry,
  createInvestigationDraft,
  investigationReadiness,
  requestInvestigationReview,
  returnInvestigationForRevision,
  REVIEW_KIND_LABELS,
  type InvestigationDraft,
  type ReviewKind,
  type ReviewSource
} from './investigationReviewModel';

/**
 * HQ-SAFE exploratory workbench.
 * This component deliberately has NO API, filesystem, IndexedDB or localStorage writes.
 * Data entered here is session-only and not appropriate for real accident/personal records.
 * Existing PSI worker records are never read or modified.
 */
export type StructuralArea = '지하 RC' | '일반 형틀' | '지상 골조' | '가설·장비';
export type ConstructionZone = '기초' | '지하' | '지상' | '옥탑';
export type StructuralProcess = {
  id: string;
  area: StructuralArea;
  zones: readonly ConstructionZone[];
  title: string;
  caption: string;
  hazards: readonly string[];
  inspection: readonly string[];
  evidence: readonly string[];
};

export const STRUCTURAL_PROCESSES: readonly StructuralProcess[] = [
  {
    id: 'underground-wall', area: '지하 RC', zones: ['지하'], title: '지하 합벽·벽체 RC', caption: '흙막이 인접부, 합벽 거푸집, 벽체 콘크리트',
    hazards: ['거푸집 전도 및 버팀 불량', '콘크리트 측압과 연결부 파손', '협소구역 작업자·장비 충돌'],
    inspection: ['합벽 거푸집 지지·긴결·전도방지 상태', '타설 속도·높이·측압 대응 계획', '흙막이 인접부 안전거리와 작업 동선'],
    evidence: ['합벽 시공계획·구조검토 자료', '타설 전 점검 및 작업허가 기록']
  },
  {
    id: 'underground-slab', area: '지하 RC', zones: ['지하'], title: '지하 보·슬라브 RC', caption: '보 거푸집, 슬라브 지보공, 지하층 개구부',
    hazards: ['동바리 침하·좌굴·붕괴', '개구부·단부 추락', '자재 양중 중 낙하·협착'],
    inspection: ['지보공 배치·가새·기초 지지 상태', '슬라브 및 개구부 추락방호', '해체 시기 및 콘크리트 강도 확인 절차'],
    evidence: ['동바리 구조검토·조립도', '콘크리트 강도·해체 승인 기록']
  },
  {
    id: 'formwork', area: '일반 형틀', zones: ['기초', '지하', '지상', '옥탑'], title: '일반 형틀 제작·설치·해체', caption: '재래식 거푸집·합판·각재·보·기둥 형틀',
    hazards: ['형틀 부재 전도·탈락', '절단 공구 날 접촉·끼임', '해체 중 낙하물·추락'],
    inspection: ['거푸집 조립 순서와 긴결 상태', '전동공구 방호장치와 톱밥 제거 절차', '해체 순서·출입통제·부재 적치'],
    evidence: ['형틀 조립·해체 작업계획', '공구 점검 및 TBM 확인자료']
  },
  {
    id: 'gangform', area: '지상 골조', zones: ['지상', '옥탑'], title: '갱폼 인상·해체', caption: '외벽 대형 갱폼, 타워크레인 인양',
    hazards: ['체결 해제 중 갱폼 전도', '인상·해체 중 추락', '인양물 충돌·낙하'],
    inspection: ['앵커·인양고리·체결 순서', '추락방호·승강 통로·풍속 확인', '양중 반경 출입통제와 신호 체계'],
    evidence: ['갱폼 작업계획서·구조검토', '작업허가·인양 전 확인 기록']
  },
  {
    id: 'alform', area: '지상 골조', zones: ['지상'], title: 'AL폼 설치·해체', caption: '기준층 벽체·슬라브 알루미늄 거푸집',
    hazards: ['패널 전도·낙하', '핀·웨지 해체 중 비산', '단부·개구부 추락'],
    inspection: ['패널·핀·동바리 설치 상태', '해체 순서 및 하부 출입통제', '보안경·안전대·작업발판 관리'],
    evidence: ['AL폼 설치·해체 기준', '작업 전 위험성평가 기록']
  },
  {
    id: 'rebar', area: '지상 골조', zones: ['기초', '지하', '지상', '옥탑'], title: '철근 가공·배근', caption: '벽체·기둥·보·슬라브 철근',
    hazards: ['철근 전도·찔림', '절단·절곡기 끼임', '양중 중 낙하물'],
    inspection: ['철근 자립성·전도방지', '가공기 비상정지·방호 상태', '인양방법·신호수·출입통제'],
    evidence: ['배근·양중 작업계획', '가공기 점검 및 교육 기록']
  },
  {
    id: 'pour', area: '지상 골조', zones: ['기초', '지하', '지상', '옥탑'], title: '콘크리트 타설', caption: '펌프카·타설 호스·거푸집 측압',
    hazards: ['거푸집 붕괴·변형', '압송 호스 반동·협착', '펌프카 전도·충돌'],
    inspection: ['타설 순서·속도·구조체 변형 점검', '호스 고정·작업자 접근통제', '아웃트리거 지반과 차량 동선'],
    evidence: ['타설계획·사전점검', '장비 작업계획·지반 확인 기록']
  },
  {
    id: 'shoring', area: '가설·장비', zones: ['지하', '지상', '옥탑'], title: '시스템동바리', caption: '조립·사용·해체·하중관리',
    hazards: ['수직재 좌굴·전체 붕괴', '조립·해체 중 추락', '편심하중·적재하중 초과'],
    inspection: ['조립도·구조검토와 현장 설치 일치', '수평재·가새·기초 지지 상태', '사용 중 하중 통제와 해체 승인'],
    evidence: ['구조검토서·조립도', '설치·사용·해체 점검표']
  },
  {
    id: 'scaffold', area: '가설·장비', zones: ['지상', '옥탑'], title: '외부 시스템비계', caption: '외부 작업발판·승강설비',
    hazards: ['비계 전도·붕괴', '작업발판 추락', '부재·공구 낙하'],
    inspection: ['벽이음·가새·기초 상태', '발판·안전난간·승강 통로', '해체 구간 통제와 낙하방지'],
    evidence: ['비계 설치·해체계획', '점검 및 보수 이력']
  },
  {
    id: 'lifting', area: '가설·장비', zones: ['기초', '지하', '지상', '옥탑'], title: '타워크레인·양중·고소장비', caption: '타워크레인·이동식크레인·고소작업대',
    hazards: ['양중물 낙하·협착', '장비 전도·충돌', '고소작업대 추락'],
    inspection: ['양중하중·줄걸이·신호수 확인', '장비 작업 반경과 지반 지지 상태', '고소작업대 안전장치·승강 위치'],
    evidence: ['장비별 작업계획', '작업 전 점검·자격 확인자료']
  }
];

type Tab = 'overview' | 'process' | 'visit' | 'cases' | 'training' | 'investigation' | 'actions';
type Visit = { id: number; site: string; date: string; objective: string; status: '예정' | '방문 기록' };
type Incident = { id: number; date: string; siteAlias: string; zone: ConstructionZone; processId: string; kind: string; summary: string; state: '조사 필요' };
const AREAS: readonly (StructuralArea | '전체')[] = ['전체', '지하 RC', '일반 형틀', '지상 골조', '가설·장비'];
const REVIEW_TO_EVIDENCE:Record<ReviewSource,EvidenceKind|null>={
  '사고보고서':'report','사진·영상':'photo','작업문서':'plan',
  '진술':'statement','현장확인':'inspection','기타':null
};
const ZONES: readonly (ConstructionZone | '전체')[] = ['전체', '기초', '지하', '지상', '옥탑'];
const today = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

export default function StructuralHQWorkbench(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('overview');
  const [area, setArea] = useState<StructuralArea | '전체'>('전체');
  const [zone, setZone] = useState<ConstructionZone | '전체'>('전체');
  const [processId, setProcessId] = useState('underground-wall');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [visits, setVisits] = useState<Visit[]>([]);
  const [site, setSite] = useState('');
  const [visitDate, setVisitDate] = useState(today);
  const [objective, setObjective] = useState('정기 안전점검');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentDate, setIncidentDate] = useState(today);
  const [incidentSiteAlias,setIncidentSiteAlias] = useState('');
  const [incidentProcess, setIncidentProcess] = useState('underground-wall');
  const [incidentZone, setIncidentZone] = useState<ConstructionZone>('지하');
  const [incidentKind, setIncidentKind] = useState('추락');
  const [summary, setSummary] = useState('');
  const [caseFilter, setCaseFilter] = useState<StructuralArea | '전체'>('전체');
  const [caseZoneFilter, setCaseZoneFilter] = useState<ConstructionZone | '전체'>('전체');
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [sequenceDrafts,setSequenceDrafts] = useState<Record<number,InvestigationSequence>>({});
  const [controlMaps,setControlMaps] = useState<Record<number,CorrectiveCoverage[]>>({});
  const [evidenceRecords,setEvidenceRecords] = useState<Record<number,readonly EvidenceManifestRecord[]>>({});
  const [reportVersions,setReportVersions] = useState<Record<number,IncidentReportVersion[]>>({});
  const [investigationDrafts, setInvestigationDrafts] = useState<Record<number, InvestigationDraft>>({});
  const [hqActions, setHqActions] = useState<CorrectiveAction[]>([]);
  const [reviewKind, setReviewKind] = useState<ReviewKind>('fact');
  const [reviewDescription, setReviewDescription] = useState('');
  const [reviewSource, setReviewSource] = useState<ReviewSource>('작업문서');
  const [reviewSourceRef, setReviewSourceRef] = useState('');
  const [revisionReason, setRevisionReason] = useState('');

  const process = STRUCTURAL_PROCESSES.find((item) => item.id === processId) || STRUCTURAL_PROCESSES[0];
  const filteredProcesses = useMemo(() => STRUCTURAL_PROCESSES.filter((item) => (area === '전체' || item.area === area) && (zone === '전체' || item.zones.includes(zone))), [area, zone]);
  const visibleCases = incidents.filter((item) => (caseFilter === '전체' || STRUCTURAL_PROCESSES.find((p) => p.id === item.processId)?.area === caseFilter) && (caseZoneFilter === '전체' || item.zone === caseZoneFilter));
  const selectedCase = incidents.find((item) => item.id === selectedCaseId);
  const selectedIncidentProcess = STRUCTURAL_PROCESSES.find((item) => item.id === incidentProcess) || STRUCTURAL_PROCESSES[0];
  const selectedCaseProcess = STRUCTURAL_PROCESSES.find((p) => p.id === selectedCase?.processId);
  const investigationDraft = selectedCase ? investigationDrafts[selectedCase.id] || createInvestigationDraft(selectedCase.id) : null;
  const reviewReadiness = investigationDraft ? investigationReadiness(investigationDraft) : null;
  const currentEvidenceLinks:EvidenceLink[]=selectedCase ? [
    ...(sequenceDrafts[selectedCase.id]?.claims||[]).map(claim=>({
      id:claim.id,sourceRef:claim.sourceRef,expectedKind:claim.source,context:'sequence' as const
    })),
    ...(investigationDrafts[selectedCase.id]?.entries||[]).filter(entry=>entry.kind==='fact').map(entry=>({
      id:entry.id,sourceRef:entry.sourceRef,expectedKind:entry.source?REVIEW_TO_EVIDENCE[entry.source]:null,context:'fact' as const
    }))
  ] : [];
  const currentEvidenceAudit=selectedCase?checkEvidenceLinks(selectedCase.id,evidenceRecords[selectedCase.id]||[],currentEvidenceLinks):null;
  const hasSequenceClaim=Boolean(selectedCase&&sequenceDrafts[selectedCase.id]?.claims.length);
  const checkCount = process.inspection.filter((_, index) => checked[process.id + ':' + index]).length;
  const changeTab = (next: Tab) => { setTab(next); setNotice(''); };
  const navigateOverview = (next: HqDestination) => changeTab(next);
  const jumpToZone = (target: HqZone) => {
    setZone(target); setArea('전체');
    const first=STRUCTURAL_PROCESSES.find(p=>p.zones.includes(target));
    if(first)setProcessId(first.id);
    changeTab('process');
  };
  const jumpToTrade = (name: string) => {
    if(!AREAS.includes(name as StructuralArea)){setArea('전체');} else {setArea(name as StructuralArea);}
    setZone('전체');
    const first=STRUCTURAL_PROCESSES.find(p=>p.area===name);
    if(first)setProcessId(first.id);
    changeTab('process');
  };
  const addVisit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!site.trim() || !visitDate) { setNotice('현장 구분명과 방문일을 입력하세요.'); return; }
    setVisits((previous) => [{ id: Math.max(Date.now(), ...previous.map(v => v.id)) + 1, site: site.trim().slice(0, 40), date: visitDate, objective, status: '예정' }, ...previous]);
    setSite('');
    setNotice('이 브라우저 화면에만 임시로 등록했습니다. 서버에는 저장되지 않습니다.');
  };
  const addIncident = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!incidentDate || incidentSiteAlias.trim().length < 2 || summary.trim().length < 8) { setNotice('현장 구분명·날짜와 8자 이상의 비식별 사고 개요를 입력하세요.'); return; }
    const id = Math.max(Date.now(), ...incidents.map(item => item.id)) + 1;
    setIncidents((previous) => [{ id, date: incidentDate, siteAlias: incidentSiteAlias.trim().slice(0,40), zone: incidentZone, processId: incidentProcess, kind: incidentKind, summary: summary.trim().slice(0, 220), state: '조사 필요' as const }, ...previous]);
    setSelectedCaseId(id);
    setSummary('');
    setNotice('사례를 임시 등록했습니다. 조사 결과나 법적 사실이 확정된 것은 아닙니다.');
  };
  const addReviewEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCase || !investigationDraft) return;
    try {
      const entry = {
        id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        incidentId: selectedCase.id,
        kind: reviewKind,
        description: reviewDescription,
        source: reviewKind === 'fact' ? reviewSource : null,
        sourceRef: reviewKind === 'fact' ? reviewSourceRef : '',
        registeredAt: new Date().toISOString()
      };
      const updated = appendInvestigationEntry(investigationDraft, entry);
      setInvestigationDrafts((previous) => ({...previous, [selectedCase.id]: updated}));
      setReviewDescription('');
      setReviewSourceRef('');
      setNotice('조사 항목을 세션에 추가했습니다. 자료번호 입력만으로 사실이 검증되는 것은 아닙니다.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '조사 항목을 추가하지 못했습니다.');
    }
  };
  const requestReview = () => {
    if (!selectedCase || !investigationDraft) return;
    if(!hasSequenceClaim || !currentEvidenceAudit?.readyToRequestDemoReview){
      setNotice('사고 행동 시퀀스를 입력하고 관련 사실·시퀀스 근거를 증빙대장과 연결한 후 검토를 요청하세요.');return;
    }
    try {
      const updated = requestInvestigationReview(investigationDraft, crypto.randomUUID(), new Date().toISOString());
      setInvestigationDrafts((previous) => ({...previous, [selectedCase.id]: updated}));
      setNotice('검토 요청 상태를 시연했습니다. 실제 담당자에게 알림이나 결재 요청이 전송되지는 않습니다.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '검토 요청 표시를 할 수 없습니다.');
    }
  };
  const reviseReview = () => {
    if (!selectedCase || !investigationDraft) return;
    try {
      const updated = returnInvestigationForRevision(investigationDraft, crypto.randomUUID(), new Date().toISOString(), revisionReason);
      setInvestigationDrafts((previous) => ({...previous, [selectedCase.id]: updated}));
      setRevisionReason('');
      setNotice('검토 보완 상태를 시연했습니다. 실제 담당자 승인이나 검토를 뜻하지 않습니다.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '보완 상태 변경에 실패했습니다.');
    }
  };
  return <section id="hq-structural-workbench" className="hq-workbench" aria-label="본사 골조·형틀 안전관리 개발 시제품">
    <div className="hq-hero">
      <div className="hq-hero-copy">
        <small>PSI SAFETY NEXUS / HQ STRUCTURAL WORKBENCH</small>
        <h2>본사 관제와 골조·형틀 공정을 <em>하나의 안전관리 흐름으로</em></h2>
        <p>기존 안전지능 네트워크의 위험 인식·조치·재확인 개념을 바탕으로, 지하 RC와 일반 형틀·지상 골조를 구분한 첫 실행형 화면입니다.</p>
      </div>
      <div className="hq-hero-side" aria-label="개발 범위">
        <span>10개 공정 기준정보</span><span>사고 시퀀스·현장별 교육자료</span><strong>7차 개발 시제품</strong>
      </div>
    </div>

    <div className="hq-warning" role="note">
      <strong>개발·검토용 화면</strong> — 합성 또는 비식별 정보만 입력하세요. 새로 작성한 기록은 현재 화면의 메모리에만 존재하며 새로고침하면 사라집니다. 본사 공동 DB·사용자 권한·실제 AI 분석·공식 승인 기능은 아직 연결하지 않았습니다.
    </div>

    <div className="hq-tiles" aria-label="업무 모듈">
      {([
        ['overview','본사 통합관제','방문 · 사고 · 조치 · 공정'],
        ['process','공정별 위험지도','지하 RC · 일반 형틀 · 골조'],
        ['visit','본사 행선지·점검','일정 등록과 방문상태'],
        ['cases','사고사례 DB','구간·공종별 임시 분류'],
        ['training','대표이사·본사 교육','관리항목 기반 자료 초안'],
        ['investigation','사고조사 지원','원인 확정 전 누락사항 확인'],
        ['actions','조치·재점검','임시통제 · 이행자료 · 보완']
      ] as const).map(([key,title,detail],index)=>
        <button key={key} type="button" className={'hq-tile' + (tab===key?' is-active':'')} onClick={()=>changeTab(key)} aria-pressed={tab===key}>
          <span className="hq-tile-number">0{index+1}</span><strong>{title}</strong><small>{detail}</small>
        </button>
      )}
    </div>

    <div className="hq-workspace">
      <div className="hq-panel-top">
        <div><span className="hq-eyebrow">STRUCTURAL SAFETY / HQ CONSOLE</span><h3>{tab === 'overview' ? '본사 안전관리 통합관제' : tab === 'process' ? '골조·형틀 공정별 위험관리' : tab === 'visit' ? '본사 현장점검·행선지 보고' : tab === 'cases' ? '구간·공종별 사고사례 등록' : tab === 'training' ? '대표이사·본사 교육자료 제작' : tab === 'investigation' ? '사고조사 검토 지원' : '개선조치·재점검 흐름'}</h3></div>
        <span className="hq-session">임시 세션 · 예시 데이터 0건부터 시작</span>
      </div>

      {tab === 'overview' && <HQOverviewDashboard
        processes={STRUCTURAL_PROCESSES}
        cases={incidents}
        visits={visits}
        actions={hqActions}
        reviews={Object.values(investigationDrafts)}
        asOf={today()}
        onNavigate={navigateOverview}
        onSelectZone={jumpToZone}
        onSelectProcessGroup={jumpToTrade}
      />}
      {tab === 'process' && <div className="hq-process-layout">
        <div className="hq-process-menu">
          <p className="hq-filter-label">공사구간 (기초·지하·지상·옥탑)</p>
          <div className="hq-pills" role="group" aria-label="공사구간 필터">
            {ZONES.map((item)=><button key={item} type="button" aria-pressed={zone===item} className={zone===item?"selected":""} onClick={()=>{setZone(item);const next=STRUCTURAL_PROCESSES.find((p)=>(area==="전체"||p.area===area)&&(item==="전체"||p.zones.includes(item)));if(next){setProcessId(next.id)}else{setArea("전체");const fallback=STRUCTURAL_PROCESSES.find((p)=>item==="전체"||p.zones.includes(item));if(fallback)setProcessId(fallback.id);}}}>{item}</button>)}
          </div>
          <p className="hq-filter-label">공정군 (지하 RC·형틀·지상 골조 등)</p>
          <div className="hq-pills" role="group" aria-label="공정군 필터">
            {AREAS.map((item)=><button key={item} type="button" aria-pressed={area===item} className={area===item?'selected':''} onClick={()=>{setArea(item); const next=STRUCTURAL_PROCESSES.find((p)=>(item==='전체'||p.area===item)&&(zone==='전체'||p.zones.includes(zone))); if(next){setProcessId(next.id)}else{setZone('전체');const fallback=STRUCTURAL_PROCESSES.find((p)=>item==='전체'||p.area===item);if(fallback)setProcessId(fallback.id);}}}>{item}</button>)}
          </div>
          <div className="hq-process-list">
            {filteredProcesses.map((item)=><button type="button" key={item.id} aria-pressed={process.id===item.id} className={process.id===item.id?'selected':''} onClick={()=>setProcessId(item.id)}>
              <span>{item.area} · {item.zones.join("·")}</span><strong>{item.title}</strong><small>{item.caption}</small>
            </button>)}
          </div>
        </div>
        <div className="hq-process-detail">
          <div className="hq-risk-header"><span>{process.area} / 적용 구간 {process.zones.join("·")}</span><h4>{process.title}</h4><p>{process.caption}</p></div>
          <div className="hq-data-grid">
            <div className="hq-info-card"><h5>대표 위험요인</h5><ul>{process.hazards.map((item)=><li key={item}><span className="hq-risk-dot"/> {item}</li>)}</ul></div>
            <div className="hq-info-card"><h5>필수 확인자료</h5><ul>{process.evidence.map((item)=><li key={item}>{item}</li>)}</ul></div>
          </div>
          <div className="hq-inspection">
            <div><h5>현장 확인 체크리스트</h5><p>검토 표시 {checkCount}/{process.inspection.length} · 이 표시만으로 안전·적합·작업재개를 승인하지 않습니다.</p></div>
            {process.inspection.map((item,index)=>{
              const key=process.id+':'+index;
              return <label key={key}><input type="checkbox" checked={Boolean(checked[key])} onChange={(event)=>setChecked((previous)=>({...previous,[key]:event.target.checked}))}/><span>{item}</span></label>;
            })}
          </div>
          <p className="hq-evidence-note">지하 RC는 합벽·벽체/보·슬라브·동바리 관리로 별도 분류합니다. 일반 형틀은 AL폼과 독립 공정이며, 각 사례는 공사구간과 공종을 각각 기록해야 합니다.</p>
        </div>
      </div>}

      {tab === 'visit' && <div className="hq-two-column">
        <form className="hq-form" onSubmit={addVisit}>
          <h4>방문 일정 등록 · 비식별 시연</h4>
          <label>현장 구분명 <input maxLength={40} required value={site} onChange={(event)=>setSite(event.target.value)} placeholder="예: A현장 (실명·주소 입력 금지)"/></label>
          <label>방문일 <input type="date" required value={visitDate} onChange={(event)=>setVisitDate(event.target.value)}/></label>
          <label>방문 목적 <select value={objective} onChange={(event)=>setObjective(event.target.value)}><option>정기 안전점검</option><option>특별안전점검</option><option>사고조사</option><option>안전교육</option><option>기타 현장업무</option></select></label>
          <button className="hq-primary" type="submit">방문일정 임시 등록</button>
        </form>
        <div className="hq-register">
          <h4>등록된 임시 방문 일정 <small>{visits.length}건</small></h4>
          {visits.length===0 ? <p className="hq-empty">등록된 일정이 없습니다. 왼쪽에서 연습용 일정을 등록해 보세요.</p> : visits.map((item)=><div className="hq-record" key={item.id}>
            <div><strong>{item.site}</strong><p>{item.date} · {item.objective}</p></div>
            <button type="button" onClick={()=>setVisits((prev)=>prev.map((v)=>v.id===item.id?{...v,status:'방문 기록'}:v))}>{item.status}</button>
          </div>)}
          <p className="hq-hint">방문 기록은 실제 점검결과·개선조치 승인과 다릅니다. 정식 구현에서 담당자·승인·증빙·권한을 연결합니다.</p>
        </div>
      </div>}

      {tab === 'cases' && <div className="hq-two-column">
        <form className="hq-form" onSubmit={addIncident}>
          <h4>사고·아차사고 구조화 등록 · 비식별 시연</h4>
          <label>현장 구분명 <input required minLength={2} maxLength={40} value={incidentSiteAlias} onChange={event=>setIncidentSiteAlias(event.target.value)} placeholder="예: A현장 (비식별 별칭)"/></label>
          <label>발생일 <input type="date" required value={incidentDate} onChange={(event)=>setIncidentDate(event.target.value)}/></label>
          <label>공정 <select value={incidentProcess} onChange={(event)=>{const next=STRUCTURAL_PROCESSES.find((p)=>p.id===event.target.value);setIncidentProcess(event.target.value);if(next)setIncidentZone(next.zones[0]);}}>{STRUCTURAL_PROCESSES.map((item)=><option key={item.id} value={item.id}>{item.area} / {item.title}</option>)}</select></label>
          <label>발생 공사구간 <select value={incidentZone} onChange={(event)=>setIncidentZone(event.target.value as ConstructionZone)}>{selectedIncidentProcess.zones.map((item)=><option key={item}>{item}</option>)}</select></label>
          <label>재해유형 <select value={incidentKind} onChange={(event)=>setIncidentKind(event.target.value)}>{['추락','낙하·비래','끼임·협착','무너짐·전도','충돌','감전','절단·베임','기타·아차사고'].map((item)=><option key={item}>{item}</option>)}</select></label>
          <label>비식별 사고 개요 <textarea required maxLength={220} minLength={8} rows={4} value={summary} onChange={(event)=>setSummary(event.target.value)} placeholder="인명·현장 실명·의료정보 없이 작업·사건 흐름만 입력"/></label>
          <button className="hq-primary" type="submit">사례 임시 등록</button>
        </form>
        <div className="hq-register">
          <h4>사례 목록 <small>{visibleCases.length}건</small></h4>
          <label>공정군 필터 <select value={caseFilter} onChange={(event)=>setCaseFilter(event.target.value as StructuralArea | '전체')}>{AREAS.map((item)=><option key={item}>{item}</option>)}</select></label>
          <label>공사구간 필터 <select value={caseZoneFilter} onChange={(event)=>setCaseZoneFilter(event.target.value as ConstructionZone | "전체")}>{ZONES.map((item)=><option key={item}>{item}</option>)}</select></label>
          {visibleCases.length===0 ? <p className="hq-empty">현재 등록된 사례가 없습니다. 실제 사고통계가 0건이라는 뜻은 아닙니다.</p> : visibleCases.map((item)=><button className="hq-record hq-record-action" type="button" key={item.id} onClick={()=>{setSelectedCaseId(item.id);changeTab('investigation');}}>
            <span><strong>{STRUCTURAL_PROCESSES.find((p)=>p.id===item.processId)?.title}</strong><small>{item.siteAlias} · {item.date} · {item.zone} · {item.kind} · {item.state}</small><p>{item.summary}</p></span><b>조사 검토 ›</b>
          </button>)}
          <p className="hq-hint">사고의 산재 승인 여부, 법정 보고 여부, 조사 진행상태는 정식 DB에서 서로 다른 필드로 관리할 예정입니다.</p>
        </div>
      </div>}

      {tab === 'training' && <SiteTrainingWorkbench incidents={incidents} processes={STRUCTURAL_PROCESSES} actions={hqActions} visits={visits}/>}

      {tab === 'investigation' && <div className="hq-investigation">
        <div className="hq-form">
          <h4>사고 원인조사 · 증거 확인 단계</h4>
          <label>검토 사례 <select value={selectedCaseId ?? ''} onChange={(event)=>setSelectedCaseId(event.target.value?Number(event.target.value):null)}>
            <option value="">사례를 선택하세요</option>
            {incidents.map((item)=><option key={item.id} value={item.id}>{item.date} / {STRUCTURAL_PROCESSES.find((p)=>p.id===item.processId)?.title}</option>)}
          </select></label>
          {!selectedCase && <p className="hq-empty">사례 DB에서 비식별 사고를 임시 등록한 다음 조사 흐름을 확인할 수 있습니다.</p>}
          {selectedCase && <div className="hq-case-brief"><strong>{selectedCase.kind} · {selectedCase.state}</strong><p>{selectedCase.summary}</p><small>{selectedCase.zone} / {selectedCaseProcess?.area} / {selectedCaseProcess?.title}</small></div>}
        </div>
        <div className="hq-investigation-steps">
          <h4>조사 누락 방지 질문 <small>AI 연결 전 · 규칙 기반</small></h4>
          {['사고 전·당시·직후의 시간순 사실이 확인되었는가?', '사진·작업계획서·TBM·위험성평가 등 객관적 자료가 있는가?', '작업자 진술과 현장 상황 사이에 상충하거나 미확인된 사실이 있는가?', '장비·공구·작업방법·환경·관리체계의 요인을 모두 검토했는가?', ...(selectedCaseProcess?.inspection || []).map((item)=>'공정 점검: '+item), '직접원인과 근본원인을 분리하여 사람이 검증했는가?', '개선조치의 책임자·기한·재점검 기준을 정했는가?'].map((item,index)=><div className="hq-question" key={index}><b>{String(index+1).padStart(2,'0')}</b><span>{item}</span><em>확인 필요</em></div>)}
          <p className="hq-evidence-note">이 화면은 사고조사 질문을 구조화한 시제품이며 실제 AI 사고원인 분석을 실행하지 않습니다. 확인된 사실·가설·미확인 사항을 구별하고 책임자 검토 후 결론을 확정해야 합니다.</p>
        </div>
      </div>}

      {tab === 'investigation' && <EvidenceLedgerWorkbench selected={selectedCase ? {id:selectedCase.id,summary:selectedCase.summary}:null} records={evidenceRecords} onRecordsChange={setEvidenceRecords} links={currentEvidenceLinks} readOnly={investigationDraft?.status==='requested'}/>}
      {tab === 'investigation' && <IncidentSequenceWorkbench selected={selectedCase ? {id:selectedCase.id,date:selectedCase.date,zone:selectedCase.zone,processId:selectedCase.processId,summary:selectedCase.summary} : null} drafts={sequenceDrafts} onDraftsChange={setSequenceDrafts} controls={controlMaps} onControlsChange={setControlMaps} readOnly={investigationDraft?.status==='requested'}/> }
      {tab === 'investigation' && <IncidentReportRevisionWorkbench key={selectedCaseId??'no-case'} selectedCaseId={selectedCaseId} evidence={selectedCase?(evidenceRecords[selectedCase.id]||[]):[]} sequence={selectedCase?(sequenceDrafts[selectedCase.id]||null):null} versions={selectedCase?(reportVersions[selectedCase.id]||[]):[]} onVersionsChange={next=>{if(selectedCase)setReportVersions(prev=>({...prev,[selectedCase.id]:next}));}} readOnly={investigationDraft?.status==='requested'}/>}
      {tab === 'investigation' && selectedCase && investigationDraft && reviewReadiness && <section className="hq-review-board" aria-label="사고 원인조사 증빙·검토 시연">
        <div className="hq-review-heading">
          <div><span className="hq-eyebrow">EVIDENCE & HUMAN REVIEW</span><h4>사실·가설·미확인 사항 분리</h4></div>
          <span className="hq-review-status">{investigationDraft.status === 'requested' ? '사내 검토 요청 표시' : investigationDraft.status === 'needs_revision' ? '보완 필요' : '조사 초안'}</span>
        </div>
        <div className="hq-review-counters">
          <span>사실 주장 <b>{reviewReadiness.counts.fact}</b></span>
          <span>원인 가설 <b>{reviewReadiness.counts.hypothesis}</b></span>
          <span>미확인 항목 <b>{reviewReadiness.counts.unknown}</b></span>
        </div>
        <div className="hq-review-grid">
          <form className="hq-form" onSubmit={addReviewEntry}>
            <h4>조사 항목 입력</h4>
            <label>자료 분류 <select value={reviewKind} onChange={(event)=>setReviewKind(event.target.value as ReviewKind)}>
              {(Object.keys(REVIEW_KIND_LABELS) as ReviewKind[]).map((kind)=><option key={kind} value={kind}>{REVIEW_KIND_LABELS[kind]}</option>)}
            </select></label>
            <label>조사 내용 (8자 이상) <textarea rows={3} required minLength={8} maxLength={500} value={reviewDescription} onChange={(event)=>setReviewDescription(event.target.value)} placeholder="확인된 내용, 원인 가능성 또는 추가 조사 필요사항을 구체적으로 기술"/></label>
            {reviewKind === 'fact' && <>
              <label>근거 종류 <select value={reviewSource} onChange={(event)=>setReviewSource(event.target.value as ReviewSource)}>{(['사고보고서','사진·영상','작업문서','진술','현장확인','기타'] as ReviewSource[]).map((kind)=><option key={kind}>{kind}</option>)}</select></label>
              <label>근거 자료번호·원본 위치 <input required minLength={4} maxLength={180} value={reviewSourceRef} onChange={(event)=>setReviewSourceRef(event.target.value)} placeholder="예: DOC-001 / 시연용 번호만 입력"/></label>
            </>}
            <button type="submit" className="hq-primary" disabled={investigationDraft.status === 'requested'}>조사 항목 임시 추가</button>
            {investigationDraft.status === 'requested' && <p className="hq-hint">검토 요청 중에는 수정할 수 없습니다. 보완 상태로 변경한 뒤 추가하세요.</p>}
          </form>
          <div className="hq-review-register">
            <h4>조사 근거 목록 <small>{investigationDraft.entries.length}건</small></h4>
            {investigationDraft.entries.length === 0 ? <p className="hq-empty">등록된 사실·가설·미확인 항목이 없습니다.</p> :
              investigationDraft.entries.map((entry)=><article className="hq-review-entry" key={entry.id}>
                <span className={'hq-review-kind ' + entry.kind}>{REVIEW_KIND_LABELS[entry.kind]}</span>
                <p>{entry.description}</p>
                {entry.source && <small>근거: {entry.source} / {entry.sourceRef}</small>}
                <small>조사 항목 작성 시각: {entry.registeredAt.slice(0, 16).replace('T',' ')}</small>
              </article>)}
            <div className="hq-review-gate">
              <h5>사내 검토 요청 사전 점검</h5>
              {reviewReadiness.messages.length ? <ul>{reviewReadiness.messages.map((message)=><li key={message}>{message}</li>)}</ul> : <p>검토 요청용 필수 입력 조건을 충족했습니다. 원인 진위나 법적 적합성은 검증되지 않았습니다.</p>}
              <button type="button" className="hq-primary" disabled={!reviewReadiness.readyToRequest || !hasSequenceClaim || !currentEvidenceAudit?.readyToRequestDemoReview || !(reportVersions[selectedCase.id]?.length) || investigationDraft.status === 'requested'} onClick={requestReview}>검토 요청 표시 (실제 결재 아님)</button>
              {(!hasSequenceClaim || !currentEvidenceAudit?.readyToRequestDemoReview || !(reportVersions[selectedCase.id]?.length))&&<p className="hq-hint">추가 조건: 행동 시퀀스·증빙대장 연결 및 6하원칙·직접/기여/근본 원인 근거가 포함된 조사보고서 버전 1건 이상 필요. 서면 검토·원본 진위를 의미하지 않습니다.</p>}
              {investigationDraft.status === 'requested' && <>
                <label>보완 사유 <input maxLength={200} minLength={4} value={revisionReason} onChange={(event)=>setRevisionReason(event.target.value)} placeholder="확인이 필요한 자료나 조사항목"/></label>
                <button type="button" className="hq-secondary" onClick={reviseReview}>보완 상태로 되돌리기</button>
              </>}
            </div>
            {investigationDraft.events.length > 0 && <div className="hq-review-history">
              <h5>세션 내 검토 상태 변경이력</h5>
              <ol>{investigationDraft.events.map((event)=><li key={event.eventId}>{event.eventType === 'request' ? '검토 요청 표시' : '보완 상태로 변경'} · {event.reason}</li>)}</ol>
            </div>}
          </div>
        </div>
        <p className="hq-review-footnote">이 화면은 개발 시연입니다. 자료번호·확인 상태는 원본 진위나 근로자 진술을 증명하지 않습니다. 실제 조사책임자 인증, 원본 파일 무결성, 교차검증, 최종 결재 및 AI 처리는 아직 구현하지 않았습니다.</p>
      </section>}
      <div hidden={tab !== 'actions'}>
        <CorrectiveActionWorkbench cases={incidents.map((item)=>({id:item.id,date:item.date,zone:item.zone,process:STRUCTURAL_PROCESSES.find(p=>p.id===item.processId)?.title || item.processId,summary:item.summary}))} onOpenCases={()=>changeTab('cases')} actions={hqActions} onActionsChange={setHqActions}/>
      </div>
      {notice && <p role="status" className="hq-notice">{notice}</p>}
    </div>
    <div className="hq-bottom"><strong>구현 범위: 본사 관제·사고행동 시퀀스·증빙참조대장·6하원칙 조사보고서 개정비교·교육초안·조치/재점검 시연</strong><span>미구현: 실제 중앙 저장·현장별 권한·AI 호출·PPT 내보내기·법정 보고·승인 워크플로</span></div>
  </section>;
}

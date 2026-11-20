import React, { useMemo, useState, type FormEvent } from 'react';
import './StructuralHQWorkbench.css';

/**
 * HQ-SAFE exploratory workbench.
 * This component deliberately has NO API, filesystem, IndexedDB or localStorage writes.
 * Data entered here is session-only and not appropriate for real accident/personal records.
 * Existing PSI worker records are never read or modified.
 */
export type StructuralArea = '지하 RC' | '일반 형틀' | '지상 골조' | '가설·장비';
export type StructuralProcess = {
  id: string;
  area: StructuralArea;
  title: string;
  caption: string;
  hazards: readonly string[];
  inspection: readonly string[];
  evidence: readonly string[];
};

export const STRUCTURAL_PROCESSES: readonly StructuralProcess[] = [
  {
    id: 'underground-wall', area: '지하 RC', title: '지하 합벽·벽체 RC', caption: '흙막이 인접부, 합벽 거푸집, 벽체 콘크리트',
    hazards: ['거푸집 전도 및 버팀 불량', '콘크리트 측압과 연결부 파손', '협소구역 작업자·장비 충돌'],
    inspection: ['합벽 거푸집 지지·긴결·전도방지 상태', '타설 속도·높이·측압 대응 계획', '흙막이 인접부 안전거리와 작업 동선'],
    evidence: ['합벽 시공계획·구조검토 자료', '타설 전 점검 및 작업허가 기록']
  },
  {
    id: 'underground-slab', area: '지하 RC', title: '지하 보·슬라브 RC', caption: '보 거푸집, 슬라브 지보공, 지하층 개구부',
    hazards: ['동바리 침하·좌굴·붕괴', '개구부·단부 추락', '자재 양중 중 낙하·협착'],
    inspection: ['지보공 배치·가새·기초 지지 상태', '슬라브 및 개구부 추락방호', '해체 시기 및 콘크리트 강도 확인 절차'],
    evidence: ['동바리 구조검토·조립도', '콘크리트 강도·해체 승인 기록']
  },
  {
    id: 'formwork', area: '일반 형틀', title: '일반 형틀 제작·설치·해체', caption: '재래식 거푸집·합판·각재·보·기둥 형틀',
    hazards: ['형틀 부재 전도·탈락', '절단 공구 날 접촉·끼임', '해체 중 낙하물·추락'],
    inspection: ['거푸집 조립 순서와 긴결 상태', '전동공구 방호장치와 톱밥 제거 절차', '해체 순서·출입통제·부재 적치'],
    evidence: ['형틀 조립·해체 작업계획', '공구 점검 및 TBM 확인자료']
  },
  {
    id: 'gangform', area: '지상 골조', title: '갱폼 인상·해체', caption: '외벽 대형 갱폼, 타워크레인 인양',
    hazards: ['체결 해제 중 갱폼 전도', '인상·해체 중 추락', '인양물 충돌·낙하'],
    inspection: ['앵커·인양고리·체결 순서', '추락방호·승강 통로·풍속 확인', '양중 반경 출입통제와 신호 체계'],
    evidence: ['갱폼 작업계획서·구조검토', '작업허가·인양 전 확인 기록']
  },
  {
    id: 'alform', area: '지상 골조', title: 'AL폼 설치·해체', caption: '기준층 벽체·슬라브 알루미늄 거푸집',
    hazards: ['패널 전도·낙하', '핀·웨지 해체 중 비산', '단부·개구부 추락'],
    inspection: ['패널·핀·동바리 설치 상태', '해체 순서 및 하부 출입통제', '보안경·안전대·작업발판 관리'],
    evidence: ['AL폼 설치·해체 기준', '작업 전 위험성평가 기록']
  },
  {
    id: 'rebar', area: '지상 골조', title: '철근 가공·배근', caption: '벽체·기둥·보·슬라브 철근',
    hazards: ['철근 전도·찔림', '절단·절곡기 끼임', '양중 중 낙하물'],
    inspection: ['철근 자립성·전도방지', '가공기 비상정지·방호 상태', '인양방법·신호수·출입통제'],
    evidence: ['배근·양중 작업계획', '가공기 점검 및 교육 기록']
  },
  {
    id: 'pour', area: '지상 골조', title: '콘크리트 타설', caption: '펌프카·타설 호스·거푸집 측압',
    hazards: ['거푸집 붕괴·변형', '압송 호스 반동·협착', '펌프카 전도·충돌'],
    inspection: ['타설 순서·속도·구조체 변형 점검', '호스 고정·작업자 접근통제', '아웃트리거 지반과 차량 동선'],
    evidence: ['타설계획·사전점검', '장비 작업계획·지반 확인 기록']
  },
  {
    id: 'shoring', area: '가설·장비', title: '시스템동바리', caption: '조립·사용·해체·하중관리',
    hazards: ['수직재 좌굴·전체 붕괴', '조립·해체 중 추락', '편심하중·적재하중 초과'],
    inspection: ['조립도·구조검토와 현장 설치 일치', '수평재·가새·기초 지지 상태', '사용 중 하중 통제와 해체 승인'],
    evidence: ['구조검토서·조립도', '설치·사용·해체 점검표']
  },
  {
    id: 'scaffold', area: '가설·장비', title: '외부 시스템비계', caption: '외부 작업발판·승강설비',
    hazards: ['비계 전도·붕괴', '작업발판 추락', '부재·공구 낙하'],
    inspection: ['벽이음·가새·기초 상태', '발판·안전난간·승강 통로', '해체 구간 통제와 낙하방지'],
    evidence: ['비계 설치·해체계획', '점검 및 보수 이력']
  },
  {
    id: 'lifting', area: '가설·장비', title: '타워크레인·양중·고소장비', caption: '타워크레인·이동식크레인·고소작업대',
    hazards: ['양중물 낙하·협착', '장비 전도·충돌', '고소작업대 추락'],
    inspection: ['양중하중·줄걸이·신호수 확인', '장비 작업 반경과 지반 지지 상태', '고소작업대 안전장치·승강 위치'],
    evidence: ['장비별 작업계획', '작업 전 점검·자격 확인자료']
  }
];

type Tab = 'process' | 'visit' | 'cases' | 'training' | 'investigation';
type Visit = { id: number; site: string; date: string; objective: string; status: '예정' | '방문 기록' };
type Incident = { id: number; date: string; processId: string; kind: string; summary: string; state: '조사 필요' };
const AREAS: readonly (StructuralArea | '전체')[] = ['전체', '지하 RC', '일반 형틀', '지상 골조', '가설·장비'];
const today = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

export default function StructuralHQWorkbench(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('process');
  const [area, setArea] = useState<StructuralArea | '전체'>('전체');
  const [processId, setProcessId] = useState('underground-wall');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [visits, setVisits] = useState<Visit[]>([]);
  const [site, setSite] = useState('');
  const [visitDate, setVisitDate] = useState(today);
  const [objective, setObjective] = useState('정기 안전점검');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentDate, setIncidentDate] = useState(today);
  const [incidentProcess, setIncidentProcess] = useState('underground-wall');
  const [incidentKind, setIncidentKind] = useState('추락');
  const [summary, setSummary] = useState('');
  const [caseFilter, setCaseFilter] = useState<StructuralArea | '전체'>('전체');
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [trainingProcessId, setTrainingProcessId] = useState('underground-wall');

  const process = STRUCTURAL_PROCESSES.find((item) => item.id === processId) || STRUCTURAL_PROCESSES[0];
  const trainingProcess = STRUCTURAL_PROCESSES.find((item) => item.id === trainingProcessId) || STRUCTURAL_PROCESSES[0];
  const filteredProcesses = useMemo(() => STRUCTURAL_PROCESSES.filter((item) => area === '전체' || item.area === area), [area]);
  const visibleCases = incidents.filter((item) => caseFilter === '전체' || STRUCTURAL_PROCESSES.find((p) => p.id === item.processId)?.area === caseFilter);
  const selectedCase = incidents.find((item) => item.id === selectedCaseId);
  const selectedCaseProcess = STRUCTURAL_PROCESSES.find((p) => p.id === selectedCase?.processId);
  const checkCount = process.inspection.filter((_, index) => checked[process.id + ':' + index]).length;
  const educationDraft = [
    '본사 안전교육 자료 초안 · 내부 검토용',
    '공정: ' + trainingProcess.title,
    '작업범위: ' + trainingProcess.caption,
    '',
    '주요 위험요인',
    ...trainingProcess.hazards.map((text, index) => String(index + 1) + '. ' + text),
    '',
    '교육 시 확인할 관리항목',
    ...trainingProcess.inspection.map((text, index) => String(index + 1) + '. ' + text),
    '',
    '확인할 증빙',
    ...trainingProcess.evidence.map((text) => '- ' + text),
    '',
    '※ 표준 참고 초안입니다. 현장별 계획·실제 조건·최신 법령을 대조하고 본사 책임자가 최종 승인해야 합니다.'
  ].join('\n');

  const changeTab = (next: Tab) => { setTab(next); setNotice(''); };
  const addVisit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!site.trim() || !visitDate) { setNotice('현장 구분명과 방문일을 입력하세요.'); return; }
    setVisits((previous) => [{ id: Date.now(), site: site.trim().slice(0, 40), date: visitDate, objective, status: '예정' }, ...previous]);
    setSite('');
    setNotice('이 브라우저 화면에만 임시로 등록했습니다. 서버에는 저장되지 않습니다.');
  };
  const addIncident = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!incidentDate || summary.trim().length < 8) { setNotice('날짜와 8자 이상의 비식별 사고 개요를 입력하세요.'); return; }
    const id = Date.now();
    setIncidents((previous) => [{ id, date: incidentDate, processId: incidentProcess, kind: incidentKind, summary: summary.trim().slice(0, 220), state: '조사 필요' as const }, ...previous]);
    setSelectedCaseId(id);
    setSummary('');
    setNotice('사례를 임시 등록했습니다. 조사 결과나 법적 사실이 확정된 것은 아닙니다.');
  };
  const copyDraft = async () => {
    try { await navigator.clipboard.writeText(educationDraft); setNotice('교육자료 초안을 복사했습니다.'); }
    catch { setNotice('복사가 차단되었습니다. 아래 초안을 직접 선택하여 복사해 주세요.'); }
  };

  return <section id="hq-structural-workbench" className="hq-workbench" aria-label="본사 골조·형틀 안전관리 개발 시제품">
    <div className="hq-hero">
      <div className="hq-hero-copy">
        <small>PSI SAFETY NEXUS / HQ STRUCTURAL WORKBENCH</small>
        <h2>본사 관제와 골조·형틀 공정을 <em>하나의 안전관리 흐름으로</em></h2>
        <p>기존 안전지능 네트워크의 위험 인식·조치·재확인 개념을 바탕으로, 지하 RC와 일반 형틀·지상 골조를 구분한 첫 실행형 화면입니다.</p>
      </div>
      <div className="hq-hero-side" aria-label="개발 범위">
        <span>10개 공정 기준정보</span><span>4개 본사 업무 영역</span><strong>1차 개발 시제품</strong>
      </div>
    </div>

    <div className="hq-warning" role="note">
      <strong>개발·검토용 화면</strong> — 합성 또는 비식별 정보만 입력하세요. 새로 작성한 기록은 현재 화면의 메모리에만 존재하며 새로고침하면 사라집니다. 본사 공동 DB·사용자 권한·실제 AI 분석·공식 승인 기능은 아직 연결하지 않았습니다.
    </div>

    <div className="hq-tiles" aria-label="업무 모듈">
      {([
        ['process','공정별 위험지도','지하 RC · 일반 형틀 · 골조'],
        ['visit','본사 행선지·점검','일정 등록과 방문상태'],
        ['cases','사고사례 DB','구간·공종별 임시 분류'],
        ['training','대표이사·본사 교육','관리항목 기반 자료 초안'],
        ['investigation','사고조사 지원','원인 확정 전 누락사항 확인']
      ] as const).map(([key,title,detail],index)=>
        <button key={key} type="button" className={'hq-tile' + (tab===key?' is-active':'')} onClick={()=>changeTab(key)} aria-pressed={tab===key}>
          <span className="hq-tile-number">0{index+1}</span><strong>{title}</strong><small>{detail}</small>
        </button>
      )}
    </div>

    <div className="hq-workspace">
      <div className="hq-panel-top">
        <div><span className="hq-eyebrow">STRUCTURAL SAFETY / HQ CONSOLE</span><h3>{tab === 'process' ? '골조·형틀 공정별 위험관리' : tab === 'visit' ? '본사 현장점검·행선지 보고' : tab === 'cases' ? '구간·공종별 사고사례 등록' : tab === 'training' ? '대표이사·본사 교육자료 제작' : '사고조사 검토 지원'}</h3></div>
        <span className="hq-session">임시 세션 · 예시 데이터 0건부터 시작</span>
      </div>

      {tab === 'process' && <div className="hq-process-layout">
        <div className="hq-process-menu">
          <div className="hq-pills" role="group" aria-label="관리 구간">
            {AREAS.map((item)=><button key={item} type="button" aria-pressed={area===item} className={area===item?'selected':''} onClick={()=>{setArea(item); const next=STRUCTURAL_PROCESSES.find((p)=>item==='전체'||p.area===item); if(next)setProcessId(next.id);}}>{item}</button>)}
          </div>
          <div className="hq-process-list">
            {filteredProcesses.map((item)=><button type="button" key={item.id} aria-pressed={process.id===item.id} className={process.id===item.id?'selected':''} onClick={()=>setProcessId(item.id)}>
              <span>{item.area}</span><strong>{item.title}</strong><small>{item.caption}</small>
            </button>)}
          </div>
        </div>
        <div className="hq-process-detail">
          <div className="hq-risk-header"><span>{process.area}</span><h4>{process.title}</h4><p>{process.caption}</p></div>
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
          <label>발생일 <input type="date" required value={incidentDate} onChange={(event)=>setIncidentDate(event.target.value)}/></label>
          <label>공정 <select value={incidentProcess} onChange={(event)=>setIncidentProcess(event.target.value)}>{STRUCTURAL_PROCESSES.map((item)=><option key={item.id} value={item.id}>{item.area} / {item.title}</option>)}</select></label>
          <label>재해유형 <select value={incidentKind} onChange={(event)=>setIncidentKind(event.target.value)}>{['추락','낙하·비래','끼임·협착','무너짐·전도','충돌','감전','절단·베임','기타·아차사고'].map((item)=><option key={item}>{item}</option>)}</select></label>
          <label>비식별 사고 개요 <textarea required maxLength={220} minLength={8} rows={4} value={summary} onChange={(event)=>setSummary(event.target.value)} placeholder="인명·현장 실명·의료정보 없이 작업·사건 흐름만 입력"/></label>
          <button className="hq-primary" type="submit">사례 임시 등록</button>
        </form>
        <div className="hq-register">
          <h4>사례 목록 <small>{visibleCases.length}건</small></h4>
          <label>구간 필터 <select value={caseFilter} onChange={(event)=>setCaseFilter(event.target.value as StructuralArea | '전체')}>{AREAS.map((item)=><option key={item}>{item}</option>)}</select></label>
          {visibleCases.length===0 ? <p className="hq-empty">현재 등록된 사례가 없습니다. 실제 사고통계가 0건이라는 뜻은 아닙니다.</p> : visibleCases.map((item)=><button className="hq-record hq-record-action" type="button" key={item.id} onClick={()=>{setSelectedCaseId(item.id);changeTab('investigation');}}>
            <span><strong>{STRUCTURAL_PROCESSES.find((p)=>p.id===item.processId)?.title}</strong><small>{item.date} · {item.kind} · {item.state}</small><p>{item.summary}</p></span><b>조사 검토 ›</b>
          </button>)}
          <p className="hq-hint">사고의 산재 승인 여부, 법정 보고 여부, 조사 진행상태는 정식 DB에서 서로 다른 필드로 관리할 예정입니다.</p>
        </div>
      </div>}

      {tab === 'training' && <div className="hq-training">
        <div className="hq-form">
          <h4>골조·형틀 표준 교육자료 초안</h4>
          <label>교육 대상 공정 <select value={trainingProcessId} onChange={(event)=>setTrainingProcessId(event.target.value)}>{STRUCTURAL_PROCESSES.map((item)=><option key={item.id} value={item.id}>{item.area} / {item.title}</option>)}</select></label>
          <p className="hq-hint">사고사례 DB 연계, PPT 자동 생성, 교육 승인·배포·이수 증빙은 후속 개발 범위입니다.</p>
          <button className="hq-primary" type="button" onClick={()=>void copyDraft()}>표준 교육 초안 복사</button>
        </div>
        <div className="hq-training-preview"><h4>교육자료 미리보기</h4><pre>{educationDraft}</pre></div>
      </div>}

      {tab === 'investigation' && <div className="hq-investigation">
        <div className="hq-form">
          <h4>사고 원인조사 · 증거 확인 단계</h4>
          <label>검토 사례 <select value={selectedCaseId ?? ''} onChange={(event)=>setSelectedCaseId(event.target.value?Number(event.target.value):null)}>
            <option value="">사례를 선택하세요</option>
            {incidents.map((item)=><option key={item.id} value={item.id}>{item.date} / {STRUCTURAL_PROCESSES.find((p)=>p.id===item.processId)?.title}</option>)}
          </select></label>
          {!selectedCase && <p className="hq-empty">사례 DB에서 비식별 사고를 임시 등록한 다음 조사 흐름을 확인할 수 있습니다.</p>}
          {selectedCase && <div className="hq-case-brief"><strong>{selectedCase.kind} · {selectedCase.state}</strong><p>{selectedCase.summary}</p><small>{selectedCaseProcess?.area} / {selectedCaseProcess?.title}</small></div>}
        </div>
        <div className="hq-investigation-steps">
          <h4>조사 누락 방지 질문 <small>AI 연결 전 · 규칙 기반</small></h4>
          {['사고 전·당시·직후의 시간순 사실이 확인되었는가?', '사진·작업계획서·TBM·위험성평가 등 객관적 자료가 있는가?', '작업자 진술과 현장 상황 사이에 상충하거나 미확인된 사실이 있는가?', '장비·공구·작업방법·환경·관리체계의 요인을 모두 검토했는가?', ...(selectedCaseProcess?.inspection || []).map((item)=>'공정 점검: '+item), '직접원인과 근본원인을 분리하여 사람이 검증했는가?', '개선조치의 책임자·기한·재점검 기준을 정했는가?'].map((item,index)=><div className="hq-question" key={index}><b>{String(index+1).padStart(2,'0')}</b><span>{item}</span><em>확인 필요</em></div>)}
          <p className="hq-evidence-note">이 화면은 사고조사 질문을 구조화한 시제품이며 실제 AI 사고원인 분석을 실행하지 않습니다. 확인된 사실·가설·미확인 사항을 구별하고 책임자 검토 후 결론을 확정해야 합니다.</p>
        </div>
      </div>}

      {notice && <p role="status" className="hq-notice">{notice}</p>}
    </div>
    <div className="hq-bottom"><strong>구현 범위: 공정 분류·위험 체크리스트·세션 방문보고·세션 사고분류·교육 초안·조사 질문</strong><span>미구현: 실제 중앙 저장·현장별 권한·AI 호출·PPT 내보내기·법정 보고·승인 워크플로</span></div>
  </section>;
}

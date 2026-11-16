import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Page, WorkerRecord } from '../types';
import { filterLoadedNexusRecords, sliceLoadedNexusRecords } from '../utils/safetyNexusViewModel';
import { buildMonthlyFieldFollowupSummary, collectMonthlyFollowupCases, getKoreanCalendarDay } from '../utils/monthlyFieldFollowup';
import { buildPracticeVerificationSummary, collectOverduePracticeRechecks, PRACTICE_RESULT_LABELS } from '../utils/practiceVerification';
import { FOLLOWUP_STATUS_LABELS } from '../utils/workerRiskFollowup';
import WebGLNexusCore from './NexusWebGLCore';
import { ScoreMetricEvidencePanel } from '../components/shared/ScoreMetricEvidencePanel';
import { nexusFeatureFlags } from '../config/nexusFeatureFlags';
import './SafetyNexus.css';

type Topic = { index: string; title: string; en: string; detail: string; page: Page; action: string };
const FOLLOWUP_FILTER_LABELS = {overdue:'기한 초과',unresolved:'미완료',interim_control:'임시 통제 중',scheduled:'조치 예정',reopened:'재개방 이력',completed:'완료로 기록된'} as const;
type FollowupFilter = keyof typeof FOLLOWUP_FILTER_LABELS;
export type NexusViewState = {month:string;trade:string;active:number;flat:boolean;question:number|null;priority:FollowupFilter|'recheck'|null};
type Props = { workerRecords: WorkerRecord[]; loadState?: 'loading' | 'ready' | 'error'; initialTrade?: string; initialView?:NexusViewState|null; onViewChange?:(view:NexusViewState)=>void; onNavigateToPage: (page: Page) => void; onReturnDashboard?: (trade: string) => void; onOpenRecord?: (record: WorkerRecord) => void };
const STEPS: Topic[] = [
  {index:'01',title:'위험작업',en:'RISK IDENTIFICATION',detail:'근로자가 가장 위험하다고 느끼는 작업을 직접 기록합니다. 개인의 위험 인식과 현장에서 확정된 위험은 구별합니다.',page:'ocr-analysis',action:'위험성평가 원본 확인'},
  {index:'02',title:'위험요소',en:'HAZARD SIGNAL',detail:'추락·끼임·감전 등 위험요소를 분석합니다. AI 해석은 관리자 원본 대조와 검토를 거친 후 활용합니다.',page:'ocr-analysis',action:'위험요소 분석 열기'},
  {index:'03',title:'자가평가',en:'SELF-ASSESSMENT',detail:'근로자가 선택한 상·중·하와 그 이유를 살핍니다. 근로자 자가평가를 현장 위험의 최종 판정으로 표시하지 않습니다.',page:'predictive-analysis',action:'위험신호 분석 열기'},
  {index:'04',title:'안전조치',en:'PROTECTIVE ACTION',detail:'즉시 조치가 어려운 경우에도 미해결 상태를 유지합니다. 임시 보호조치·담당·목표일·재점검 등 확인이 필요합니다.',page:'safety-behavior-management',action:'안전조치 현황 열기'},
  {index:'05',title:'실천약속',en:'BEHAVIOR COMMITMENT',detail:'근로자 스스로 작성한 실천 약속을 교육과 재확인으로 이어갑니다. 교육 실시와 실제 개선 완료는 구분합니다.',page:'education-return',action:'교육 환류 열기'},
];
const METRICS = [
  ['01','위험인지','Awareness'],['02','교육이해','Understanding'],['03','실천참여','Engagement'],
  ['04','보호구·수칙','Protection'],['05','소통·보고','Communication'],['06','작업중지 감수성','Stop-work awareness'],
];

const CoreArt: React.FC<{ active: number; paused: boolean; reduced: boolean; sequenceNonce?:number; cinematicActive?:boolean }> = ({ active, paused, reduced, sequenceNonce=0, cinematicActive=false }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const focusRef = useRef(active);
  useEffect(() => { focusRef.current = active; }, [active]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = 0;
    let phase = 0;
    const sceneStarted=performance.now();
    let smoothedFocus = focusRef.current;
    let visible = document.visibilityState === 'visible';
    let w = 600, h = 540;
    const n = window.matchMedia('(max-width: 700px)').matches ? 680 : 1700;
    const points = Array.from({length:n},(_,i)=>{
      const y=1-(i+.5)*2/n, a=i*Math.PI*(3-Math.sqrt(5)), r=Math.sqrt(Math.max(0,1-y*y));
      return {x:Math.cos(a)*r,y,z:Math.sin(a)*r,seed:((i*47)%101)/101,color:i%15===0?1:0};
    });
    const resize = () => {
      const rect=canvas.getBoundingClientRect();
      w=Math.max(rect.width,1);h=Math.max(rect.height,1);
      const pixelRatio=Math.min(window.devicePixelRatio||1,1.6);
      canvas.width=Math.round(w*pixelRatio);canvas.height=Math.round(h*pixelRatio);
      ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
      draw();
    };
    const rotate = (x:number,y:number,z:number,ay:number,ax:number) => {
      const xx=x*Math.cos(ay)+z*Math.sin(ay), zz=z*Math.cos(ay)-x*Math.sin(ay);
      return {x:xx,y:y*Math.cos(ax)-zz*Math.sin(ax),z:y*Math.sin(ax)+zz*Math.cos(ax)};
    };
    const draw = () => {
      smoothedFocus += (focusRef.current - smoothedFocus) * .065;
      const t=reduced?0.35:phase;
      const story=cinematicActive?Math.min(12,(performance.now()-sceneStarted)/1000):-1;
      const sweep=story>=0?Math.max(0,Math.min(1,story/12)):0;
      const cx=w*.5+Math.sin(t*.34)*w*.009+(story>=0?Math.sin(story*.48)*w*.013:0);
      const cy=h*.50+Math.cos(t*.26)*h*.007+(story>=0?(sweep-.5)*h*.013:0);
      const R=Math.min(w*.255,h*.275,176)*(story>=0?(1+.075*Math.sin(sweep*Math.PI)):1);
      ctx.clearRect(0,0,w,h);
      const halo=ctx.createRadialGradient(cx,cy,R*.06,cx,cy,R*2.2);
      halo.addColorStop(0,'rgba(255,205,116,.29)');halo.addColorStop(.36,'rgba(247,139,55,.075)');
      halo.addColorStop(.8,'rgba(22,115,139,.023)');halo.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=halo;ctx.fillRect(cx-R*2.3,cy-R*2.3,R*4.6,R*4.6);
      const project=(x:number,y:number,z:number)=>{const d=3/(3-z*.45);return {x:cx+x*R*d,y:cy+y*R*d,d};};
      for(let ring=0;ring<3;ring++){
        const incline=[.43,-.84,1.06][ring],spin=t*[.43,-.29,.17][ring]+ring*.8;
        ctx.lineWidth=.7;
        for(let j=0;j<170;j++){
          const a=j*2*Math.PI/170,b=(j+1)*2*Math.PI/170;
          const p=rotate(Math.cos(a)*1.66,Math.sin(a)*1.66,0,spin,incline);
          const q=rotate(Math.cos(b)*1.66,Math.sin(b)*1.66,0,spin,incline);
          const s=project(p.x,p.y,p.z),e=project(q.x,q.y,q.z);
          ctx.strokeStyle=ring===2?'rgba(82,217,229,'+(.09+Math.max(0,p.z)*.15)+')':'rgba(251,186,108,'+(.07+Math.max(0,p.z)*.18)+')';
          ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(e.x,e.y);ctx.stroke();
        }
        const a=t*(ring===1?-1.2:1.05)+ring*1.8,p=rotate(Math.cos(a)*1.66,Math.sin(a)*1.66,0,spin,incline),d=project(p.x,p.y,p.z);
        ctx.shadowColor=ring===2?'#60ebec':'#ffc37e';ctx.shadowBlur=14;
        ctx.fillStyle=ring===2?'#76e6eb':'#ffcf9b';ctx.beginPath();ctx.arc(d.x,d.y,2.3,0,2*Math.PI);ctx.fill();ctx.shadowBlur=0;
      }
      const sorted=points.map(p=>{
        const pos=rotate(p.x,p.y,p.z,t+smoothedFocus*.085,.27+Math.sin(t*.5)*.18);
        const size=1+.035*Math.sin(t*4+p.seed*19),pr=project(pos.x*size,pos.y*size,pos.z*size);
        return {x:pr.x,y:pr.y,z:pos.z,s:(.5+p.seed*1.05)*pr.d,color:p.color};
      }).sort((a,b)=>a.z-b.z);
      // Software fallback retains a few soft additive highlights without per-particle blur.
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.shadowBlur=12;
      sorted.forEach((p,i)=>{
        if(i%29!==0 || p.z<.05) return;
        ctx.shadowColor=p.color?'#74e8e2':'#ffc18a';
        ctx.fillStyle=p.color?'rgba(88,223,227,.32)':'rgba(255,191,106,.35)';
        ctx.beginPath();ctx.arc(p.x,p.y,p.s*1.7,0,Math.PI*2);ctx.fill();
      });
      ctx.restore();
      sorted.forEach(p=>{
        const alpha=(p.z>0?.5:.23)+Math.max(0,p.z)*.37;
        ctx.fillStyle=p.color?'rgba(119,236,236,'+alpha+')':'rgba(255,189,106,'+alpha+')';
        ctx.beginPath();ctx.arc(p.x,p.y,p.s,0,Math.PI*2);ctx.fill();
      });
      const centerGlow=ctx.createRadialGradient(cx,cy,5,cx,cy,R*.68);
      centerGlow.addColorStop(0,'rgba(255,216,162,.1)');centerGlow.addColorStop(1,'rgba(255,180,95,0)');
      ctx.fillStyle=centerGlow;ctx.beginPath();ctx.arc(cx,cy,R*.7,0,Math.PI*2);ctx.fill();
    };
    const tick=(time:number)=>{
      if(!visible||paused||reduced)return;
      if(time-last>31){phase+=.018;last=time;draw();}
      raf=requestAnimationFrame(tick);
    };
    const visibility=()=>{
      visible=document.visibilityState==='visible';cancelAnimationFrame(raf);
      if(visible&&!paused&&!reduced)raf=requestAnimationFrame(tick);
    };
    const observer=new ResizeObserver(resize);observer.observe(canvas);
    document.addEventListener('visibilitychange',visibility);
    resize();
    if(!paused&&!reduced&&visible)raf=requestAnimationFrame(tick);
    return ()=>{cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',visibility);};
  },[paused,reduced,sequenceNonce,cinematicActive]);
  return <canvas ref={ref} className="nexus-core-canvas" aria-hidden="true"/>;
};

const SafetyNexus:React.FC<Props>=({workerRecords,loadState='ready',initialTrade='',initialView,onViewChange,onNavigateToPage,onReturnDashboard,onOpenRecord:requestOpenRecord})=>{
  const [active,setActive]=useState(initialView?.active ?? 0);
  const [immersive,setImmersive]=useState(false);
  const [recordNotice,setRecordNotice]=useState('');
  const [pendingRecord,setPendingRecord]=useState<WorkerRecord|null>(null);
  const onOpenRecord=requestOpenRecord ? (record:WorkerRecord)=>{
    if(workerRecords.filter(row=>String(row.id || '').trim()===String(record.id || '').trim()).length!==1){
      setRecordNotice('동일 식별자의 기록이 여러 개입니다. 오래된 이력으로 덮어쓰지 않도록 상세 편집을 열지 않았습니다. 원본 기록을 대조해 주세요.');
      return;
    }
    setRecordNotice('');setImmersive(false);setPendingRecord(record);
  } : undefined;
  useEffect(()=>{
    if(!pendingRecord || immersive)return;
    const frame=requestAnimationFrame(()=>{requestOpenRecord?.(pendingRecord);setPendingRecord(null);});
    return ()=>cancelAnimationFrame(frame);
  },[pendingRecord,immersive,requestOpenRecord]);
  const immersiveToggleRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!immersive)return;
    const priorOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const surface=document.querySelector<HTMLElement>('.safety-nexus.is-immersive');
    const background=Array.from(document.body.children).filter((element):element is HTMLElement =>
      element instanceof HTMLElement && element!==surface && !element.contains(surface));
    const previousInert=background.map(element=>element.inert);
    background.forEach(element=>{element.inert=true;});
    immersiveToggleRef.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setImmersive(false);return;}
      if(event.key!=='Tab')return;
      const surface=document.querySelector<HTMLElement>('.safety-nexus.is-immersive');
      const targets=surface ? Array.from(surface.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), summary, a[href], [tabindex]:not([tabindex="-1"])')).filter(el=>el.getClientRects().length>0) : [];
      if(!targets.length)return;
      const first=targets[0],last=targets[targets.length-1];
      if(event.shiftKey && (document.activeElement===first || !surface?.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey && (document.activeElement===last || !surface?.contains(document.activeElement))){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',onKey);
    return ()=>{document.body.style.overflow=priorOverflow;document.removeEventListener('keydown',onKey);background.forEach((element,index)=>{element.inert=previousInert[index];});requestAnimationFrame(()=>immersiveToggleRef.current?.focus());};
  },[immersive]);
  const [flat,setFlat]=useState(!nexusFeatureFlags.threeDEnabled || (initialView?.flat ?? false));
  const [cinematicPlaying,setCinematicPlaying]=useState(false);
  const [cinematicNonce,setCinematicNonce]=useState(0);
  useEffect(()=>{
    if(!cinematicPlaying)return;
    const timeout=setTimeout(()=>setCinematicPlaying(false),12000);
    return ()=>clearTimeout(timeout);
  },[cinematicPlaying,cinematicNonce]);
  // Keep a high-fidelity still on mobile; motion runs only after an explicit play action.
  const [paused,setPaused]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 700px)').matches);
  const [reduced,setReduced]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange=(event:MediaQueryListEvent)=>setReduced(event.matches);
    preference.addEventListener('change',onChange);
    return ()=>preference.removeEventListener('change',onChange);
  },[]);
  useEffect(()=>{if(reduced)setCinematicPlaying(false);},[reduced]);
  const [filterMonth,setFilterMonth]=useState(initialView?.month ?? '');
  const [filterTrade,setFilterTrade]=useState(initialView?.trade ?? initialTrade);
  const [selectedQuestion,setSelectedQuestion]=useState<number | null>(initialView?.question ?? null);
  const [priorityFilter,setPriorityFilter]=useState<FollowupFilter | 'recheck' | null>(initialView?.priority ?? null);
  useEffect(()=>{onViewChange?.({month:filterMonth,trade:filterTrade,active,flat,question:selectedQuestion,priority:priorityFilter});},[filterMonth,filterTrade,active,flat,selectedQuestion,priorityFilter,onViewChange]);
  const loadedSlice=useMemo(
    ()=>sliceLoadedNexusRecords(workerRecords,{month:filterMonth,trade:filterTrade}),
    [workerRecords,filterMonth,filterTrade]
  );
  const snapshot=loadedSlice.snapshot;
  const filteredRecords=useMemo(
    ()=>filterLoadedNexusRecords(workerRecords,{month:filterMonth,trade:filterTrade}),
    [workerRecords,filterMonth,filterTrade]
  );
  const asOfWindow=useMemo(()=>{
    const today=getKoreanCalendarDay();
    const year=Number(filterMonth.slice(0,4)),month=Number(filterMonth.slice(5,7));
    const endOfMonth=filterMonth && month>=1 && month<=12 && year>=2000 && year<=2100
      ? filterMonth+'-'+String(new Date(year,month,0).getDate()).padStart(2,'0')
      : today;
    return {
      asOfDate:endOfMonth>today?today:endOfMonth,
      ...(filterMonth?{periodStartDate:filterMonth+'-01'}:{})
    };
  },[filterMonth]);
  const followup=useMemo(
    ()=>buildMonthlyFieldFollowupSummary(filteredRecords,asOfWindow),
    [filteredRecords,asOfWindow]
  );
  const allFollowupCases=useMemo(()=>collectMonthlyFollowupCases(filteredRecords,followup.asOfDate),[filteredRecords,followup.asOfDate]);
  const questionCases=allFollowupCases.filter(row=>row.item.opened.questionNumber===selectedQuestion);
  const priorityCases=useMemo(()=>allFollowupCases
    .filter(row=>priorityFilter==='overdue'?row.overdue:priorityFilter==='unresolved'?!row.completed:priorityFilter==='reopened'?row.item.events.some(event=>event.status==='reopened'):row.item.latest.status===priorityFilter),
    [allFollowupCases,priorityFilter]);
  const practice=useMemo(
    ()=>buildPracticeVerificationSummary(filteredRecords,asOfWindow),
    [filteredRecords,asOfWindow]
  );
  const overdueRechecks=useMemo(()=>collectOverduePracticeRechecks(filteredRecords,practice.asOfDate),[filteredRecords,practice.asOfDate]);
  const count=snapshot.loadedRecordRows;
  const selected=STEPS[active];
  const focusPaths=[
    'M500 350 Q355 232 172 120','M500 350 Q635 205 843 112',
    'M500 350 Q732 345 920 335','M500 350 Q720 533 820 590',
    'M500 350 Q322 525 160 590'
  ];
  const showFollowupDetails=()=>{
    const target=document.getElementById('nexus-followup-details');
    target?.scrollIntoView({behavior:'auto',block:'start'});
    target?.focus({preventScroll:true});
  };
  if(loadState!=='ready') return <main className="safety-nexus" aria-label="PSI 안전지능 네트워크"><section className="nexus-followup" role="status"><h1>안전지능 네트워크</h1><p>{loadState==='loading'?'저장된 기록을 불러오고 있습니다.':'기록을 불러오지 못했습니다. 화면을 다시 불러와 주세요.'}</p><button type="button" onClick={()=>onNavigateToPage('dashboard')}>기존 관제센터로 돌아가기</button></section></main>;
  const surface=<main role={immersive?'dialog':undefined} aria-modal={immersive?true:undefined} className={'safety-nexus'+(immersive?' is-immersive':'')} data-reduced-motion={reduced ? 'true' : 'false'} data-motion-paused={paused ? 'true' : 'false'} aria-label="PSI 안전지능 네트워크">
    <div className="nexus-background" aria-hidden="true"/>
    <header className="nexus-header">
      <div className="nexus-brand"><span className="nexus-symbol">Ψ</span><div><small>PROACTIVE SAFETY INTELLIGENCE</small><h1>SAFETY <b>NEXUS</b></h1></div></div>
      <div className="nexus-header-right"><span className="nexus-status"><i/>VISUAL GATE 02 · GPU 시제품</span>
        <button ref={immersiveToggleRef} type="button" className="nexus-immersive-toggle" aria-pressed={immersive} onClick={()=>setImmersive(v=>!v)}>{immersive?'몰입 화면 종료 ↙':'전체 화면 몰입 보기 ⤢'}</button>
        <button type="button" onClick={()=>onReturnDashboard ? onReturnDashboard(filterTrade) : onNavigateToPage('dashboard')}>기존 관제센터로 돌아가기 ↗</button></div>
    </header>
    <div className="nexus-lead"><span>INTELLIGENCE VISUALIZATION</span><p>위험을 인식하고, 근거를 확인하고, 조치와 교육으로 연결하다. 관제센터로 돌아가면 공종과 이전 조회기간을 복원합니다. 작성 월은 이 화면에서 별도로 선택합니다.</p></div>
    <section className="nexus-priority-summary" aria-label="우선 확인할 후속조치">
      <div><strong>우선 확인할 후속조치</strong><p>현재 불러온 기록 · {filterMonth || '전체 작성기간'} · {filterTrade || '전체 공종'} · 기준일 {followup.asOfDate}</p></div>
      <div className="nexus-priority-counts"><button type="button" aria-pressed={priorityFilter==='overdue'} onClick={()=>setPriorityFilter('overdue')}>기한 초과 <b>{followup.overdue}</b>건</button><button type="button" aria-pressed={priorityFilter==='unresolved'} onClick={()=>setPriorityFilter('unresolved')}>미완료 <b>{followup.unresolved}</b>건</button><button type="button" aria-pressed={priorityFilter==='recheck'} onClick={()=>setPriorityFilter('recheck')}>재확인 기한초과 <b>{practice.overdueFieldRecheck}</b>건</button></div>
      <p>기한 초과는 미완료에 포함될 수 있습니다. 긴급위험 전체 조회 결과는 아닙니다.</p>
      {recordNotice && <p role="alert">{recordNotice}</p>}
      {practice.conflictingRecords>0 && <p role="alert">재확인 이력의 내용이 충돌한 기록 {practice.conflictingRecords}건은 집계에서 제외했습니다. 원본을 확인해 주세요.</p>}
      {followup.conflictingRecords>0 && <p role="alert">조치 이력의 내용이 충돌한 기록 {followup.conflictingRecords}건은 집계에서 제외했습니다. 원본을 확인해 주세요.</p>}
      {priorityFilter==='recheck' && <div aria-live="polite"><h3>재확인 기한초과 {overdueRechecks.length}건</h3>
        {overdueRechecks.length===0 ? <p>선택 범위에 해당 기록이 없습니다.</p> : <ul>{overdueRechecks.map(item=>{
          const record=filteredRecords.find(row=>row.id===item.recordId);
          return <li key={item.recordId+'-'+item.question}>Q{item.question} · {PRACTICE_RESULT_LABELS[item.latest.result] || '확인 필요'} · 예정일 {item.latest.nextCheckDueDate} {record && onOpenRecord && <button type="button" onClick={()=>onOpenRecord(record)}>관련 기록 열기</button>}</li>;
        })}</ul>}
      </div>}
      {priorityFilter && priorityFilter!=='recheck' && <div aria-live="polite"><h3>{FOLLOWUP_FILTER_LABELS[priorityFilter]} 조치 {priorityCases.length}건</h3>
        {priorityCases.length===0 ? <p>선택 범위에 해당 조치가 없습니다.</p> : <ul>{priorityCases.map(({recordId,item,dueDate})=>{
          const record=filteredRecords.find(row=>String(row.id || '').trim()===recordId);
          return <li key={recordId+'-'+item.caseId}>Q{item.opened.questionNumber} · {FOLLOWUP_STATUS_LABELS[item.latest.status] || '상태 확인 필요'} · 기한 {dueDate || '미지정'} {record && onOpenRecord && <button type="button" onClick={()=>onOpenRecord(record)}>관련 기록 열기</button>}</li>;
        })}</ul>}
      </div>}
      <button type="button" onClick={showFollowupDetails}>조치 내역과 범위 확인</button>
    </section>
    <div className="nexus-main">
      <aside className="nexus-aside">
        <div className="nexus-section-title"><span>01 / SYSTEM OVERVIEW</span><i/></div>
        <h2>현장의 위험신호를<br/><em>하나의 흐름으로.</em></h2>
        <p>근로자가 직접 기록하는 위험과 관리자의 검증, 조치, 교육 환류를 하나의 정보구조로 연결합니다.</p>
        <div className="nexus-aside-rule"/>
        <div className="nexus-record-count"><span>선택 조건에 해당하는 기록</span><strong>{count.toLocaleString('ko-KR')}<small> 건</small></strong><p>현재 화면에 전달된 기록 행 기준입니다. 전체 현장 조회 여부는 확인되지 않았습니다.</p></div>
        <div className="nexus-perception" aria-label="근로자가 직접 선택한 자가평가 등급의 분포">
          <span>WORKER SELF-ASSESSMENT</span>
          <h3>자가평가 상·중·하 <small>공식 위험등급 아님</small></h3>
          {(['상','중','하'] as const).map(level=><div className="nexus-perception-row" key={level}>
            <b>{level}</b><div className="nexus-perception-track"><i className={'risk-'+level} style={{width:(count?snapshot.selfRiskLevels[level]/count*100:0)+'%'}}/></div>
            <strong>{snapshot.selfRiskLevels[level]}</strong>
          </div>)}
          <p>유효 {count-snapshot.unclassifiedRows} / 전체 {count}건 · 미분류 {snapshot.unclassifiedRows}건</p>
          {count===0&&<p>선택 조건에 해당하는 기록이 없습니다. 전체 현장의 위험이 없다는 뜻은 아닙니다.</p>}
          <p>현재 불러온 기록의 작성일·공종 기준 · 현장 인증 범위 미검증</p>
        </div>
        <div className="nexus-aside-note"><b>◎ 시각화 모드 안내</b><p>입자·빛·궤도는 현재 디자인 표현입니다. 실제 위험수준·개선완료·작업중지를 자동 판단하지 않습니다.</p></div>
      </aside>
      <section className="nexus-visual" aria-label="5단계 위험성평가 네트워크 탐색">
        <div className="nexus-visual-head"><span><i/> INTELLIGENCE FIELD</span><div>
          <button type="button" disabled={!nexusFeatureFlags.threeDEnabled} aria-pressed={flat} onClick={()=>{setCinematicPlaying(false);setFlat(v=>!v)}}>{!nexusFeatureFlags.threeDEnabled?'간결한 보기 · 입체 기능 꺼짐':flat?'입체 보기':'간결한 보기'}</button>
          <button type="button" disabled={flat||reduced} onClick={()=>{setCinematicPlaying(false);setPaused(v=>!v)}}>{paused?'모션 재생':'모션 일시정지'}</button>
          <button type="button" className="nexus-story-button" disabled={flat||reduced}
            aria-pressed={cinematicPlaying}
            onClick={()=>{if(cinematicPlaying){setCinematicPlaying(false)}else{setPaused(false);setCinematicNonce(v=>v+1);setCinematicPlaying(true)}}}>
            {cinematicPlaying?'12초 연출 중단':'12초 시네마틱 보기'}
          </button>
        </div></div>
        <div className={'nexus-stage'+(flat?' is-flat':'')+(cinematicPlaying?' is-cinematic':'')} data-cinematic={cinematicPlaying?'playing':'idle'}>
          {!flat&&<WebGLNexusCore active={active} paused={paused} reduced={reduced} sequenceNonce={cinematicNonce} cinematicActive={cinematicPlaying} fallback={<CoreArt active={active} paused={paused} reduced={reduced} sequenceNonce={cinematicNonce} cinematicActive={cinematicPlaying}/>}/>}
          {!flat&&<div className="nexus-nucleus" aria-hidden="true"/>}
          {!flat&&<svg className="nexus-hud-orbits" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
            <ellipse cx="500" cy="350" rx="330" ry="130" transform="rotate(-31 500 350)"/>
            <ellipse cx="500" cy="350" rx="280" ry="100" transform="rotate(57 500 350)"/>
            <ellipse cx="500" cy="350" rx="355" ry="178" transform="rotate(10 500 350)"/>
          </svg>}
          {!flat&&<svg className="nexus-focus-link" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
            <path key={selected.index} d={focusPaths[active]} />
          </svg>}
          {!flat&&<div className="nexus-scene-caption" aria-live="off">
            <span>CORE · ORBIT · EVIDENCE</span>
            <small>그래픽 시연 / 실시간 위험 경보 아님</small>
          </div>}
          <div className="nexus-core-label" aria-hidden="true"><strong>PSI</strong><small>HUMAN RISK<br/>INTELLIGENCE</small></div>
          {STEPS.map((topic,i)=><button key={topic.index} type="button" className={'nexus-node node-'+i+(active===i?' selected':'')}
            aria-pressed={active===i} onClick={()=>setActive(i)}><b>{topic.index}</b><span>{topic.title}</span></button>)}
          <div className="nexus-crosshair" aria-hidden="true">Q1 — Q5 / SELF-ASSESSMENT</div>
        </div>
        <div className="nexus-visual-foot"><span>위험성평가 작성 문항 Q1–Q5</span>
          <span>{cinematicPlaying?'연출 재생 중 · 데이터는 변하지 않습니다.':'노드를 눌러 상세 업무를 탐색하세요.'}</span>
        </div>
      </section>
      <aside className="nexus-detail">
        <div className="nexus-section-title"><span>02 / SELECTED SIGNAL</span><b>{selected.index} / 05</b></div>
        <div key={selected.index} className="nexus-detail-intro"><span>{selected.en}</span><h2>{selected.title}</h2></div>
        <div className="nexus-detail-pulse" aria-hidden="true"><i/><i/><i/></div>
        <p className="nexus-detail-text">{selected.detail}</p>
        <div className="nexus-detail-notice"><b>!</b><span>시각적 강조는 위험확정 또는 개선완료를 뜻하지 않습니다.</span></div>
        <button type="button" className="nexus-primary" onClick={()=>onNavigateToPage(selected.page)}>{selected.action}<span>↗</span></button>
        <div className="nexus-next"><span>SAFETY LOOP · NEXT ACTION</span><ol><li>근로자 위험 인식</li><li>AI 구조화 · 관리자 대조</li><li>조치 · 기한 · 재점검</li><li>교육 · 재확인 · 환류</li></ol></div>
      </aside>
    </div>
    <section id="nexus-followup-details" tabIndex={-1} className="nexus-followup" aria-label="근로자 위험성평가 후속조치 익명 집계">
      <div className="nexus-followup-header">
        <div><span>VERIFIABLE READ-ONLY SIGNALS</span><h2>후속조치 현황 <small>불러온 기록의 관리자 이력 기준</small></h2></div>
        <p>이 화면은 현장 안전을 판정하거나 조치 완료를 승인하지 않습니다. <b>현장별 인증 범위는 아직 미연동</b>입니다.</p>
      </div>
      <div className="nexus-followup-filters">
        <label>현장
          <select disabled aria-label="현장 인증 범위 미연동"><option>현장 인증 범위 미연동</option></select>
        </label>
        <label>작성 월
          <select value={filterMonth} onChange={event=>{setFilterMonth(event.target.value);setSelectedQuestion(null)}} aria-label="작성 월 선택">
            <option value="">전체 작성기간</option>
            {filterMonth && !loadedSlice.monthOptions.includes(filterMonth) && <option value={filterMonth}>{filterMonth} · 현재 기록 없음</option>}
            {loadedSlice.monthOptions.map(month=><option key={month} value={month}>{month}</option>)}
          </select>
        </label>
        <label>공종
          <select value={filterTrade} onChange={event=>{setFilterTrade(event.target.value);setSelectedQuestion(null)}} aria-label="공종 선택">
            <option value="">전체 공종</option>
            {filterTrade && !loadedSlice.tradeOptions.includes(filterTrade) && <option value={filterTrade}>{filterTrade} · 현재 기록 없음</option>}
            {loadedSlice.tradeOptions.map(trade=><option key={trade} value={trade}>{trade}</option>)}
          </select>
        </label>
        <span className="nexus-followup-asof">조치 기준일 {followup.asOfDate} · 확인 범위: 현재 불러온 기록</span>
      </div>
      <div className="nexus-followup-cards">
        {[
          ['미완료',followup.unresolved,'unresolved'],
          ['기한 초과',followup.overdue,'overdue'],
          ['임시 통제 중',followup.interimControl,'interim_control'],
          ['조치 예정',followup.scheduled,'scheduled'],
          ['재개방 이력',followup.reopened,'reopened'],
          ['완료로 기록된 조치',followup.completed,'completed'],
        ].map(([label,value,tone])=>
          <button type="button" aria-pressed={priorityFilter===tone} onClick={()=>{setPriorityFilter(tone as FollowupFilter);document.querySelector('.nexus-priority-summary')?.scrollIntoView({block:'start'});}} className={'nexus-followup-card tone-'+tone} key={String(label)}>
            <span>{label}</span><strong>{value}</strong><small>건</small>
          </button>
        )}
      </div>
      <div className="nexus-followup-breakdown" aria-label="문항별 후속조치 내역">
        <h3>문항별 확인이 필요한 조치</h3>
        <p>선택한 작성 기록과 연결된 조치입니다. 기한 초과와 재개방 이력은 미완료 건수와 겹칠 수 있습니다.</p>
        {followup.totalCases === 0 ? <p>{followup.conflictingRecords ? '집계 가능한 조치 이력이 없습니다. 충돌 기록의 원본을 확인해 주세요.' : '선택한 기록에 연결된 조치 이력이 없습니다.'}</p> :
          <ul>{followup.questionGroups.filter(group=>group.unresolved || group.overdue || group.reopened).map(group=>
            <li key={group.number}><button type="button" aria-pressed={selectedQuestion===group.number} onClick={()=>setSelectedQuestion(group.number)}>Q{group.number} 관련 기록 보기</button> · 미완료 {group.unresolved}건 · 기한 초과 {group.overdue}건 · 재개방 이력 {group.reopened}건</li>
          )}</ul>}
        {followup.totalCases > 0 && followup.questionGroups.every(group=>!group.unresolved && !group.overdue && !group.reopened) &&
          <p>선택 범위에서 미완료 또는 재개방 이력이 집계되지 않았습니다.</p>}
        {selectedQuestion!==null && <div>
          <p>Q{selectedQuestion}에 연결된 이력이 있는 선택 범위의 기록입니다. 아래 이력은 조치 기준일 {followup.asOfDate}까지 표시하며, 완료 이력도 포함할 수 있습니다.</p>
          {questionCases.length===0 && <p>해당 문항에 집계 가능한 조치가 없습니다. 충돌한 이력은 표시하지 않습니다.</p>}
          <ul>{questionCases.map(({recordId,item})=>{
            const record=filteredRecords.find(row=>String(row.id || '').trim()===recordId);
            return <li key={recordId+'-'+item.caseId}>{record?.date} · {record?.jobField || '공종 미확인'} · {record?.name || '이름 미확인'} {record && onOpenRecord && <button type="button" onClick={()=>onOpenRecord(record)}>기록 상세 열기</button>}
              <details><summary>해당 문항 조치 이력 보기</summary>
                <ul>{item.events.map(event=>
                  <li key={event.id}>{event.timestamp} · {FOLLOWUP_STATUS_LABELS[event.status] || '상태 확인 필요'} · {event.actionDetail || '내용 없음'}</li>
                )}</ul>
              </details>
              {!record?.handwrittenAnswers?.some(answer=>Boolean(String(answer.answerText || '').trim())) && <span> · 자필 답변이 없어 상세 화면의 조치 도구가 표시되지 않을 수 있습니다.</span>}</li>;
          })}</ul>
        </div>}
      </div>
      <div className="nexus-practice">
        <div className="nexus-practice-heading">
          <strong>현장 실천 확인 · 별도 재점검</strong>
          <span>교육 전달과 조치 완료는 구별하며, 재점검은 관리자 이력 기준입니다.</span>
        </div>
        <div className="nexus-recheck-cards">
          {[
            ['교육 전달 기록',practice.educationDelivered],
            ['현장 관찰 기록',practice.fieldObserved],
            ['현장 재점검 기록',practice.rechecked],
            ['재확인 필요',practice.needsFieldRecheck],
            ['재확인 기한초과',practice.overdueFieldRecheck],
          ].map(([label,total])=>
            <div className="nexus-recheck-card" key={String(label)}>
              <span>{label}</span><strong>{total}</strong><small>건</small>
            </div>
          )}
        </div>
        <p>재확인 필요는 기록·문항의 마지막 현장 확인에서 개선 필요 또는 확인 불가로 남은 경우입니다.
          안전행동이 관찰되었더라도 조치 완료·작업재개가 자동 승인되는 것은 아닙니다.</p>
      </div>
      <div className="nexus-followup-footer">
        <span>조치 이력 {followup.totalCases}건 · 선택한 작성기록과 연결된 조치만 반영 · 이전 주기 미완료 {followup.carriedOver}건 · 선택 월말 또는 현재일 기준 상태입니다.</span>
        <span>미완료·임시통제·기한초과는 완료로 처리하지 않습니다. 재개방은 이력 건수이며 현재 미완료와 중복될 수 있습니다.</span>
        {loadedSlice.undatedRowsInAllPeriods>0&&<span>작성일 확인 불가 {loadedSlice.undatedRowsInAllPeriods}행 · 특정 월로 임의 배정하지 않음</span>}
      </div>
    </section>
    <section className="nexus-metrics" aria-label="6대 안전인식 지표">
      <div className="nexus-metrics-caption"><span>THE SIX PROTECTION SIGNALS</span><strong>6대 안전인식 지표</strong><p>지표명 안내입니다. 점수와 유효 분모는 이 화면에 아직 연결되지 않았습니다.</p></div>
      <div className="nexus-metrics-list">{METRICS.map(s=><div className="nexus-metric" key={s[0]}><span>{s[0]} <i/></span><strong>{s[1]}</strong><small>{s[2]}</small></div>)}</div>
      <button type="button" onClick={()=>onNavigateToPage('monthly-guidance-report')}>기존 평가 보고서 열기</button>
    </section>
    <ScoreMetricEvidencePanel records={filteredRecords} scopeLabel={`${filterMonth || '전체 작성기간'} · ${filterTrade || '전체 공종'}`} asOf={followup.asOfDate} loadState={loadState} onOpenRecord={onOpenRecord}/>
    <footer className="nexus-footer"><span>PSI / SAFETY NEXUS</span><span>현재 불러온 기록의 탐색 화면입니다. 실제 현장 승인 통계와의 대조는 미완료입니다.</span>
      <label><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/> 움직임 줄이기</label></footer>
  </main>;
  return immersive && typeof document!=='undefined' ? createPortal(surface,document.body) : surface;
};
export default SafetyNexus;

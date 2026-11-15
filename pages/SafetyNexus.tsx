import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Page, WorkerRecord } from '../types';
import { summarizeLoadedNexusRecords } from '../utils/safetyNexusViewModel';
import WebGLNexusCore from './NexusWebGLCore';
import './SafetyNexus.css';

type Topic = { index: string; title: string; en: string; detail: string; page: Page; action: string };
type Props = { workerRecords: WorkerRecord[]; onNavigateToPage: (page: Page) => void };
const STEPS: Topic[] = [
  {index:'01',title:'위험작업',en:'RISK IDENTIFICATION',detail:'근로자가 가장 위험하다고 느끼는 작업을 직접 기록합니다. 개인의 위험 인식과 현장에서 확정된 위험은 구별합니다.',page:'ocr-analysis',action:'위험성평가 원본 확인'},
  {index:'02',title:'위험요소',en:'HAZARD SIGNAL',detail:'추락·끼임·감전 등 위험요소를 분석합니다. AI 해석은 관리자 원본 대조와 검토를 거친 후 활용합니다.',page:'ocr-analysis',action:'위험요소 분석 열기'},
  {index:'03',title:'위험등급',en:'SELF-ASSESSMENT',detail:'근로자가 선택한 상·중·하와 그 이유를 살핍니다. 근로자 자가평가를 현장 위험의 최종 판정으로 표시하지 않습니다.',page:'predictive-analysis',action:'위험신호 분석 열기'},
  {index:'04',title:'안전조치',en:'PROTECTIVE ACTION',detail:'즉시 조치가 어려운 경우에도 미해결 상태를 유지합니다. 임시 보호조치·담당·목표일·재점검 등 확인이 필요합니다.',page:'safety-behavior-management',action:'안전조치 현황 열기'},
  {index:'05',title:'실천약속',en:'BEHAVIOR COMMITMENT',detail:'근로자 스스로 작성한 실천 약속을 교육과 재확인으로 이어갑니다. 교육 실시와 실제 개선 완료는 구분합니다.',page:'education-return',action:'교육 환류 열기'},
];
const METRICS = [
  ['01','위험인지','Awareness'],['02','교육이해','Understanding'],['03','실천참여','Engagement'],
  ['04','보호구·수칙','Protection'],['05','소통·보고','Communication'],['06','작업중지 감수성','Stop-work awareness'],
];

const CoreArt: React.FC<{ active: number; paused: boolean; reduced: boolean }> = ({ active, paused, reduced }) => {
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
      const cx=w*.5,cy=h*.50,R=Math.min(w*.255,h*.275,176),t=reduced?0.35:phase;
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
  },[paused,reduced]);
  return <canvas ref={ref} className="nexus-core-canvas" aria-hidden="true"/>;
};

const SafetyNexus:React.FC<Props>=({workerRecords,onNavigateToPage})=>{
  const [active,setActive]=useState(0);
  const [immersive,setImmersive]=useState(false);
  useEffect(()=>{
    if(!immersive)return;
    const priorOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setImmersive(false);};
    document.addEventListener('keydown',onKey);
    return ()=>{document.body.style.overflow=priorOverflow;document.removeEventListener('keydown',onKey);};
  },[immersive]);
  const [flat,setFlat]=useState(false);
  // Keep a high-fidelity still on mobile; motion runs only after an explicit play action.
  const [paused,setPaused]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 700px)').matches);
  const [reduced,setReduced]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const snapshot=useMemo(()=>summarizeLoadedNexusRecords(workerRecords),[workerRecords]);
  const count=snapshot.loadedRecordRows;
  const selected=STEPS[active];
  const focusPaths=[
    'M500 350 Q355 232 172 120','M500 350 Q635 205 843 112',
    'M500 350 Q732 345 920 335','M500 350 Q720 533 820 590',
    'M500 350 Q322 525 160 590'
  ];
  const surface=<main className={'safety-nexus'+(immersive?' is-immersive':'')} aria-label="PSI 안전지능 네트워크">
    <div className="nexus-background" aria-hidden="true"/>
    <header className="nexus-header">
      <div className="nexus-brand"><span className="nexus-symbol">Ψ</span><div><small>PROACTIVE SAFETY INTELLIGENCE</small><h1>SAFETY <b>NEXUS</b></h1></div></div>
      <div className="nexus-header-right"><span className="nexus-status"><i/>VISUAL GATE 02 · GPU 시제품</span>
        <button type="button" className="nexus-immersive-toggle" aria-pressed={immersive} onClick={()=>setImmersive(v=>!v)}>{immersive?'몰입 화면 종료 ↙':'전체 화면 몰입 보기 ⤢'}</button>
        <button type="button" onClick={()=>onNavigateToPage('dashboard')}>기존 관제센터로 돌아가기 ↗</button></div>
    </header>
    <div className="nexus-lead"><span>INTELLIGENCE VISUALIZATION</span><p>위험을 인식하고, 근거를 확인하고, 조치와 교육으로 연결하다.</p></div>
    <div className="nexus-main">
      <aside className="nexus-aside">
        <div className="nexus-section-title"><span>01 / SYSTEM OVERVIEW</span><i/></div>
        <h2>현장의 위험신호를<br/><em>하나의 흐름으로.</em></h2>
        <p>근로자가 직접 기록하는 위험과 관리자의 검증, 조치, 교육 환류를 하나의 정보구조로 연결합니다.</p>
        <div className="nexus-aside-rule"/>
        <div className="nexus-record-count"><span>화면에 불러온 기록</span><strong>{count.toLocaleString('ko-KR')}<small> 건</small></strong><p>로드 건수이며 공식 집계·안전판정이 아닙니다.</p></div>
        <div className="nexus-perception" aria-label="근로자가 직접 선택한 자가평가 등급의 분포">
          <span>WORKER SELF-ASSESSMENT</span>
          <h3>자가평가 상·중·하 <small>공식 위험등급 아님</small></h3>
          {(['상','중','하'] as const).map(level=><div className="nexus-perception-row" key={level}>
            <b>{level}</b><div className="nexus-perception-track"><i className={'risk-'+level} style={{width:(count?snapshot.selfRiskLevels[level]/count*100:0)+'%'}}/></div>
            <strong>{snapshot.selfRiskLevels[level]}</strong>
          </div>)}
          {snapshot.unclassifiedRows>0&&<p>미분류 {snapshot.unclassifiedRows}건 · 안전으로 간주하지 않음</p>}
          <p>현재 불러온 작성 행만 집계 · 현장/월 범위 미검증</p>
        </div>
        <div className="nexus-aside-note"><b>◎ 시각화 모드 안내</b><p>입자·빛·궤도는 현재 디자인 표현입니다. 실제 위험수준·개선완료·작업중지를 자동 판단하지 않습니다.</p></div>
      </aside>
      <section className="nexus-visual" aria-label="5단계 위험성평가 네트워크 탐색">
        <div className="nexus-visual-head"><span><i/> INTELLIGENCE FIELD</span><div>
          <button type="button" aria-pressed={flat} onClick={()=>setFlat(v=>!v)}>{flat?'입체 보기':'간결한 보기'}</button>
          <button type="button" disabled={flat||reduced} onClick={()=>setPaused(v=>!v)}>{paused?'모션 재생':'모션 일시정지'}</button>
        </div></div>
        <div className={'nexus-stage'+(flat?' is-flat':'')}>
          {!flat&&<WebGLNexusCore active={active} paused={paused} reduced={reduced} fallback={<CoreArt active={active} paused={paused} reduced={reduced}/>}/>}
          {!flat&&<svg className="nexus-focus-link" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
            <path key={selected.index} d={focusPaths[active]} />
          </svg>}
          <div className="nexus-core-label" aria-hidden="true"><strong>PSI</strong><small>HUMAN RISK<br/>INTELLIGENCE</small></div>
          {STEPS.map((topic,i)=><button key={topic.index} type="button" className={'nexus-node node-'+i+(active===i?' selected':'')}
            aria-pressed={active===i} onClick={()=>setActive(i)}><b>{topic.index}</b><span>{topic.title}</span></button>)}
          <div className="nexus-crosshair" aria-hidden="true">Q1 — Q5 / SELF-REGULATION</div>
        </div>
        <div className="nexus-visual-foot"><span>FIVE-STEP SAFETY CYCLE</span><span>노드를 눌러 상세 업무를 탐색하세요.</span></div>
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
    <section className="nexus-metrics" aria-label="6대 안전인식 지표">
      <div className="nexus-metrics-caption"><span>THE SIX PROTECTION SIGNALS</span><strong>6대 안전인식 지표</strong></div>
      <div className="nexus-metrics-list">{METRICS.map(s=><div className="nexus-metric" key={s[0]}><span>{s[0]} <i/></span><strong>{s[1]}</strong><small>{s[2]}</small></div>)}</div>
    </section>
    <footer className="nexus-footer"><span>PSI / SAFETY NEXUS · VG-1</span><span>지금은 시각·탐색 시제품입니다. 실제 승인 통계·처리상태 연동은 별도 검증 후 진행합니다.</span>
      <label><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/> 움직임 줄이기</label></footer>
  </main>;
  return immersive && typeof document!=='undefined' ? createPortal(surface,document.body) : surface;
};
export default SafetyNexus;

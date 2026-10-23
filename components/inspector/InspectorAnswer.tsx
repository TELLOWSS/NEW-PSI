import React,{useId,useRef,useState} from 'react';
import {LEGAL_CARDS,legalForTopics,sanctionText,type LegalReference} from '../../lib/inspector/legal';
import InspectorLegalFocus from './InspectorLegalFocus';
import InspectorCaseTrends from './InspectorCaseTrends';
import type {VisionImport} from '../../lib/inspector/types';
import InspectorLegalResult from './InspectorLegalResult';
import {findingLegalReference} from '../../lib/inspector/photoDiscovery';

const priorities={immediate:'우선 통제 검토',soon:'빠른 개선 검토',routine:'관리 상태 확인'};
const panels=['핵심 조치','법령·금액','사례·동향'];
export default function InspectorAnswer({analysis,reference,note,hasPhoto=false,rejected=false,onViewPhoto,onComposeCard}:{key?:number|string;analysis:VisionImport|null|undefined;reference:LegalReference;note:string;hasPhoto?:boolean;rejected?:boolean;onViewPhoto?:(location:string)=>void;onComposeCard?:(findingIndex:number)=>void}) {
    const [tab,setTab]=useState(0),[findingIndex,setFindingIndex]=useState(0),[manual,setManual]=useState<{analysis:VisionImport|null|undefined;index:number;topic:string}|null>(null);
    const id=useId(),tabs=useRef<(HTMLButtonElement|null)[]>([]),panel=useRef<HTMLElement>(null);
    const findings=analysis?.risk_findings||[],finding=findings[findingIndex],fact=finding?analysis?.observed_facts[Number(finding.observation_index)]:undefined;
    const matched=analysis?.risk_findings&&!rejected?findingLegalReference(analysis,reference,findingIndex):reference;
    const overridden=!!manual&&manual.analysis===analysis&&manual.index===findingIndex;
    const topic=overridden?manual.topic:matched.cards[0]?.id||'';
    const topicReference=overridden?{...legalForTopics(topic?[topic]:[]),dateStatus:reference.dateStatus}:matched;
    const card=topicReference.cards.find(c=>c.id===topic);
    const relatedEvidence=rejected?undefined:finding?[finding.problem,fact?.text].filter(Boolean).join(' / '):card?(analysis?.observed_facts.map(f=>f.text)||[note]).find(text=>card.keywords.some(word=>text.toLowerCase().includes(word))):undefined;
    const choices=overridden&&card&&!matched.cards.some(c=>c.id===topic)?[...matched.cards,card]:matched.cards;
    const selectTopic=(value:string)=>setManual({analysis,index:findingIndex,topic:value});
    const followup=analysis?.requires_confirmation[0],brief=(text:string)=>text.length>180?text.slice(0,180)+'…(전체는 아래 펼치기)':text;
    const cases=(topicReference.inspectionCases||[]).filter(c=>c.topics.includes(topic));
    const chooseTab=(n:number)=>{setTab(n);requestAnimationFrame(()=>panel.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));};
    const chooseFinding=(n:number)=>{setFindingIndex(n);setManual(null);};
    return <div className="si-answer">
        {analysis&&<div className="si-discovery-summary"><div><b>{rejected?'수용하지 않은 AI 결과 · 대조용':findings.length?`검토할 위험 단서 ${findings.length}개`:analysis.risk_findings?'구체적인 위험을 아직 좁히지 못했습니다':'이전 형식의 사진 관찰 자료'}</b>{rejected&&<p>저장할 판단과 조치는 전문가 의견을 우선하세요.</p>}</div>{onViewPhoto&&<button type="button" className="si-btn" aria-label="사진 확대·대조" onClick={()=>onViewPhoto(fact?.visual_basis||analysis.observed_facts[0]?.visual_basis||'')}>사진 확대</button>}</div>}
        {findings.length>0&&<div className="si-finding-picker" aria-label="사진의 위험 검토 항목">{findings.map((f,n)=><button type="button" key={n} aria-pressed={n===findingIndex} onClick={()=>chooseFinding(n)}><span>{n+1}</span>{f.problem}</button>)}</div>}
        <div className="si-answer-tabs" role="tablist" aria-label="점검 결과 상세">{panels.map((label,n)=><button key={label} ref={el=>{tabs.current[n]=el;}} type="button" role="tab" id={`${id}-tab-${n}`} aria-selected={tab===n} aria-controls={`${id}-panel`} tabIndex={tab===n?0:-1} onClick={()=>chooseTab(n)} onKeyDown={e=>{let next=n;if(e.key==='ArrowRight')next=(n+1)%3;else if(e.key==='ArrowLeft')next=(n+2)%3;else if(e.key==='Home')next=0;else if(e.key==='End')next=2;else return;e.preventDefault();chooseTab(next);tabs.current[next]?.focus();}}>{label}{n===2&&cases.length>0&&<span>{cases.length}</span>}</button>)}</div>
        <section ref={panel} role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`} tabIndex={0} className="si-answer-panel">
            {finding&&<div className="si-topic-context"><b>지금 보는 위험</b><p>{finding.problem}</p><small>{rejected?'AI 미수용 · 입력 설명·전문가 의견 기준':overridden?'직접 고른 기준 · 자동 연결 아님':card?'이 위험에 연결한 기준':'이 위험에 자동 연결할 수록 기준이 없습니다'}{card?` · ${card.title}`:''}</small></div>}
            {tab===0&&<>
                <article className="si-problem" aria-label="핵심 답변">
                    {finding?<><p className={`si-priority si-priority-${finding.priority}`}>{priorities[finding.priority]} · AI 위험 해석</p><h3>{finding.problem}</h3><p className="si-evidence"><b>어디를 볼까요</b> {fact?.visual_basis}</p><p className="si-evidence"><b>사진에 보이는 단서</b> {fact?.text}</p><p className="si-caption">관찰 판독 확신 {fact?.confidence==='high'?'높음':fact?.confidence==='medium'?'중간':'낮음'} · {fact?.confidence==='low'?'위치·상태를 사진만으로 확정하기 어렵습니다.':'위험·위반이 확정되었다는 뜻은 아닙니다.'}</p><div className="si-risk"><b>왜 문제가 될까요</b><p>{finding.risk}</p></div><div className="si-do-now"><b>먼저 할 일</b><p>{finding.action}</p></div></>:analysis?<><h3>{analysis.risk_findings||!analysis.observed_facts.length?'이 사진으로 문제를 특정하기 어렵습니다':'사진에서 보이는 상황'}</h3><ul>{analysis.observed_facts.slice(0,analysis.risk_findings?1:3).map((f,n)=><li key={n}>{f.text}<small>{f.visual_basis}</small></li>)}</ul>{analysis.risk_findings&&<p className="si-caption">구체적인 위험 해석이 제시되지 않았습니다. 안전이 확인되었다는 뜻은 아닙니다.</p>}{!analysis.risk_findings&&analysis.ai_hypotheses.length>0&&<div className="si-risk"><b>추가 해석 · AI 추론</b><p>{analysis.ai_hypotheses[0].text}</p><small>{analysis.ai_hypotheses[0].reason}</small></div>}{!analysis.risk_findings&&analysis.recommended_controls[0]&&<div className="si-do-now"><b>우선 조치 제안</b><p>{analysis.recommended_controls[0].action}</p></div>}</>:<><p className="si-priority">{hasPhoto&&!note.trim()?'사진 저장 상태 · AI 판독 전':'입력 설명 기준 · 사진 판독 아님'}</p><h3>{card?.title||(hasPhoto&&!note.trim()?'아직 사진에서 위험을 찾은 결과가 아닙니다':'상황을 조금 더 구체적으로 알려 주세요')}</h3><p>{hasPhoto&&!note.trim()?'사진 자체의 단서를 찾으려면 사진 AI 연결과 ON 상태가 필요합니다. 설명 입력은 필수가 아닙니다.':brief(note)}</p>{note.length>180&&<details><summary>입력 설명 전체</summary><p>{note}</p></details>}{card&&<div className="si-do-now"><b>우선 조치 참고</b><p>{card.actions[0]}</p></div>}</>}
                </article>
                {onComposeCard&&<button type="button" className="si-btn si-card-entry" onClick={()=>onComposeCard(finding?findingIndex:-1)}>이 사진·조치 한 장으로 보내기</button>}
                {analysis?.risk_findings&&findings.length===0&&<aside className="si-discovery-next" aria-label="다음에 확인할 한 가지"><h3>다음에 확인할 한 가지</h3>{followup?<><b>{brief(followup.question)}</b><p>{brief(followup.why)}</p></>:<p>{brief(analysis.limitations[0]||'촬영 범위와 화질만으로 구체적인 문제를 좁히기 어렵습니다.')}</p>}<p>안전한 위치에서 대상과 주변 작업이 함께 보이는 사진을 보태거나, 아는 상황만 힌트로 적어 주세요. 위험구역에 들어가거나 설비를 조작하며 촬영하지 마세요.</p><small>선택 보완 사항입니다. 답변·재촬영이 보고서 작성을 막지 않습니다.</small></aside>}
                {card&&(!analysis||finding)&&<div className="si-law-preview"><b>{card.duties[0].label}</b><p>{card.sanctions[0]?sanctionText(card.sanctions[0]):'금액 자동 산정 안 함'}</p>{card.sanctions[0]?<small>{card.sanctions[0].actor} · 의무 위반 성립 시 법정상한 · 실제 부과액 아님</small>:<small>{card.sanctionNote}</small>}<button className="si-btn" type="button" onClick={()=>{chooseTab(1);requestAnimationFrame(()=>tabs.current[1]?.focus());}}>이 사진의 적용 조건 보기</button></div>}
                {analysis&&<details className="si-answer-more"><summary>관찰·조치 전체와 현장 확인 사항</summary><h4>사진 관찰 제안</h4><ul>{analysis.observed_facts.map((f,n)=><li key={n}>{f.text}<small>{f.visual_basis} · 판독 확신 {f.confidence==='high'?'높음':f.confidence==='medium'?'중간':'낮음'}</small></li>)}</ul><h4>조치 제안 전체</h4><ul>{analysis.recommended_controls.map((c,n)=><li key={n}>{priorities[c.priority]} · {c.action}</li>)}</ul><h4>현장 확인 · 선택</h4><ul>{analysis.requires_confirmation.map((q,n)=><li key={n}>{q.question}<small>{q.why}</small></li>)}</ul><ul>{analysis.ai_hypotheses.map((h,n)=><li key={n}>추론: {h.text}<small>{h.reason}</small></li>)}</ul><p className="si-caption">{analysis.limitations.join(' / ')}</p></details>}
                {!card&&<p className="si-caption">수록 법령 중 관련 주제를 찾지 못했습니다. 법적 의무가 없다는 뜻은 아닙니다.</p>}
            </>}
            {tab!==0&&<>
                {analysis&&<p className="si-caption">{rejected?'AI 해석을 미수용한 상태입니다. 입력 설명·전문가 의견으로 찾은 기준을 대조하세요.':findings.length?'선택한 단서와 실제 의무의 적용 조건을 대조하세요. 자동 연결은 위반 확정이 아닙니다.':'구체적인 위험이 특정되지 않았습니다. 직접 고르는 기준은 일반 대조 자료입니다.'}</p>}
                <label className="si-topic-select">이 위험의 관련 기준<select aria-label="이 위험의 관련 기준" value={topic} disabled={!choices.length} onChange={e=>selectTopic(e.target.value)}>{!topic&&<option value="">자동 연결 기준 없음</option>}{choices.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
                <details className="si-topic-manual"><summary>다른 기준 직접 대조 (선택)</summary><p className="si-caption">자동 연결과 구분하여 직접 고릅니다. 위험 항목을 바꾸면 이 선택은 초기화됩니다.</p><label>직접 대조할 기준<select aria-label="직접 대조할 기준" value={overridden?topic:''} onChange={e=>e.target.value?selectTopic(e.target.value):setManual(null)}><option value="">이 위험의 자동 연결 사용</option>{LEGAL_CARDS.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label></details>
                {tab===1&&<>{card?<InspectorLegalFocus card={card} reference={topicReference} evidence={relatedEvidence}/>:<InspectorLegalResult reference={{...reference,cards:[],inspectionCases:[],recentTrends:[]}}/>}<details><summary>실제 금액이 달라지는 이유</summary><p>행위 주체·위반 의무·교육 종류·대상 인원·반복 횟수와 사건 당시 기준을 확인하세요. 형사 벌금은 법원 판단, 과태료는 부과기준에 따릅니다. 1·2·3차 금액이나 예상 합계를 계산하지 않습니다.</p></details></>}
                {tab===2&&<InspectorCaseTrends key={`${findingIndex}:${topic}`} reference={topicReference} topic={topic}/>}
            </>}
        </section>
    </div>;
}

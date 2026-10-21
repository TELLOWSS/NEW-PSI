import React,{useId,useRef,useState} from 'react';
import {legalForText,sanctionText,type LegalReference} from '../../lib/inspector/legal';
import {fieldGuide} from '../../lib/inspector/fieldGuide';
import type {VisionImport} from '../../lib/inspector/types';
import InspectorLegalResult from './InspectorLegalResult';

const priorities={immediate:'우선 통제 검토',soon:'빠른 개선 검토',routine:'관리 상태 확인'};
const panels=['핵심 조치','법령·금액','감독사례'];
export default function InspectorAnswer({analysis,reference,note}:{key?:number;analysis:VisionImport|null|undefined;reference:LegalReference;note:string}) {
    const [tab,setTab]=useState(0),[findingIndex,setFindingIndex]=useState(0),[topic,setTopic]=useState(reference.cards[0]?.id||'');
    const id=useId(),tabs=useRef<(HTMLButtonElement|null)[]>([]);
    const findings=analysis?.risk_findings||[],finding=findings[findingIndex],fact=finding?analysis?.observed_facts[Number(finding.observation_index)]:undefined;
    const card=reference.cards.find(c=>c.id===topic),guide=card?fieldGuide(card.id):undefined;
    const relatedEvidence=card?[note,...(analysis?.observed_facts.map(f=>f.text)||[])].find(text=>card.keywords.some(word=>text.toLowerCase().includes(word))):undefined;
    const cases=(reference.inspectionCases||[]).filter(c=>c.topics.includes(topic));
    const chooseFinding=(n:number)=>{setFindingIndex(n);const f=findings[n],observed=analysis?.observed_facts[Number(f.observation_index)];const related=legalForText([observed?.text,f.problem].join(' ')).cards.find(c=>reference.cards.some(r=>r.id===c.id));if(related)setTopic(related.id);};
    return <div className="si-answer">
        {findings.length>0&&<div className="si-finding-picker" aria-label="사진의 위험 검토 항목">{findings.map((f,n)=><button type="button" key={n} aria-pressed={n===findingIndex} onClick={()=>chooseFinding(n)}><span>{n+1}</span>{f.problem}</button>)}</div>}
        <div className="si-answer-tabs" role="tablist" aria-label="점검 결과 상세">{panels.map((label,n)=><button key={label} ref={el=>{tabs.current[n]=el;}} type="button" role="tab" id={`${id}-tab-${n}`} aria-selected={tab===n} aria-controls={`${id}-panel`} tabIndex={tab===n?0:-1} onClick={()=>setTab(n)} onKeyDown={e=>{let next=n;if(e.key==='ArrowRight')next=(n+1)%3;else if(e.key==='ArrowLeft')next=(n+2)%3;else if(e.key==='Home')next=0;else if(e.key==='End')next=2;else return;e.preventDefault();setTab(next);tabs.current[next]?.focus();}}>{label}{n===2&&cases.length>0&&<span>{cases.length}</span>}</button>)}</div>
        <section role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`} tabIndex={0} className="si-answer-panel">
            {tab===0&&<>
                <article className="si-problem" aria-label="핵심 답변">
                    {finding?<><p className={`si-priority si-priority-${finding.priority}`}>{priorities[finding.priority]} · AI 위험 해석</p><h3>{finding.problem}</h3><p className="si-evidence"><b>사진 근거</b> {fact?.visual_basis} · {fact?.text}</p><div className="si-risk"><b>왜 위험한가</b><p>{finding.risk}</p></div><div className="si-do-now"><b>지금 할 일</b><p>{finding.action}</p></div></>:analysis?<><h3>{analysis.risk_findings||!analysis.observed_facts.length?'이 사진으로 문제를 특정하기 어렵습니다':'사진에서 보이는 상황'}</h3><ul>{analysis.observed_facts.slice(0,analysis.risk_findings?1:3).map((f,n)=><li key={n}>{f.text}<small>{f.visual_basis}</small></li>)}</ul>{analysis.risk_findings&&<p className="si-caption">구체적인 위험 해석이 제시되지 않았습니다. 안전이 확인되었다는 뜻은 아닙니다.</p>}{!analysis.risk_findings&&analysis.ai_hypotheses.length>0&&<div className="si-risk"><b>추가 해석 · AI 추론</b><p>{analysis.ai_hypotheses[0].text}</p><small>{analysis.ai_hypotheses[0].reason}</small></div>}{analysis.recommended_controls[0]&&<div className="si-do-now"><b>우선 조치 제안</b><p>{analysis.recommended_controls[0].action}</p></div>}</>:<><p className="si-priority">입력 설명 기준 · 사진 판독 아님</p><h3>{card?.title||'상황을 조금 더 구체적으로 알려 주세요'}</h3><p>{note.length>180?`${note.slice(0,180)}…`:note}</p>{note.length>180&&<details><summary>입력 설명 전체</summary><p>{note}</p></details>}{card&&<div className="si-do-now"><b>우선 조치 참고</b><p>{card.actions[0]}</p></div>}</>}
                </article>
                {card&&<div className="si-law-preview"><b>{card.duties[0].label}</b><p>{sanctionText(card.sanctions[0])}</p><small>{card.sanctions[0].actor} · 의무 위반 성립 시 법정상한 · 실제 부과액 아님</small><button className="si-btn" type="button" onClick={()=>{setTab(1);requestAnimationFrame(()=>tabs.current[1]?.focus());}}>이 사진의 적용 조건 보기</button></div>}
                {analysis&&<details className="si-answer-more"><summary>관찰·조치 전체와 현장 확인 사항</summary><h4>사진 관찰 제안</h4><ul>{analysis.observed_facts.map((f,n)=><li key={n}>{f.text}<small>{f.visual_basis} · 판독 확신 {f.confidence==='high'?'높음':f.confidence==='medium'?'중간':'낮음'}</small></li>)}</ul><h4>조치 제안 전체</h4><ul>{analysis.recommended_controls.map((c,n)=><li key={n}>{priorities[c.priority]} · {c.action}</li>)}</ul><h4>현장 확인 · 선택</h4><ul>{analysis.requires_confirmation.map((q,n)=><li key={n}>{q.question}<small>{q.why}</small></li>)}</ul><ul>{analysis.ai_hypotheses.map((h,n)=><li key={n}>추론: {h.text}<small>{h.reason}</small></li>)}</ul><p className="si-caption">{analysis.limitations.join(' / ')}</p></details>}
                {!card&&<p className="si-caption">수록 법령 중 관련 주제를 찾지 못했습니다. 법적 의무가 없다는 뜻은 아닙니다.</p>}
            </>}
            {tab!==0&&<>
                {reference.cards.length>0&&<label className="si-topic-select">관련 주제<select value={topic} onChange={e=>setTopic(e.target.value)}>{reference.cards.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}
                {tab===1&&<>{card&&guide&&<div className="si-application"><h3>이 현장에서 대조할 판단 포인트</h3><p><b>연결 근거</b> {relatedEvidence||'AI 검색용 주제어와 연결 · 직접 관찰 근거는 별도 확인'} <small>관련 주제 연결이며 위반 확정이 아닙니다.</small></p><p><b>적용 조건</b> {guide.check}</p><p><b>조치 완료 자료</b> {guide.proof}</p></div>}<InspectorLegalResult reference={{...reference,cards:card?[card]:[],inspectionCases:[]}}/><details><summary>실제 금액이 달라지는 이유</summary><p>행위 주체·위반 의무·교육 종류·대상 인원·반복 횟수 등과 사건 당시 기준을 확인해야 합니다. 형사 벌금은 법원 판단, 과태료는 적용 부과기준에 따릅니다. 이 화면은 1·2·3차 부과액이나 예상 합계를 계산하지 않습니다.</p></details></>}
                {tab===2&&<div className="si-case-list"><h3>고용노동부 공개 감독사례</h3><p className="si-caption">선택한 주제와 관련된 감독 결과입니다. 이 현장과 같은 사건이나 확정 판결은 아닙니다. 수록 자료 원문 확인: 2026-10-21</p>{cases.length?cases.map((c,n)=><details className="si-case" key={`${topic}-${c.id}`} open={n===0}><summary>{c.title}</summary><p className="si-eyebrow">{c.agency} · {c.publishedAt}</p><p><b>적발 내용</b> {c.finding}</p><p><b>당시 조치</b> {c.response}</p><p className="si-case-lesson"><b>현장 적용 힌트</b> {c.lesson}</p><a href={c.url} target="_blank" rel="noopener noreferrer">공식 감독 결과 원문 ↗</a></details>):<p className="si-notice">이 주제에 직접 연결할 검증된 감독사례가 아직 수록되지 않았습니다. 다른 유형의 사례를 대신 제시하지 않습니다.</p>}</div>}
            </>}
        </section>
    </div>;
}

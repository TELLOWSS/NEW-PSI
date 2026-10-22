import React from 'react';
import {sanctionText,type LegalReference} from '../../lib/inspector/legal';

export default function InspectorLegalResult({reference}:{reference:LegalReference}) {
    return <section className="si-legal-result" aria-label="관련 법령 요지와 금액">
        <div className="si-section-heading"><h3>관련 법령 요지 · 벌금·과태료</h3><span className="si-caption">공식 원문 대조 {reference.reviewedAt}</span></div>
        <p className="si-caption">사진·설명에 관련된 기준입니다. 금액은 위반이 성립할 때의 법정상한이며 실제 부과액이 아닙니다. 사진별로 합산하지 않습니다.</p>
        {reference.dateStatus==='outside-reviewed-period'&&<p className="si-notice">촬영시점은 이 자료의 검토 범위 밖입니다. 아래는 {reference.reviewedAt} 검토 기준이며 사건 당시 법령·금액은 별도 대조해야 합니다.</p>}
        {!reference.cards.length&&<p>일치하는 법령 주제를 찾지 못했습니다. “개구부 덮개 없음”, “비계 발판 틈”, “법령 요지 게시”처럼 상황을 짧게 적거나 주제를 선택하세요. 기준이 없다는 뜻은 아닙니다.</p>}
        {reference.cards.map(card=><article className="si-legal-card" key={card.id}>
            <h4>{card.title}</h4>
            <div className="si-legal-actions"><b>바로 할 조치</b><ul>{card.actions.map(action=><li key={action}>{action}</li>)}</ul></div>
            {card.duties.map(duty=><div className="si-legal-duty" key={duty.label}><a href={duty.url} target="_blank" rel="noopener noreferrer">{duty.label} ↗</a><p>{duty.summary}</p></div>)}
            {card.sanctions.map((s,n)=><div className={`si-sanction si-sanction-${s.kind}`} key={n}><span>{s.kind==='criminal'?'형사벌칙':'행정 과태료'} · 대상: {s.actor}</span><strong>{sanctionText(s)}</strong><p>{s.condition}</p><a href={s.url} target="_blank" rel="noopener noreferrer">근거: {s.basis} ↗</a></div>)}
            <p className="si-caption">적용 전 확인: {card.scope}</p>
        </article>)}
        {!!reference.inspectionCases?.length&&<section className="si-report-cases"><h4>관련 고용노동부 공개 감독사례</h4><p className="si-caption">관련 주제 참고 사례이며 이 현장과 동일 사건·처분이 아닙니다. 수록 사례 원문 확인: {reference.casesReviewedAt||'2026-10-21'}</p>{reference.inspectionCases.map(c=><article key={c.id}><h4>{c.title} · {c.publishedAt}</h4><p>{c.finding}</p><p>{c.response}</p><p>현장 적용 힌트: {c.lesson}</p><a href={c.url} target="_blank" rel="noopener noreferrer">고용노동부 공식 원문 ↗</a></article>)}</section>}
        {!!reference.recentTrends?.length&&<section className="si-report-trends"><h4>작성 시점 수록 감독·재해 동향</h4><p className="si-caption">선별 공식 발표 · 원문 확인 {reference.trendsReviewedAt} · 실시간 전체 동향 아님</p>{reference.recentTrends.map(t=><article key={t.id}><h4>{t.title} · 발표 {t.publishedAt}</h4><p>{t.kind} · {t.period}</p><p>{t.summary}</p><p>현장 적용 참고: {t.fieldAction}</p><a href={t.url} target="_blank" rel="noopener noreferrer">고용노동부 공식 발표 ↗</a></article>)}</section>}
        <details className="si-legal-scope"><summary>자료 범위와 금액의 의미</summary><p>산업안전보건법 법률 제21374호 및 산업안전보건기준에 관한 규칙 고용노동부령 제450호 중 수록 조문을 검토한 자료입니다. 실시간 법령 동기화 자료가 아닙니다. 공포된 2027년 시행 법률은 현재 기준에 포함하지 않았습니다.</p><p>과태료의 1차·2차·3차 위반별 부과기준은 이 자료에 포함하지 않았습니다. 형사벌금, 행정 과태료, 사망 결과 가중, 도급인 책임은 서로 구분해야 하며 여기의 금액을 실제 청구액이나 합계로 사용할 수 없습니다. 산업안전보건법 전체 조문·판례·감독사례를 모두 수록한 자료는 아닙니다.</p></details>
    </section>;
}

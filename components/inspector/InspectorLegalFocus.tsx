import React from 'react';
import {sanctionText,type LegalCard,type LegalReference} from '../../lib/inspector/legal';
import {legalApplication} from '../../lib/inspector/legalApplication';
export default function InspectorLegalFocus({card,reference,evidence}:{card:LegalCard;reference:LegalReference;evidence?:string}){
    const lens=legalApplication(card);
    return <section className="si-legal-focus" aria-label="관련 법령 요지와 금액">
        <h3>{card.title}</h3><p className="si-caption">관련 기준 대조 · 위반 확정 아님 · 원문 대조 {card.reviewedAt||reference.reviewedAt}</p>
        <dl className="si-standard-compare"><div><dt>먼저 대조할 기준</dt><dd>{lens.standard}</dd></div></dl>
        <div className="si-compact-sanctions">{card.sanctions.map((s,n)=><div className={`si-sanction si-sanction-${s.kind}`} key={n}><span>{s.kind==='criminal'?'형사벌칙':'행정 과태료'} · {s.actor}</span><strong>{sanctionText(s)}</strong><p>{s.condition}</p><a href={s.url} target="_blank" rel="noopener noreferrer">{s.basis} ↗</a></div>)}</div>
        {card.sanctionNote&&<p className="si-notice">금액 자동 산정 안 함 · {card.sanctionNote}</p>}
        {!!card.sanctions.length&&<p className="si-caption">법정상한 · 개별 부과액 아님 · 사진별 합산 금지</p>}
        <details className="si-legal-evidence"><summary>사진 근거·현장 대조 자세히</summary><dl><div><dt>연결된 사진·설명</dt><dd>{evidence||'검색 주제어로 연결됨 · 직접 관찰 근거는 별도 확인'}</dd></div><div><dt>현장 대조</dt><dd>{lens.check}</dd></div></dl></details>
        <details className="si-proof-detail"><summary>조치·완료 확인에 쓸 자료</summary><ul>{card.actions.map(a=><li key={a}>{a}</li>)}</ul><p><b>확인 자료</b> {lens.proof}</p></details>
        <details className="si-duty-detail"><summary>조문 요지·예외와 공식 원문 ({card.duties.length}개)</summary>{card.duties.map(d=><article key={d.label}><a href={d.url} target="_blank" rel="noopener noreferrer">{d.label} ↗</a><p>{d.summary}</p></article>)}<p>{card.scope}</p></details>
        {reference.dateStatus==='outside-reviewed-period'&&<p className="si-caption">사건 당시 적용 법령은 {reference.reviewedAt} 검토 자료와 별도 대조하세요.</p>}
    </section>;
}

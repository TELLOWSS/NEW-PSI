import {casesForTopics,CASES_REVIEWED_AT,type InspectionCase} from './inspectionCases.js';
import {trendsForTopics,TRENDS_REVIEWED_AT,type SafetyTrend} from './safetyTrends.js';
import type {InspectionDocument,VisionImport} from './types.js';

/** Curated references, not an LLM answer or a live statute synchronization service. */
export const LEGAL_VERSION='kr-osh-2026-10-23-v4-context-links';
export const LEGAL_REVIEWED_AT='2026-10-20';
const source=(article:number,rules=false)=>`https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=${String(article).padStart(4,'0')}&lsiSeq=${rules?'273603':'283449'}&urlMode=lsScJoRltInfoR`;
export type LegalDuty={label:string;summary:string;url:string};
export type LegalSanction={kind:'criminal'|'administrative';actor:string;condition:string;fineMaxKRW:number;prisonYears?:number;basis:string;url:string};
export type LegalCard={id:string;title:string;keywords:string[];duties:LegalDuty[];actions:string[];scope:string;sanctions:LegalSanction[];sanctionNote?:string;reviewedAt?:string};
export type LegalReference={version:string;reviewedAt:string;dateStatus:'reference-date'|'outside-reviewed-period';cards:LegalCard[];inspectionCases?:InspectionCase[];casesReviewedAt?:string;recentTrends?:SafetyTrend[];trendsReviewedAt?:string};
const duty=(article:number,summary:string,rules=true):LegalDuty=>({label:`${rules?'산업안전보건기준에 관한 규칙':'산업안전보건법'} 제${article}조`,summary,url:source(article,rules)});
const safety:LegalSanction={kind:'criminal',actor:'사업주',condition:'법 제38조제1항~제3항의 안전조치 의무 위반이 성립하는 경우',fineMaxKRW:50_000_000,prisonYears:5,basis:'산업안전보건법 제168조제1호',url:source(168)};
const admin=(fineMaxKRW:number,basis:string,condition:string,actor='사업주'):LegalSanction=>({kind:'administrative',actor,condition,fineMaxKRW,basis:`산업안전보건법 제175조${basis}`,url:source(175)});
const hazard=(id:string,title:string,keywords:string[],duties:LegalDuty[],actions:string[],scope:string):LegalCard=>({id,title,keywords,duties,actions,scope,sanctions:[safety]});
export const LEGAL_CARDS:LegalCard[]=[
    hazard('opening','개구부·단부 추락',['개구부','단부','바닥구멍','덮개','난간 미설치','난간없','난간 없'],[duty(43,'추락 위험이 있는 작업발판 끝·통로·개구부에는 안전난간·울타리·수직형 추락방망 또는 견고하고 고정된 덮개 등 방호조치를 합니다. 덮개는 어두운 곳에서도 식별되도록 표시합니다.'),duty(13,'안전난간은 상부·중간 난간대, 발끝막이판, 기둥 등 구조·강도 기준을 충족해야 합니다. 상부 난간대 높이는 90cm 이상이며 높이에 따라 중간 난간 기준이 달라집니다.')],['접근을 통제하고 개구부 위치를 표시합니다.','현장 여건에 맞는 고정 덮개 또는 안전난간 등 방호조치를 합니다.','임시 해체 시 대체 추락방호와 안전대 부착설비를 확인합니다.'],'추락 위험의 존재, 개구부·단부 여부와 방호조치의 강도·고정 상태를 현장에서 확인합니다. 사진만으로 높이·강도를 측정하지 않습니다.'),
    {id:'rebar-puncture',title:'철근 돌출부 접촉·찔림',keywords:['철근 돌출','돌출 철근','철근 단부','철근 끝단','철근 찔림','철근 방호캡'],reviewedAt:'2026-10-23',duties:[{label:'콘크리트공사 표준안전 작업지침 제16조제3호',summary:'조립된 철근과 근로자의 접촉으로 찔림·화상 등이 우려되면 이를 예방할 조치를 하도록 정한 기술 지침입니다. 제1조에 따른 지도·권고 사항이며 개구부 추락 방호 조문과 구분합니다.',url:'https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000268994'}],actions:['돌출 철근과 작업자의 통행·작업 동선을 분리하고 접근을 통제합니다.','접촉 방향·부위에 맞는 방호캡·덮개 등 보호 방법을 선정하고 이탈·관통 가능성을 대조합니다.','설계·구조 검토 없이 철근을 임의 절단하거나 구부리지 않습니다.'],scope:'조립된 철근인지, 돌출 방향과 사람의 접촉 가능성을 확인합니다. 단순 접촉 찔림과 추락 후 철근 관통 위험을 구분하며, 방호캡이 있다는 사실만으로 추락 시 관통 방호 성능을 확정하지 않습니다.',sanctions:[],sanctionNote:'이 기술 지침만으로 벌금·과태료를 정하지 않습니다. 실제 적용 법령·의무와 위반 요건을 별도 확인해야 하며, 개구부 추락 조문의 금액을 대신 적용하지 않습니다.'},
    hazard('fall','고소작업 추락',['고소작업','고소 작업','추락','지붕 작업','사다리'],[duty(42,'추락·넘어짐 위험 장소에서는 비계 등 작업발판을 설치합니다. 설치가 곤란하면 추락방호망, 그마저 곤란하면 안전대 착용 등 필요한 조치를 합니다. 작업발판 끝·개구부는 제43조의 대상입니다.')],['안전한 작업발판과 이동 통로를 먼저 확보합니다.','발판 설치가 곤란한 사유와 추락방호망·안전대 등 대체조치를 확인합니다.'],'작업 위치와 추락 위험을 확인합니다. 개구부·단부에는 제43조를 우선 대조합니다.'),
    hazard('scaffold','비계·작업발판',['비계','발판','이동식비계'],[duty(56,'높이 2m 이상인 비계(달비계·달대비계·말비계 제외)의 작업발판은 하중을 견디는 재료를 사용하고, 폭 40cm 이상·발판재료 사이 틈 3cm 이하 등 기준을 충족해야 합니다. 조문상 예외가 있습니다.')],['발판의 고정·손상·지지 상태를 확인합니다.','발판재 사이 틈과 폭을 실측하고 개구부·가장자리를 방호합니다.'],'비계 종류·높이와 조문상 예외를 먼저 확인합니다. 3cm 기준은 발판재료 사이 틈에 대한 기준입니다.'),
    hazard('falling-object','낙하·비래 위험',['낙하','비래','낙하물','상하 동시','상하동시'],[duty(14,'물체가 떨어지거나 날아올 위험에는 낙하물 방지망·수직보호망·방호선반·출입금지구역 설정·보호구 착용 등 필요한 조치를 합니다.')],['하부 출입을 통제하고 상하 동시작업을 조정합니다.','자재를 고정하고 현장에 맞는 낙하물 방호시설을 확인합니다.'],'낙하 경로·하부 작업자·방호시설의 실제 상태를 확인합니다.'),
    hazard('electric','감전·충전부 접촉',['감전','충전부','전선','전기','분전반'],[duty(301,'접촉·접근으로 감전 위험이 있는 충전부에는 폐쇄형 외함, 방호망·절연덮개 또는 충분한 절연 등 방호조치를 합니다.')],['접근을 통제하고 자격을 갖춘 담당자에게 전원 차단·안전 확인을 요청합니다.','충전부 노출·절연 손상과 방호설비 상태를 확인합니다.'],'실제 통전 여부와 전압은 사진으로 확정할 수 없습니다. 이 조문을 누전차단기 설치 조문으로 표시하지 않습니다.'),
    hazard('formwork','동바리·거푸집 붕괴',['동바리','거푸집','써포트','서포트'],[duty(332,'동바리 조립 시 지반 침하 방지, 상·하부 고정과 미끄럼 방지, 상하층 수직 정렬 및 개구부 상부 지지 등 필요한 조치를 합니다.')],['변형·침하·이탈 우려 구역의 출입과 작업을 통제합니다.','설계·조립 기준에 따라 받침과 고정 상태를 책임자가 대조합니다.'],'구조 안전성·설계 하중·부재 간격은 사진만으로 판정하지 않습니다.'),
    hazard('excavation','굴착·토사 붕괴',['굴착','흙막이','토사','굴착면'],[duty(338,'굴착 전 균열·함수·용수·동결 변화 등 작업 장소와 주변 지반 상태를 조사합니다.'),duty(340,'토사 붕괴·낙하로 위험이 예상되면 흙막이 지보공·방호망·출입금지 등 필요한 조치를 합니다.')],['붕괴 우려 구간의 접근과 굴착 작업을 통제합니다.','지반·용수·흙막이 상태를 확인하고 필요한 방호조치를 정합니다.'],'굴착 깊이·지반 종류·흙막이 설계와 실제 균열·용수를 현장 확인합니다.'),
    hazard('fire','용접·화재 위험작업',['용접','용단','불티','화재','화기'],[duty(241,'화재 위험작업 전 가연물·위험물과 주변 상황을 확인하고 불꽃·불티 비산 방지 등 예방조치를 합니다. 용접방화포를 비산 방지에 사용하는 경우 성능 기준도 확인합니다.')],['주변 가연물을 제거·격리하고 불티 비산 방호를 확보합니다.','작업 조건에 맞는 화재 예방조치와 소화설비 상태를 확인합니다.'],'가연물·위험물, 밀폐·환기 상태, 화재감시 대상 여부 등 실제 작업 조건을 확인합니다.'),
    hazard('housekeeping','통로·전도 위험',['전도','미끄','걸림','정리정돈','적치','통로'],[duty(3,'작업장 바닥을 넘어지거나 미끄러질 위험이 없도록 안전하고 청결하게 유지하고, 넘어질 우려가 있는 자재 등은 지지하는 등 필요한 조치를 합니다.')],['통행을 방해하는 자재·전선과 바닥 오염을 정리합니다.','불안정한 적치물을 고정하고 안전한 통로를 확보합니다.'],'바닥·통로 상태와 적치물의 전도 가능성을 확인합니다.'),
    {id:'ppe',title:'안전모·안전대 등 보호구',keywords:['보호구','안전모','안전대','안전벨트','보안경'],duties:[duty(32,'사업주는 작업 위험에 맞는 보호구를 작업 근로자 수 이상 지급하고 착용하도록 해야 합니다. 추락 위험의 높이·깊이 2m 이상 장소는 안전대 지급 대상 등에 해당합니다.'),duty(40,'근로자는 사업주가 실시한 법정 안전·보건조치 사항을 준수해야 합니다.',false)],actions:['위험에 맞는 보호구 지급·착용·부착 상태를 확인합니다.','보호구만으로 대신할 수 없는 안전난간·발판 등 방호조치도 확인합니다.'],scope:'사업주의 지급·착용조치 의무와 근로자의 준수 의무를 구분합니다. 사진에 보호구가 보이지 않는다는 이유만으로 미지급을 확정하지 않습니다.',sanctions:[safety,admin(3_000_000,'제6항제3호','근로자에게 적용되는 법 제40조 준수 의무 위반이 성립하는 경우','근로자')]},
    {id:'posting',title:'산업안전보건법령 요지 게시',keywords:['법령요지','법령 요지','법령 게시','법령게시','안전보건관리규정'],duties:[duty(34,'사업주는 산업안전보건법·명령의 요지와 안전보건관리규정을 근로자가 쉽게 볼 수 있는 곳에 게시하거나 갖추어 두고 알려야 합니다.',false)],actions:['근로자가 쉽게 볼 수 있는 장소에 현행 법령 요지와 해당 관리규정을 비치·게시합니다.','현장 적용 내용과 개정 여부, 근로자의 접근 가능 여부를 확인합니다.'],scope:'게시·비치 상태와 사업장에 적용되는 관리규정을 확인합니다. 이 화면의 일부 조문 카드만으로 사업장 전체 법령 요지 게시가 완료되는 것은 아닙니다.',sanctions:[admin(5_000_000,'제5항제3호','법 제34조 게시·비치·알림 의무 위반이 성립하는 경우')]},
    {id:'education',title:'안전보건교육',keywords:['안전보건교육','정기교육','채용교육','특별교육','작업내용변경','작업내용 변경'],duties:[duty(29,'사업주는 정기교육, 채용·작업내용 변경 시 교육, 유해·위험작업 특별교육을 실시해야 합니다. 건설 일용근로자 등 조문상 예외와 교육 종류를 구분합니다.',false)],actions:['대상 작업·근로자에 맞는 교육 종류와 실시 기록을 확인합니다.','미실시 교육은 작업 조건과 법정 기준에 맞게 보완합니다.'],scope:'교육 종류·대상·면제 여부·이수 상태를 확인합니다. 사진만으로 교육 미실시를 판단할 수 없습니다.',sanctions:[admin(5_000_000,'제5항제1호','법 제29조제1항·제2항 교육 의무 위반이 성립하는 경우'),admin(30_000_000,'제2항제1호','법 제29조제3항 유해·위험작업 특별교육 의무 위반이 성립하는 경우')]},
    {id:'signs',title:'안전보건표지',keywords:['안전보건표지','안전표지','경고표지','경고 표지','출입금지표지'],duties:[duty(37,'유해·위험 장소·시설·물질의 경고와 비상조치 지시 등을 쉽게 알아볼 수 있는 안전보건표지로 설치·부착합니다. 법정 외국인근로자의 모국어 표기 기준도 확인합니다.',false)],actions:['위험 구역에서 표지가 잘 보이고 의미를 알 수 있는지 확인합니다.','누락·훼손 표지와 필요한 언어 표기를 보완합니다.'],scope:'대상 위험·시설·근로자와 표지의 종류·설치 의무를 대조합니다.',sanctions:[admin(5_000_000,'제5항제1호','법 제37조제1항 안전보건표지 의무 위반이 성립하는 경우')]},
    {id:'msds',title:'MSDS·화학물질 경고표시',keywords:['msds','물질안전보건자료','화학물질','용기표시','용기 표시'],duties:[duty(114,'대상 물질을 취급하는 사업장은 근로자가 쉽게 볼 수 있는 곳에 MSDS를 게시·비치하고, 공정별 관리요령 게시와 근로자 교육을 실시합니다.',false),duty(115,'대상 물질의 용기·포장에는 공급자 및 취급 사업주의 경고표시 의무가 적용됩니다. 조문상 예외를 확인합니다.',false)],actions:['취급 물질의 MSDS와 실제 용기 경고표시를 대조합니다.','근로자가 자료를 볼 수 있도록 하고 필요한 취급 교육을 보완합니다.'],scope:'MSDS 대상 물질 여부, 공급·취급 주체와 표시 예외를 구분합니다.',sanctions:[admin(5_000_000,'제5항제3호','법 제114조제1항 MSDS 게시·비치 의무 위반이 성립하는 경우'),admin(3_000_000,'제6항제10호','법 제114조제3항 교육 의무 위반이 성립하는 경우'),admin(3_000_000,'제6항제11호','법 제115조제1항·제2항 경고표시 의무 위반이 성립하는 경우')]},
];
export function sanctionText(s:LegalSanction) {
    const amount=`${new Intl.NumberFormat('ko-KR').format(s.fineMaxKRW/10000)}만원`;
    return s.kind==='criminal'?`${s.prisonYears}년 이하 징역 또는 ${amount} 이하 벌금`:`${amount} 이하 과태료 (법정상한)`;
}
/** A material's end is not necessarily a floor edge; an electrical cover is not a hole cover. */
function keywordScore(card:LegalCard,text:string){
    const compact=text.toLowerCase().replace(/\s+/g,'');
    if(card.id==='rebar-puncture')return /(?:철근(?:의|이)?(?:돌출|노출|단부|끝단|끝부분|상단부|하단부|방호캡|보호캡)|(?:돌출|노출)(?:된)?(?:수평|수직)?철근|철근.{0,12}(?:찔|관통)|(?:찔|관통).{0,12}철근)/.test(compact)?20:0;
    const edgeText=compact.replace(/(?:철근|전선|배관|파이프|호스|철선|강선|철물|부재|패널|자재)(?:의)?(?:상|하)?(?:단부|끝단)|상단부|하단부/g,'');
    return card.keywords.reduce((sum,word)=>{
        if(card.id==='opening'&&word==='단부')return sum+(edgeText.includes('단부')?2:0);
        if(card.id==='opening'&&word==='덮개'&&!/(개구부|구멍|추락|바닥|슬래브|슬라브)/.test(compact))return sum;
        return sum+(compact.includes(word.replace(/\s+/g,''))?Math.min(word.length,12):0);
    },0);
}
export function legalForTopics(ids:string[],eventAt?:string):LegalReference {
    const date=eventAt?new Date(eventAt):null;
    const day=date&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):LEGAL_REVIEWED_AT;
    const cards=ids.flatMap(id=>{const card=LEGAL_CARDS.find(c=>c.id===id);return card?[structuredClone(card)]:[];}).filter((card,index,all)=>all.findIndex(c=>c.id===card.id)===index);
    return {version:LEGAL_VERSION,reviewedAt:LEGAL_REVIEWED_AT,dateStatus:day>LEGAL_REVIEWED_AT||day<'2026-08-01'?'outside-reviewed-period':'reference-date',cards,inspectionCases:casesForTopics(cards.map(c=>c.id)),casesReviewedAt:CASES_REVIEWED_AT,recentTrends:trendsForTopics(cards.map(c=>c.id)),trendsReviewedAt:TRENDS_REVIEWED_AT};
}
export function legalForText(text:string,eventAt?:string):LegalReference {
    const matches=LEGAL_CARDS.map((card,index)=>({card,index,score:keywordScore(card,text)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index);
    return legalForTopics(matches.map(x=>x.card.id),eventAt);
}
/** Classification candidates, not legal conclusions. The problem precedes its mechanism and its linked fact. */
export function legalForFinding(analysis:VisionImport,index:number,eventAt?:string):LegalReference {
    const finding=analysis.risk_findings?.[index],fact=finding&&analysis.observed_facts[Number(finding.observation_index)];
    if(!finding||!fact)return legalForTopics([],eventAt);
    for(const text of [finding.problem,finding.risk]){const reference=legalForText(text,eventAt);if(reference.cards.length)return reference;}
    // Neutral background objects cannot fill an unsupported hazard with an unrelated law.
    return /(손상|불량|미설치|미체결|누락|노출|돌출|이탈|걸림|없음|벌어)/.test(fact.text)?legalForText(fact.text,eventAt):legalForTopics([],eventAt);
}
export function legalForPhoto(analysis:VisionImport|null|undefined,note:string,eventAt?:string):LegalReference {
    if(analysis?.risk_findings)return legalForTopics(analysis.risk_findings.flatMap((_,index)=>legalForFinding(analysis,index,eventAt).cards.map(c=>c.id)),eventAt);
    return legalForText([note,...(analysis?.observed_facts.map(f=>f.text)||[]),...(analysis?.law_candidate_keywords||[])].join('\n'),eventAt);
}
export function legalForInspection(doc:InspectionDocument,photoIds=doc.photoIds):LegalReference {
    const references=[legalForText([doc.workType,doc.notes].join(' '),doc.eventAt),...photoIds.map(id=>doc.reviews[id]?.decision==='rejected'?legalForText([doc.photoNotes?.[id]||'',doc.reviews[id].note].join(' '),doc.eventAt):legalForPhoto(doc.analyses[id],doc.photoNotes?.[id]||'',doc.eventAt))];
    // Frozen reports retain their saved legalReference. New references never treat controls/hypotheses as facts.
    return legalForTopics(references.flatMap(r=>r.cards.map(c=>c.id)),doc.eventAt);
}

/** Selected official releases. Publication dates and plans are not current case outcomes. */
export const TRENDS_REVIEWED_AT='2026-10-22';
export type SafetyTrend={id:string;kind:'감독 방침'|'잠정 통계·점검 예고';title:string;publishedAt:string;period:string;topics:string[];summary:string;fieldAction:string;url:string};
export const SAFETY_TRENDS:SafetyTrend[]=[
 {id:'moel-20117',kind:'잠정 통계·점검 예고',title:'3분기 누적 사망사고와 11월 화재·폭발 집중점검 예고',publishedAt:'2026-10-20',period:'2026년 1~9월 누적 · 잠정',topics:['opening','fall','scaffold','fire','falling-object','electric','msds'],summary:'재해조사 대상 사고사망자는 366명(342건), 건설업은 150명(148건)으로 발표했습니다. 전년 동기보다 떨어짐은 감소했으나 화재·폭발 등은 증가했습니다. 고위험·반복사고 사업장 감독 유지와 11월 화재·폭발 위험요인 집중점검을 예고했습니다.',fieldAction:'추락 방호를 계속 유지하고, 화기작업·가연물·설비별 화재·폭발 대책을 작업 전에 대조하세요. 점검 예고는 이미 실시한 감독 결과가 아닙니다.',url:'https://www.moel.go.kr/news/enews/report/enewsView.do?news_seq=20117'},
 {id:'moel-18880',kind:'감독 방침',title:'2026년 감독계획: 위험성평가 이행·개선 확인까지 반복감독',publishedAt:'2026-01-22',period:'2026년 연간 계획 · 발표 당시',topics:[],summary:'산업안전 감독 5만개소 계획, 모든 점검·감독에서 위험성평가 실시 여부 확인, 위험이 지속될 가능성이 높은 사업장의 개선 확인까지 반복감독 방침을 발표했습니다. 소규모 사업장에는 지원·계도 후 집중 점검을 연계하는 방침도 구분했습니다.',fieldAction:'평가표 작성에 그치지 않고 현장 조치 전후·이행 담당·재점검 근거를 연결하세요. 과거 감독 수검을 안전조치 면제 근거로 삼지 마세요.',url:'https://www.moel.go.kr/news/enews/report/enewsView.do?news_seq=18880'}
];
export function trendsForTopics(ids:string[]){return structuredClone(SAFETY_TRENDS.filter(t=>!t.topics.length||t.topics.some(id=>ids.includes(id))));}

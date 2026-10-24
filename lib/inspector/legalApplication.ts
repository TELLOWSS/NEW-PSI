import type {LegalCard} from './legal.js';
import {fieldGuide} from './fieldGuide.js';
/** Concise application lenses derived from the dated duties; never machine measurements. */
const standards:Record<string,string>={
 'rebar-puncture':'콘크리트공사 표준안전 작업지침 제16조제3호: 조립된 철근 접촉에 따른 찔림·화상 등의 위험 방지. 지도·권고 기술 지침이며 개구부·단부 추락 기준과 구분.',
 opening:'추락 위험 개구부·발판 끝은 고정 덮개·안전난간 등으로 방호. 난간 상부 높이 90cm 이상, 중간 난간 등 구조 조건은 제13조 대조.',
 fall:'발판 확보가 우선. 설치 곤란 시 추락방호망, 그마저 곤란 시 안전대 등 필요한 대체조치. 가장자리·개구부는 제43조 별도 대조.',
 scaffold:'제56조 대상 비계·높이 2m 이상: 발판 폭 40cm 이상, 발판재료 사이 틈 3cm 이하 및 고정·강도. 비계 종류별 제외·조문 예외 먼저 확인.',
 'falling-object':'낙하·비래 경로에 근로자 위험이 있으면 방지망·방호선반·출입금지 등 필요한 조치. 상부 물체와 하부 노출 구역을 함께 대조.',
 electric:'접근·접촉 가능한 충전부는 외함·방호망·절연덮개 또는 충분한 절연 등으로 방호. 통전·절연 상태는 사진으로 확정 불가.',
 formwork:'지반 침하 방지, 상·하부 고정·미끄럼 방지와 상하층 수직 정렬 등 조립 조건 대조. 사진으로 설계하중·구조 안전성 확정 불가.',
 excavation:'굴착 전 지반 상태 조사. 붕괴·낙하 위험 예상 시 흙막이·방호망·출입금지 등 필요한 조치. 깊이·토질·용수·설계는 현장 자료로 확인.',
 fire:'화재위험작업 전 가연물·위험물 및 주변 확인, 불티 비산 방지 등 예방조치. 화재감시 대상·환기·방화포 성능은 작업 조건별 대조.',
 housekeeping:'바닥·통로의 걸림·미끄럼 위험 제거, 쓰러질 우려 자재 지지 등. 실제 통행 구간과 불안정한 적치 상태를 구분.',
 ppe:'작업 위험별 보호구 지급·착용 조치와 근로자 준수 의무를 구분. 추락 위험 높이·깊이 2m 이상 장소의 안전대 대상 등 조건 대조.',
 posting:'근로자가 쉽게 볼 수 있는 곳에 법령·명령 요지와 안전보건관리규정을 게시·비치하고 알림. 이 앱의 일부 조문만으로 전체 게시 의무 충족 아님.',
 education:'정기·채용·작업내용 변경·특별교육의 대상과 예외를 각각 대조. 교육 종류·대상·이수 자료 없이 사진만으로 미실시 확정 불가.',
 signs:'대상 위험·시설에 맞는 표지 종류·위치와 필요한 모국어 표기를 대조. 일반 안내문과 법정 안전보건표지를 구분.',
 dust:'실제 분진이 심하게 흩날리는 작업인지 확인한 뒤 물질·작업 조건에 맞는 비산 방지 조치를 대조. 포대 존재와 MSDS 미비치는 별개.',
 msds:'대상 물질·공급/취급 주체를 확인한 뒤 MSDS 게시·비치, 공정 요령, 교육, 용기 경고표시 의무를 각각 대조.'
};
export function legalApplication(card:LegalCard){const guide=fieldGuide(card.id);return {standard:standards[card.id]||card.duties[0]?.summary,check:guide?.check||card.scope,proof:guide?.proof||'해당 기준과 실제 상태를 대조한 기록'};}

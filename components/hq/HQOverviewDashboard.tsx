import React from 'react';
import {summarizeHqOverview,type HqOverviewInput,type HqZone} from './hqOverviewModel';
import './HQOverviewDashboard.css';

export type HqDestination = 'process'|'visit'|'cases'|'training'|'investigation'|'actions';
interface Props extends HqOverviewInput {
  asOf:string;
  onNavigate:(destination:HqDestination)=>void;
  onSelectZone:(zone:HqZone)=>void;
  onSelectProcessGroup:(name:string)=>void;
}

export default function HQOverviewDashboard({
  processes,cases,visits,actions,reviews,asOf,onNavigate,onSelectZone,onSelectProcessGroup
}:Props):React.ReactElement {
  const data=summarizeHqOverview({processes,cases,visits,actions,reviews},asOf);
  const maxZoneCount=Math.max(1,...data.zones.map(x=>x.cases));
  const totalWork=data.totalVisits+data.incidentCases+data.linkedActionCount;
  const actionsFor=(type:HqDestination)=>onNavigate(type);
  return <div className="hq-executive" aria-label="본사 통합관제 세션 대시보드">
    <div className="hq-executive-header">
      <div>
        <span className="hq-eyebrow">HQ-SAFE / EXECUTIVE OBSERVATORY</span>
        <h4>본사 안전관리 통합 현황</h4>
        <p>현장 방문·사고조사·개선조치 상태를 한 화면에서 검토합니다.</p>
      </div>
      <div className="hq-executive-scope"><b>현재 브라우저 세션</b><small>집계 기준 {asOf}</small><span>전체 현장 데이터 미연동</span></div>
    </div>
    <div className="hq-executive-kpis">
      {([
        {label:'방문 계획',value:data.scheduledVisits,unit:'건',note:'현장 행선지 등록',page:'visit',emphasis:false},
        {label:'사고조사 대상',value:data.incidentCases,unit:'건',note:'비식별 임시 사고사례',page:'cases',emphasis:false},
        {label:'조사 검토 요청',value:data.reviewRequests,unit:'건',note:'승인 아닌 요청 표시',page:'investigation',emphasis:false},
        {label:'미확정 개선조치',value:data.linkedActionCount,unit:'건',note:'검증 완료 상태 없음',page:'actions',emphasis:false},
        {label:'조치기한 경과',value:data.overdueOpenActions,unit:'건',note:'조치 완료로 간주하지 않음',page:'actions',emphasis:true}
      ] as const).map(item=><button type="button" key={item.label} className={'hq-executive-kpi'+(item.emphasis?' attention':'')} onClick={()=>actionsFor(item.page)}>
        <span>{item.label}</span><strong>{item.value}<small>{item.unit}</small></strong><em>{item.note}</em>
      </button>)}
    </div>
    {totalWork===0&&<p className="hq-executive-empty">등록된 시연 기록이 없습니다. 표시된 0은 **현재 세션의 입력건수**이며 실제 현장 사고 0건이나 안전 확보를 의미하지 않습니다. 아래 공정도를 선택하거나 방문·사고사례를 임시 등록해 화면 흐름을 확인하세요.</p>}
    <div className="hq-executive-columns">
      <section className="hq-executive-panel" aria-label="공사구간별 사고 건수">
        <div className="hq-executive-panel-title"><div><span className="hq-eyebrow">STRUCTURAL ZONES</span><h5>공사구간별 사고 분포</h5></div><small>세션 등록건 기준</small></div>
        <div className="hq-elevation">
          {data.zones.slice().reverse().map(item=><button type="button" className={'hq-elevation-band '+(item.zone==='지하'?'underground':item.zone==='기초'?'foundation':'aboveground')} key={item.zone}
            onClick={()=>onSelectZone(item.zone)} aria-label={item.zone+' 구간 공정 확인'}>
            <span className="hq-elevation-zone">{item.zone}</span><span className="hq-elevation-bar"><i style={{width:((item.cases/maxZoneCount)*100)+'%'}}/></span>
            <strong>{item.cases}<small>건</small></strong>
            <span className="hq-elevation-available">관리 공정 {item.processes}개</span>
          </button>)}
        </div>
        <p className="hq-executive-annotation">※ 공사구간과 공정분류는 별개입니다. 지하층 일반 형틀과 지상 AL폼을 독립적으로 검색할 수 있습니다.</p>
      </section>
      <section className="hq-executive-panel" aria-label="공정별 분류 현황">
        <div className="hq-executive-panel-title"><div><span className="hq-eyebrow">TRADE INTELLIGENCE</span><h5>골조·형틀 공정군</h5></div><small>공정 분류 기준정보</small></div>
        <div className="hq-trade-list">
          {data.processGroups.map(group=><button type="button" className="hq-trade-row" key={group.name} onClick={()=>onSelectProcessGroup(group.name)}>
            <span><strong>{group.name}</strong><small>{group.availableProcesses}개 관리 공정</small></span>
            <span className="hq-trade-count">{group.cases}<small>사고 등록건</small></span>
          </button>)}
        </div>
        <p className="hq-executive-annotation">※ 등록건수는 작업자수·근로시간을 반영한 사고율이 아닙니다. 공정 위험도 순위로 해석하지 마세요.</p>
      </section>
    </div>
    <div className="hq-executive-bottom">
      <div><strong>본사 중점 확인</strong><span>사고사례 {data.incidentCases}건 · 검토 요청 전 {data.casesAwaitingReview}건 · 재점검 요청 표시 {data.reinspectionRequests}건</span></div>
      <button type="button" onClick={()=>actionsFor('investigation')}>사고조사 검토</button>
      <button type="button" onClick={()=>actionsFor('actions')}>개선조치 관리</button>
      <button type="button" onClick={()=>actionsFor('training')}>안전교육 준비</button>
    </div>
    {data.unlinkedActionIds.length>0&&<p role="alert" className="hq-executive-warning">연결된 사고사례가 없는 조치기록 {data.unlinkedActionIds.length}건은 통계에서 제외했습니다. 데이터 참조를 점검하세요.</p>}
    <p className="hq-executive-legal">본 대시보드는 합성·비식별 시연용입니다. 실제 현장별 사용자 접근권한, 산재 통계, AI 분석, 조치 완료 및 경영진 공식 보고 정보와 연결되어 있지 않습니다.</p>
  </div>;
}

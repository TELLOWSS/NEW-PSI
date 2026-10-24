import React from 'react';

/** Guidance only: this component does not save, analyze or approve anything. */
export type InspectorNoviceStep=0|1|2|3;
const labels=['사진 선택','위험 확인','현장 검토','조치·보고'] as const;
const descriptions=[
  '사진을 찍거나 선택하면 시작할 수 있습니다. 위험 이름은 몰라도 됩니다.',
  '선택한 사진을 확인하고, 선택적으로 상황을 적어 주세요.',
  '사진에서 보인 내용과 현장 상황을 비교한 뒤 의견을 저장하세요.',
  '저장된 검토를 바탕으로 조치를 요청하거나 검토용 보고서를 만드세요.',
] as const;
export default function InspectorNoviceSteps({step}:{step:InspectorNoviceStep}){
 return <nav className="si-novice-steps" aria-label="사진점검 네 단계">
  <ol>{labels.map((label,index)=><li key={label} className={index===step?'is-current':index<step?'is-past':''} aria-current={index===step?'step':undefined}><span aria-hidden="true">{index<step?'✓':index+1}</span><b>{label}</b></li>)}</ol>
  <p role="status">{descriptions[step]}</p>
 </nav>;
}

/** Practical prompts, not a finding of violation or a substitute for statutory conditions. */
const guides:Record<string,{check:string;proof:string}>={
 opening:{check:'사람이 접근하는 가장자리인가? 덮개·난간이 움직이거나 해체되어 있지 않은가?',proof:'방호 전경과 덮개 고정·난간 연결 상태를 가까이 촬영'},
 fall:{check:'작업발판으로 작업할 수 있는가? 설치 곤란 시 대체 추락방호가 실제 사용 가능한가?',proof:'작업 위치·이동 경로·추락방호를 함께 촬영'},
 scaffold:{check:'비계 종류·높이 확인 후 발판 폭·발판재 사이 틈을 실측하고 고정을 대조',proof:'발판 고정과 실측값, 비계 연결 상태 기록'},
 'falling-object':{check:'물체가 떨어지는 경로에 사람이 있는가? 하부 통제와 자재 고정이 가능한가?',proof:'상부 자재 고정과 하부 통제 구역을 촬영'},
 electric:{check:'통전·절연 상태를 담당자가 확인했는가? 접근 가능한 충전부가 노출되어 있는가?',proof:'전기 담당자의 안전 확인 기록과 방호 완료 사진'},
 formwork:{check:'설계·조립도와 받침·연결·고정·수직 정렬이 일치하는가?',proof:'책임자의 도면 대조 기록과 받침·연결부 사진'},
 excavation:{check:'균열·용수·토질과 흙막이 상태를 조사했는가? 붕괴 우려 구간에 접근하는가?',proof:'사면·흙막이·배수 전경과 지반 조사 기록'},
 fire:{check:'불티가 가연물에 도달하는가? 가림·격리·소화 준비와 화재감시 대상 여부 확인',proof:'화기 작업 위치와 가연물 격리·불티 차단 상태 촬영'},
 housekeeping:{check:'실제 통행 구간인가? 걸림·미끄럼 또는 자재가 쓰러질 가능성이 있는가?',proof:'정리 전후 같은 통로와 적치물 고정 상태 촬영'},
 ppe:{check:'위험에 맞는 지급·착용·부착 상태인가? 사업주 조치와 근로자 준수 의무를 구분',proof:'지급 기록과 작업 중 올바른 착용·부착 상태 확인'},
 posting:{check:'근로자가 쉽게 읽을 수 있는 위치인가? 현장 적용 법령과 관리규정이 최신인가?',proof:'게시 위치·내용·개정일을 확인할 수 있는 사진'},
 education:{check:'정기·채용·변경·특별교육 중 무엇인가? 대상·시간·면제와 이수 기록 확인',proof:'교육 종류·대상·일자·실시 내용을 기록으로 대조'},
 signs:{check:'위험 위치에서 표지를 볼 수 있는가? 뜻과 필요한 언어를 알아볼 수 있는가?',proof:'작업자 시야에서 본 표지의 위치와 내용 촬영'},
 msds:{check:'대상 물질인가? MSDS 접근·공정 요령·교육과 용기 경고표시를 각각 확인',proof:'제품명과 일치하는 MSDS·용기표시·교육 기록 대조'}
};
export const fieldGuide=(id:string)=>guides[id];

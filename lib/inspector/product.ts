export type ProductScope = 'pilot' | 'site' | 'organization';
export const PRODUCT_SCOPES: {id:ProductScope;name:string;description:string}[] = [
    {id:'pilot',name:'소규모 현장 체험',description:'담당자 한 명이 실제 작업 흐름과 결과를 검토'},
    {id:'site',name:'현장 전용 도입',description:'전용 설치와 운영 기준을 협의하는 도입안'},
    {id:'organization',name:'여러 현장 확장',description:'기업별 권한·협업을 포함한 추가 구축 협의'},
];
export type ProductConfiguration = {scope:ProductScope;photosPerDay:number;workDays:number;estimatedKB:number};
export function photoBudget(config:ProductConfiguration) {
    const count=config.photosPerDay*config.workDays;
    return {count,mb:count*config.estimatedKB/1024};
}
/** A review document, not an order, price quotation, or promised free quota. */
export function productProposal(config:ProductConfiguration) {
    const {count,mb}=photoBudget(config);
    const scope=PRODUCT_SCOPES.find(s=>s.id===config.scope)!;
    return [
        '# NEW-PSI 사진점검 · 현장 도입 검토안',
        '',`도입 범위: ${scope.name}`,scope.description,
        '', '## 도입 목적',
        '사진·짧은 설명 → 위험·조치·관련 법령 검토 → 전문가 확인 → 개선 전후 증빙 → 검토용 보고서',
        '', '## 현재 제공 기능',
        '- 촬영·파일·PC 이미지 붙여넣기, 기기 내 JPEG 최적화, 원본 파일 불변',
        '- 명시적 AI 실행과 ON/OFF, 전문가 해석 수정·수용 거절',
        '- 날짜 고정 공식 법령 요지·조건부 법정상한·공개 감독사례 참고',
        '- 조치 담당·기한, 개선사진·현장 재점검, 검토용 보고서·기기 공유',
        '- 비공개 보관, 관리 대상 파일·업무기록의 삭제 후 잔여량 검증',
        '', '## 사진 용량 가정',
        `하루 ${config.photosPerDay}장 × ${config.workDays}일 = ${count}장`,
        `점검용 사본을 장당 ${config.estimatedKB}KB로 가정: 약 ${mb.toFixed(1)}MB`,
        'AI 비용·데이터베이스·보고서·전송량·백업은 제외. 실제 사본 크기는 사진마다 다름.',
        '점검당 사진 상한은 현재 20장. 여러 점검의 합산이며 무료 제공량·실제 사용량이 아님.',
        '', '## 계약 전 협의할 사항',
        '- 설치·교육·운영 지원의 담당자, 범위, 가격, 보관기간',
        '- 현장 자료를 이용한 전문가 검수와 법령의 사건 당시 적용성',
        '- AI 공급자별 요금, Storage·DB·전송량 한도와 삭제 정책',
        ...(config.scope==='organization'?['- 기업·현장별 계정과 권한 분리, 협력사 수락·전자서명은 추가 구축 필요']:[]),
        '- 현재 전용 관리자 방식. 자동 결제·기업별 권한 분리·실시간 법령 동기화·최종 법적 판정은 제공하지 않음',
        '', '검토용 구성안이며 견적·주문·상담 접수·계약이 아닙니다.',
    ].join('\n');
}

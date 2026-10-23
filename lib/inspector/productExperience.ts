import type {Inspection} from './types.js';
import {newInspectionDocument} from './types.js';
export const PRODUCT_EXAMPLES=[
 {id:'rebar',name:'철근 돌출부',hint:'이동 통로 옆 철근. 보호캡의 형식·고정 상태는 현장 확인 전입니다.',problem:'통행 구간으로 돌출된 철근',risk:'이동 중 접촉해 찔리거나 넘어질 가능성',action:'접근 동선을 분리하고 철근 끝의 방호캡·덮개 등 보호 조치를 현장에서 확인하세요.',proof:'철근 돌출 위치와 통행 경로가 겹치는 장면을 표현한 도해입니다.',keyword:'철근 단부 돌출로 통행 중 찔림 위험'},
 {id:'opening',name:'바닥 개구부',hint:'3층 통로 옆 개구부. 임시 덮개를 해체한 상황을 가정합니다.',problem:'개구부 주변의 추락 방호 확인',risk:'통행 중 개구부로 떨어질 가능성',action:'접근을 통제하고 현장 조건에 맞는 고정 덮개·안전난간 등 방호를 확인하세요.',proof:'바닥 개구부와 인접 통로를 표현한 도해입니다. 높이·고정 상태는 판독하지 않습니다.',keyword:'개구부'},
 {id:'scaffold',name:'비계·작업발판',hint:'외부 비계 작업발판. 재료를 옮기는 중인 상황을 가정합니다.',problem:'발판의 고정·틈·가장자리 방호 확인',risk:'발판 이탈 또는 가장자리에서 추락할 가능성',action:'접근을 통제하고 비계 종류·높이와 발판 고정·폭·틈을 현장에서 실측하세요.',proof:'작업발판과 가장자리 방호를 표현한 도해입니다. 간격·강도는 측정한 값이 아닙니다.',keyword:'비계'},
 {id:'electric',name:'임시 전선',hint:'통로를 가로지른 임시 전선. 통전 여부는 확인 전입니다.',problem:'전선 손상·접촉 위험 확인',risk:'충전부가 노출되어 있다면 감전될 가능성',action:'접근을 통제하고 자격을 갖춘 담당자에게 전원 차단·절연 상태 확인을 요청하세요.',proof:'통로의 전선과 손상 의심 구간을 표현한 도해입니다. 통전 여부는 확인할 수 없습니다.',keyword:'전선'},
] as const;
export function productSampleInspection(title:string,owner:string,dueDate:string,note:string):Inspection {
 const document=newInspectionDocument();
 return {id:'00000000-0000-4000-8000-000000000001',revision:1,created_at:'2026-10-23T00:00:00Z',updated_at:'2026-10-23T00:00:00Z',document:{...document,title:'체험용 샘플 · '+title,eventAt:'2026-10-23T00:00:00Z',photoIds:['00000000-0000-4000-8000-000000000002'],actions:[{id:'00000000-0000-4000-8000-000000000003',title:'[샘플] '+title,owner,dueDate,status:'open',sourcePhotoIds:['00000000-0000-4000-8000-000000000002'],completionPhotoId:'',note:'체험용 가상 자료 · 실제 점검/조치 승인 아님\n'+note}]}};
}

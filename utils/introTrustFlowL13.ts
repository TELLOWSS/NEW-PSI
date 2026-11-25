import type { Page } from '../types';

/**
 * L13: product-introduction copy source of truth. Each CTA is a real
 * authenticated PSI page. An available UI route must never be presented as
 * evidence that a worker completed training or that a report was delivered.
 */
export type IntroPathKey = 'original' | 'review' | 'education' | 'followup' | 'report';
export type IntroPathStep = {
  key: IntroPathKey;
  shortTitle: string;
  title: string;
  task: string;
  evidenceBoundary: string;
  destination: Page;
  action: string;
};
export const INTRO_VERIFIED_PATH: readonly IntroPathStep[] = [
  {
    key: 'original',
    shortTitle: '원본',
    title: '수기 기록지 원본부터 확인',
    task: '기존 수기 위험성평가 기록을 OCR 분석 화면에서 불러오고, 작업·위험·등급·조치·실천 Q1~Q5를 원본과 대조합니다.',
    evidenceBoundary: '메뉴 연결과 OCR 분석 가능성은 실제 인식 성공·근로자 직접 QR 제출을 증명하지 않습니다.',
    destination: 'ocr-analysis',
    action: 'OCR 원본 대조 열기',
  },
  {
    key: 'review',
    shortTitle: '검토',
    title: 'AI 해석은 관리자가 확인',
    task: '원본·인식값·해석값의 차이, 미저장 수정과 승인 상태를 확인합니다. AI의 추천을 그대로 공식 판단으로 확정하지 않습니다.',
    evidenceBoundary: '관리자 검토 이력이 있어도 현장 위험 제거·근로자 개인의 작업 재개 승인과는 다릅니다.',
    destination: 'ocr-analysis',
    action: '관리자 검토 화면 열기',
  },
  {
    key: 'education',
    shortTitle: '교육',
    title: '다음 교육자료와 언어별 의미 검수',
    task: '다음 교육의 위험 중점과 A4 자료 작성 상태를 확인하고, 각 언어 원문 대조·안전지시·폰트·출력물을 별도로 검수합니다.',
    evidenceBoundary: '자료 제작·형식 점검은 교육 발행, 모든 근로자의 전달·이해 또는 원어민 의미 검증 완료가 아닙니다.',
    destination: 'education-return',
    action: '교육 환류 확인',
  },
  {
    key: 'followup',
    shortTitle: '재확인',
    title: '미완료 조치를 다음 확인으로 연결',
    task: '담당·기한·임시 보호조치·재점검 기록을 보고, 실제 현장 확인이 필요한 항목을 다음 교육에 반영합니다.',
    evidenceBoundary: '개선사진 첨부나 점검 항목 등록만으로 안전조치 완료·실제 위험 제거를 승인하지 않습니다.',
    destination: 'monthly-guidance-report',
    action: '월간 재확인 자료 열기',
  },
  {
    key: 'report',
    shortTitle: '보고',
    title: '보고서 출력과 전달은 구분',
    task: '보고서 생성 조건을 검토하고 PDF·ZIP 저장 요청 후 기기 파일, 전달 대상, 수신, 증빙 검증과 발행을 따로 확인합니다.',
    evidenceBoundary: '다운로드 요청·공유앱 열림은 파일 보관·상대방 수신·공식 승인 근거가 아닙니다.',
    destination: 'reports',
    action: '보고서 검토 열기',
  },
] as const;

export const INTRO_SCOPE_WARNINGS = [
  '5문항·6지표 설명 중 기존 평가점수 6항목과 기획상의 6대 안전인식 관점은 동일한 확정 지표가 아닙니다.',
  '근로자의 직접 Q1~Q5 온라인 제출은 별도 미완성 범위입니다. 기존 수기 원본·OCR 관리자 검토를 우선합니다.',
  '공유·다국어·예측 기능은 메뉴 제공과 실제 전송·원어민 검수·현장 효과 검증을 구분합니다.',
] as const;

export function getIntroPathStep(key:IntroPathKey):IntroPathStep {
  const step=INTRO_VERIFIED_PATH.find(x=>x.key===key);
  if(!step) throw new Error('INTRO_STEP_UNKNOWN');
  return step;
}

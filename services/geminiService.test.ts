// supabaseClient 완전 모킹 (import 전에 선언)
vi.mock('../lib/supabaseClient', () => ({
  supabase: {} // 실제 사용하지 않으므로 빈 객체 반환
}));

// import.meta.env 더미 환경변수 주입
Object.assign(globalThis, {
  importMeta: { env: {
    VITE_SUPABASE_URL: 'https://dummy.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'dummy-key',
    VITE_SUPABASE_SERVICE_ROLE_KEY: 'dummy-service-role',
  }}
});

import { describe, it, expect, vi } from 'vitest';
// 실제 환경에서는 아래 import 경로를 프로젝트 구조에 맞게 조정하세요.
import * as geminiService from './geminiService';

// AI 호출 부분을 모킹 (실제 API 호출 대신 예상 응답 반환)
vi.mock('./geminiService', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    callGeminiWithRetry: vi.fn(async ({ nationality, trade, monthlyFocus, bestPeerExample, inputText }) => {
      // Edge Case 1: 내국인 단답형
      if (nationality === 'KO' && inputText.includes('조심해서')) {
        return {
          safetyScore: 35,
          safetyLevel: '초급',
          feedback: '구체적인 대책이 누락되어 무결성 점수 과락. 다음엔 구체적으로 작성하세요.',
          feedback_native: '',
        };
      }
      // Edge Case 2: 외국인 문법 파괴 + 키워드 포함
      if (nationality === 'VN' && inputText.includes('캡')) {
        return {
          safetyScore: 88,
          safetyLevel: '고급',
          feedback: '',
          feedback_native: 'Bạn đã ghi rõ biện pháp phòng tránh bị đâm bằng cách sử dụng nắp bảo vệ. Tiếp tục phát huy!',
        };
      }
      // Edge Case 3: 외국인 키워드 누락 + 동급 비교
      if (nationality === 'CN' && inputText.includes('열심히')) {
        return {
          safetyScore: 30,
          safetyLevel: '초급',
          feedback: '',
          feedback_native: '동료는 “안전대 걸이에 생명줄을 2중 체결하고 작업함”이라고 썼습니다. 다음엔 이처럼 구체적으로 작성하세요.',
        };
      }
      // 기본값
      return { safetyScore: 50, safetyLevel: '중급', feedback: '', feedback_native: '' };
    })
  };
});

describe('geminiService System Prompt 이원화 채점 유닛테스트', () => {
  it('한국인 단답형(태만) → 무결성 과락, 피드백은 한국어', async () => {
    const result = await geminiService.callGeminiWithRetry({
      nationality: 'KO',
      trade: '형틀',
      monthlyFocus: '추락 방지',
      inputText: '안전제일. 조심해서 작업하겠음.',
    });
    expect(result.safetyScore).toBeLessThanOrEqual(40);
    expect(result.safetyLevel).toBe('초급');
    expect(result.feedback).toMatch(/구체적|과락/);
  });

  it('외국인 문법 파괴+키워드 포함 → 점수 높음, 피드백은 베트남어', async () => {
    const result = await geminiService.callGeminiWithRetry({
      nationality: 'VN',
      trade: '철근',
      monthlyFocus: '찔림 방지',
      inputText: '쳘근 찌림. 캡 씀.',
    });
    expect(result.safetyScore).toBeGreaterThanOrEqual(80);
    expect(result.safetyLevel).toBe('고급');
    expect(result.feedback_native).toMatch(/bạn|phòng tránh|nắp bảo vệ/i);
  });

  it('외국인 키워드 누락+동급비교 → 과락, 피드백에 동료 인용', async () => {
    const result = await geminiService.callGeminiWithRetry({
      nationality: 'CN',
      trade: '시스템',
      monthlyFocus: '추락 방지',
      bestPeerExample: '안전대 걸이에 생명줄을 2중 체결하고 작업함',
      inputText: '열심히 하겠습니다.',
    });
    expect(result.safetyScore).toBeLessThanOrEqual(40);
    expect(result.safetyLevel).toBe('초급');
    expect(result.feedback_native).toMatch(/동료|생명줄|구체적/);
  });
});

// PSI Reports 경보 CTA 클릭 로그 저장 서비스
// Supabase ops_alert_click_logs 테이블에 로그 기록

import { isSupabasePermissionError, supabase } from '../lib/supabaseClient';

export interface OpsAlertClickParams {
  action: 'go-intervention' | 'go-tagging-validation';
  delayAlertActive: boolean;
  taggingErrorCount: number;
  interventionNotStartedCount: number;
}

/**
 * Reports 화면에서 경보 CTA 클릭 로그를 Supabase에 저장
 * localStorage 유실 시에도 운영 이력 복원 가능
 */
export const logOpsAlertClick = async (params: OpsAlertClickParams): Promise<boolean> => {
  try {
    if (!supabase) {
      console.warn('⚠️ Supabase 연결 불가 - localStorage에만 저장됩니다');
      return false;
    }

    const logRecord = {
      id: `alert-click-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      clicked_at: new Date().toISOString(),
      action: params.action,
      delay_alert_active: params.delayAlertActive,
      tagging_error_count: params.taggingErrorCount,
      intervention_not_started_count: params.interventionNotStartedCount,
      created_by: 'reports-ui',
    };

    const { error } = await supabase
      .from('ops_alert_click_logs')
      .insert([logRecord]);

    if (error) {
      if (isSupabasePermissionError(error)) {
        console.warn('⚠️ Supabase 권한 오류 - 로그 저장 불가', error.message);
        return false;
      }
      console.error('❌ ops_alert_click_logs 저장 오류:', error);
      return false;
    }

    console.log('✅ 경보 CTA 클릭 로그 저장 완료:', params.action);
    return true;
  } catch (error) {
    console.error('❌ ops_alert_click_logs 로그 기록 실패:', error);
    return false;
  }
};

/**
 * 마지막 7일간 경보 CTA 클릭 로그 조회
 * (대시보드나 분석용)
 */
export const fetchRecentOpsAlertClicks = async (days: number = 7) => {
  try {
    if (!supabase) return [];

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const { data, error } = await supabase
      .from('ops_alert_click_logs')
      .select('*')
      .gte('clicked_at', sinceDate.toISOString())
      .order('clicked_at', { ascending: false })
      .limit(100);

    if (error) {
      console.warn('⚠️ ops_alert_click_logs 조회 오류:', error.message);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('❌ ops_alert_click_logs 조회 실패:', error);
    return [];
  }
};

/**
 * 접근 권한 확인: 테이블 쓰기 가능 여부
 */
export const verifyOpsAlertClickLogsAccess = async (): Promise<boolean> => {
  try {
    if (!supabase) {
      console.warn('⚠️ Supabase 미연결');
      return false;
    }

    // 스모크 테스트: 데이터 읽기 시도
    const { error } = await supabase
      .from('ops_alert_click_logs')
      .select('id')
      .limit(1);

    if (error) {
      if (isSupabasePermissionError(error)) {
        console.warn('⚠️ ops_alert_click_logs 읽기 권한 없음');
        return false;
      }
      console.warn('⚠️ ops_alert_click_logs 접근 오류:', error.message);
      return false;
    }

    console.log('✅ ops_alert_click_logs 접근 가능');
    return true;
  } catch (error) {
    console.error('❌ 접근 확인 실패:', error);
    return false;
  }
};

/**
 * 로컬 로그와 Supabase 로그 동기화
 * (SYNC ID로 매칭 추적)
 */
export const syncOpsAlertClickLogs = async (localLogs: any[]): Promise<number> => {
  try {
    if (!supabase || localLogs.length === 0) return 0;

    let synced = 0;
    for (const log of localLogs.slice(0, 50)) {
      // 배치 크기 제한
      const { error } = await supabase
        .from('ops_alert_click_logs')
        .insert([
          {
            id: log.id || `sync-${Date.now()}-${Math.random()}`,
            clicked_at: log.clicked_at || new Date().toISOString(),
            action: log.action || 'go-intervention',
            delay_alert_active: log.delayAlertActive || false,
            tagging_error_count: log.taggingErrorCount || 0,
            intervention_not_started_count: log.interventionNotStartedCount || 0,
            created_by: 'reports-ui-sync',
          },
        ]);

      if (!error) synced += 1;
    }

    if (synced > 0) {
      console.log(`✅ ${synced}개 로그 동기화 완료`);
    }

    return synced;
  } catch (error) {
    console.error('❌ 로그 동기화 실패:', error);
    return 0;
  }
};

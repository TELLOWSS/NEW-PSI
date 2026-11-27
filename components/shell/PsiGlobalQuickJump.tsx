import React, { useEffect, useMemo, useRef, useState } from 'react';
import { nexusFeatureFlags } from '../../config/nexusFeatureFlags';
import type { Page, WorkerRecord } from '../../types';

interface QuickJumpItem {
  id: string;
  group: '화면 이동' | '현장 기능' | '근로자 기록';
  label: string;
  detail: string;
  keywords: string;
  onSelect: () => void;
}

interface PsiGlobalQuickJumpProps {
  open: boolean;
  onClose: () => void;
  currentPage: Page;
  workerRecords?: readonly WorkerRecord[];
  onNavigateToPage: (page: Page) => void;
  onOpenWorkerRecord?: (record: WorkerRecord) => void;
  onOpenInspector: () => void;
  onToggleSunlight: () => void;
  onToggleMotion: () => void;
  onToggleTheme: () => void;
}

/**
 * 어느 화면에서나 Ctrl+K 또는 상단 버튼으로 화면·점검함·근로자를 즉시 찾아 이동하는 빠른 찾기 창입니다.
 */
export const PsiGlobalQuickJump: React.FC<PsiGlobalQuickJumpProps> = ({
  open,
  onClose,
  currentPage,
  workerRecords = [],
  onNavigateToPage,
  onOpenWorkerRecord,
  onOpenInspector,
  onToggleSunlight,
  onToggleMotion,
  onToggleTheme,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  const items = useMemo<QuickJumpItem[]>(() => {
    const pages: Array<{ page: Page; label: string; detail: string; keywords: string }> = [
      { page: 'dashboard', label: '현장 안전 관제센터', detail: '전체 위험 신호 및 운영 요약', keywords: '대시보드 홈 관제' },
      ...(nexusFeatureFlags.uiEnabled
        ? [
            {
              page: 'safety-nexus' as Page,
              label: '입체 지휘 센터',
              detail: '5단계 순환 · 6대 핵심기능 · 10대 골조 지휘 화면',
              keywords: '입체 3d 지휘 본사 현장 안전지능',
            },
          ]
        : []),
      { page: 'ocr-analysis', label: '위험성평가 분석', detail: '기록지 사진·파일 판독 및 취약군 분류', keywords: '위험분석 ocr 기록지 판독' },
      { page: 'accident-bigdata', label: '사고 빅데이터 허브', detail: '원도급사 사고보고서 AI 변환 가져오기 및 공종·원인 빅데이터', keywords: '사고 보고서 빅데이터 제미나이 챗지피티 변환 원도급사' },
      { page: 'safety-inspector', label: '사진점검 · 개선관리', detail: '현장 사진점검 등록 · 본사 전현장 개선관제 · 재점검/반려', keywords: '사진 점검 개선 건설기계 본사 전현장 재점검 반려' },
      { page: 'a4-education-material', label: 'A4 교육자료 제작', detail: '사고 사례·위험성평가 기반 다국어 한 장 교육자료 제작', keywords: '교육자료 a4 포스터 다국어 번역 출력' },
      { page: 'worker-management', label: '근로자 관리', detail: '근로자별 이력·사진 등록·위험등급 추적 관리', keywords: '근로자 명단 이력 사진 관리' },
      { page: 'site-issue-management', label: '현장 위험 이슈 관리', detail: '현장 지적사항·위험요인 등록 및 조치 추적', keywords: '이슈 지적사항 위험 현장 조치' },
      { page: 'reports', label: '종합 보고서', detail: '현장 안전 브리핑 및 월간 종합 보고서 생성', keywords: '보고서 리포트 브리핑 종합' },
      { page: 'education-return', label: '교육 환류', detail: '다국어 교육자료 발송 및 근로자 서명 현황', keywords: '교육 서명 다국어 환류' },
      { page: 'safety-compliance-hub', label: '안전조치 통합 허브', detail: '시정조치 · 보호구 · 법정 이행 통합 점검', keywords: '안전조치 허브 시정조치 법정' },
      { page: 'monthly-guidance-report', label: '월간 계도 리포트', detail: '월별 취약 공종 및 계도 보고서 생성', keywords: '월간 계도 리포트 보고서' },
      { page: 'settings', label: '시스템 설정', detail: '현장 기본 정보 · 저장 관리 · 출력 기준', keywords: '설정 백업 현장' },
    ];

    const pageItems: QuickJumpItem[] = pages.map(item => ({
      id: 'page-' + item.page,
      group: '화면 이동',
      label: item.label + (currentPage === item.page ? ' (현재 화면)' : ''),
      detail: item.detail,
      keywords: item.keywords,
      onSelect: () => {
        onClose();
        onNavigateToPage(item.page);
      },
    }));

    const actionItems: QuickJumpItem[] = [
      {
        id: 'act-inspector',
        group: '현장 기능',
        label: '현장 점검 · 결재함 열기',
        detail: '미결 시정조치 종결 · 건설기계 사진 즉시 적합 승인',
        keywords: '결재 점검 승인 보완 작업중지',
        onSelect: () => {
          onClose();
          onOpenInspector();
        },
      },
      {
        id: 'act-sunlight',
        group: '현장 기능',
        label: '야외 직사광선 고대비 전환',
        detail: '햇빛 아래 선명한 고대비 모드로 즉시 전환',
        keywords: '야외 햇빛 고대비 선명',
        onSelect: () => {
          onClose();
          onToggleSunlight();
        },
      },
      {
        id: 'act-motion',
        group: '현장 기능',
        label: '화면 모션 켜기 / 일시정지',
        detail: '실시간 추세선·신호등 애니메이션 재생 또는 정지',
        keywords: '모션 애니메이션 정지 재생',
        onSelect: () => {
          onClose();
          onToggleMotion();
        },
      },
      {
        id: 'act-theme',
        group: '현장 기능',
        label: '밝은 화면 / 어두운 화면 전환',
        detail: '라이트 · 다크 · 시스템 테마 순환',
        keywords: '화이트 다크 테마 밝은 어두운',
        onSelect: () => {
          onClose();
          onToggleTheme();
        },
      },
    ];

    const q = query.trim().toLowerCase();
    const matchedWorkerRecords = q
      ? workerRecords
          .filter(rec =>
            `${rec.name || ''} ${rec.jobField || ''} ${rec.nationality || ''} ${rec.teamLeader || ''}`
              .toLowerCase()
              .includes(q),
          )
          .slice(0, 12)
      : workerRecords.slice(0, 6);

    const recordItems: QuickJumpItem[] = matchedWorkerRecords.map((rec, idx) => ({
      id: 'rec-' + (rec.id || idx),
      group: '근로자 기록',
      label: `${rec.name || '미확인 근로자'} · ${rec.jobField || '공종 미분류'}`,
      detail: `안전점수 ${rec.safetyScore ?? 0}점 · 근로자 상세 기록 바로 열기`,
      keywords: `${rec.name || ''} ${rec.jobField || ''} ${rec.nationality || ''} ${rec.teamLeader || ''} 근로자`,
      onSelect: () => {
        onClose();
        if (onOpenWorkerRecord) {
          onOpenWorkerRecord(rec);
        } else {
          onNavigateToPage('ocr-analysis');
        }
      },
    }));

    const combined = [...actionItems, ...pageItems, ...recordItems];
    if (!q) return combined;
    return combined.filter(item =>
      `${item.label} ${item.detail} ${item.keywords}`.toLowerCase().includes(q),
    );
  }, [
    currentPage,
    onClose,
    onNavigateToPage,
    onOpenInspector,
    onOpenWorkerRecord,
    onToggleMotion,
    onToggleSunlight,
    onToggleTheme,
    query,
    workerRecords,
  ]);

  if (!open) return null;

  const clampedIndex = Math.min(activeIndex, Math.max(0, items.length - 1));

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(prev => (items.length === 0 ? 0 : (prev + 1) % items.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(prev => (items.length === 0 ? 0 : (prev - 1 + items.length) % items.length));
    } else if (event.key === 'Enter' && items[clampedIndex]) {
      event.preventDefault();
      items[clampedIndex].onSelect();
    }
  };

  return (
    <div
      className="psi-quickjump-backdrop"
      role="presentation"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="psi-quickjump-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="빠른 찾기"
        onKeyDown={handleKeyDown}
      >
        <div className="psi-quickjump-search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="화면, 점검 기능, 근로자 이름·공종 검색..."
            aria-label="빠른 찾기 검색어 입력"
          />
          <button type="button" onClick={onClose}>
            닫기
          </button>
        </div>

        <ul className="psi-quickjump-list" role="listbox" aria-label="검색 결과">
          {items.length === 0 ? (
            <li className="psi-quickjump-empty">일치하는 화면이나 항목이 없습니다.</li>
          ) : (
            items.map((item, idx) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={idx === clampedIndex}
                  className={idx === clampedIndex ? 'is-selected' : ''}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={item.onSelect}
                >
                  <span className="psi-qj-group">{item.group}</span>
                  <span className="psi-qj-main">
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span className="psi-qj-go" aria-hidden="true">
                    이동 →
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Page } from '../../types';
import { postAdminJson } from '../../utils/adminApiClient';
import {
  globalActionCounts,
  globalActionStatusText,
  type GlobalActionRow,
} from '../../lib/inspector/globalActionRegister';
import { koreanDay } from '../../lib/inspector/workQueue';
import {
  readSiteIssueList,
  SITE_ISSUES_STORAGE_KEY,
  SITE_ISSUES_UPDATED_EVENT,
} from '../../utils/siteIssueStorage';
import {
  NEXUS_EQUIPMENT_PHOTO_STATUS_LABELS,
  NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT,
  readEquipmentPhotoSubmissions,
  reviewEquipmentPhotoByHq,
} from '../../utils/nexusEquipmentPhotoReport';
import {
  NEXUS_CEO_TRAINING_UPDATED_EVENT,
  readExecutiveTrainingCampaigns,
} from '../../utils/nexusExecutiveTrainingPipeline';
import {
  NEXUS_HQ_LOOP_UPDATED_EVENT,
  readAiInvestigations,
  readHqVisitPlans,
  scopeNexusWorkspaceData,
  type NexusWorkspaceAuthority,
} from '../../utils/nexusHqCommandLoop';
import {
  advanceNexusPipelineCaseStatus,
  NEXUS_PIPELINE_STATUS_LABELS,
  NEXUS_PIPELINE_UPDATED_EVENT,
  readNexusPipelineCases,
} from '../../utils/nexusQuickPipeline';

interface PsiUniversalInspectorDrawerProps {
  open: boolean;
  onClose: () => void;
  authority: NexusWorkspaceAuthority;
  onNavigateToPage: (page: Page) => void;
}

const triggerSubtleHaptic = () => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
  } catch {
    // Ignore unsupported devices
  }
};

interface DrawerSiteIssue {
  id: string;
  date?: string;
  location: string;
  type: string;
  description: string;
  status: string;
}

/**
 * 어느 연계 화면에서나 페이지 이탈 없이 미결 시정조치·사진점검·현장 이슈를 즉시 확인하고 처리하는 통합 점검함입니다.
 */
export const PsiUniversalInspectorDrawer: React.FC<PsiUniversalInspectorDrawerProps> = ({
  open,
  onClose,
  authority,
  onNavigateToPage,
}) => {
  const [activeTab, setActiveTab] = useState<'cases' | 'field-actions' | 'photos'>('cases');
  const [revisionTick, setRevisionTick] = useState(0);
  const [toastMessage, setToastMessage] = useState('');
  const [inspectorRows, setInspectorRows] = useState<GlobalActionRow[]>([]);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [inspectorError, setInspectorError] = useState('');
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const loadInspectorActions = useCallback(async () => {
    setInspectorLoading(true);
    setInspectorError('');
    try {
      const result = await postAdminJson<{ ok: boolean; rows?: GlobalActionRow[] }>(
        '/api/admin/inspector',
        { op: 'global-action-register' },
        { timeoutMs: 8000, fallbackMessage: '사진점검 미결 조치를 불러오지 못했습니다.' },
      );
      if (!aliveRef.current) return;
      setInspectorRows(Array.isArray(result.rows) ? result.rows : []);
    } catch (cause) {
      if (!aliveRef.current) return;
      setInspectorError(cause instanceof Error ? cause.message : '사진점검 미결 조치를 불러오지 못했습니다.');
    } finally {
      if (aliveRef.current) {
        setInspectorLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadInspectorActions();
  }, [open, loadInspectorActions]);

  useEffect(() => {
    const sync = () => setRevisionTick(t => t + 1);
    const events = [
      NEXUS_PIPELINE_UPDATED_EVENT,
      NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT,
      NEXUS_HQ_LOOP_UPDATED_EVENT,
      NEXUS_CEO_TRAINING_UPDATED_EVENT,
      SITE_ISSUES_UPDATED_EVENT,
      'storage',
    ];
    for (const ev of events) {
      window.addEventListener(ev, sync);
    }
    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, sync);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const scoped = useMemo(
    () =>
      scopeNexusWorkspaceData({
        workspaceRole: authority,
        pipelineCases: readNexusPipelineCases(),
        visitPlans: readHqVisitPlans(),
        investigations: readAiInvestigations(),
        trainingCampaigns: readExecutiveTrainingCampaigns(),
        equipmentReports: readEquipmentPhotoSubmissions(),
      }),
    [authority, revisionTick],
  );

  const openCases = useMemo(
    () =>
      [...scoped.pipelineCases]
        .filter(item => item.status !== 'closed')
        .sort((a, b) => Number(Boolean(b.stopWorkFlag)) - Number(Boolean(a.stopWorkFlag))),
    [scoped.pipelineCases],
  );

  const pendingPhotos = useMemo(
    () =>
      scoped.equipmentReports.filter(
        item => item.status === 'submitted_to_hq' || item.status === 'revision_requested_hq',
      ),
    [scoped.equipmentReports],
  );

  const openSiteIssues = useMemo(() => {
    if (typeof window === 'undefined') return [] as DrawerSiteIssue[];
    return readSiteIssueList<DrawerSiteIssue>(() =>
      window.localStorage.getItem(SITE_ISSUES_STORAGE_KEY),
    ).items.filter(item => item.status !== '조치 완료');
  }, [revisionTick]);

  const today = koreanDay();
  const inspectorCounts = useMemo(
    () => globalActionCounts(inspectorRows, today),
    [inspectorRows, today],
  );
  const unresolvedInspectorRows = useMemo(
    () => inspectorRows.filter(row => row.status !== 'verified'),
    [inspectorRows],
  );
  const fieldActionTotal = unresolvedInspectorRows.length + openSiteIssues.length;

  if (!open) return null;

  const handleAdvanceCase = (caseId: string, nextStatus: 'recheck_pending' | 'closed') => {
    triggerSubtleHaptic();
    advanceNexusPipelineCaseStatus(caseId, nextStatus, undefined, undefined, '지휘 점검관');
    setToastMessage(
      nextStatus === 'closed'
        ? '시정조치가 완료 종결로 반영되었습니다.'
        : '현장 재점검 요청 상태로 전환되었습니다.',
    );
    setRevisionTick(t => t + 1);
  };

  const handleReviewPhoto = (
    submissionId: string,
    uploadedBy: string,
    decision: 'hq_verified_for_ceo' | 'revision_requested_hq',
  ) => {
    triggerSubtleHaptic();
    const reviewerLabel =
      uploadedBy.trim() === '본사 지휘 점검관' ? '본사 교차 검토관' : '본사 지휘 점검관';
    reviewEquipmentPhotoByHq(submissionId, { decision, reviewerLabel });
    setToastMessage(
      decision === 'hq_verified_for_ceo'
        ? '건설기계 사진 적합 승인 · 보고함 편입 완료'
        : '건설기계 사진 보완 요청으로 현장 전달 완료',
    );
    setRevisionTick(t => t + 1);
  };

  return (
    <div
      className="psi-universal-drawer-backdrop"
      role="presentation"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className="psi-universal-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="현장 점검 · 결재함"
      >
        <div className="psi-universal-drawer-head">
          <div>
            <p className="psi-universal-drawer-eyebrow">
              {authority === 'hq' ? '🏛️ 본사 통합 관제' : '🔒 단일 현장 격리'} · 즉시 처리함
            </p>
            <h3>현장 점검 · 결재함</h3>
            <p className="psi-universal-drawer-sub">
              현재 화면을 벗어나지 않고 미결 조치와 기계사진을 바로 승인·완료 처리합니다.
            </p>
          </div>
          <button
            type="button"
            className="psi-universal-drawer-close"
            onClick={onClose}
            aria-label="현장 점검 결재함 닫기"
          >
            닫기 ✕
          </button>
        </div>

        {toastMessage && (
          <div className="psi-universal-drawer-toast" role="status">
            ✓ {toastMessage}
          </div>
        )}

        <div className="psi-universal-drawer-tabs" role="tablist" aria-label="처리 대상 구분">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'cases'}
            onClick={() => setActiveTab('cases')}
          >
            시정조치 · 작업중지 <b className="psi-tabular-num">{openCases.length}</b>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'field-actions'}
            onClick={() => setActiveTab('field-actions')}
          >
            사진점검 · 이슈 <b className="psi-tabular-num">{fieldActionTotal}</b>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'photos'}
            onClick={() => setActiveTab('photos')}
          >
            기계사진 검토 <b className="psi-tabular-num">{pendingPhotos.length}</b>
          </button>
        </div>

        <div className="psi-universal-drawer-body">
          {activeTab === 'field-actions' ? (
            <>
              <article className="psi-universal-drawer-card">
                <div className="psi-universal-drawer-card-top">
                  <span className="psi-ud-pill">사진점검 · 개선관리</span>
                  <small className="psi-tabular-num">
                    미조치 {inspectorCounts.unresolved}건 · 기한초과 {inspectorCounts.overdue}건 · 재점검 {inspectorCounts.reinspection}건
                  </small>
                </div>
                <h4>사진점검 서버 시정조치 요약</h4>
                {inspectorLoading ? (
                  <p>최근 사진점검 조치 현황을 불러오는 중입니다...</p>
                ) : inspectorError ? (
                  <p>{inspectorError}</p>
                ) : unresolvedInspectorRows.length === 0 ? (
                  <p>현재 불러온 범위 내 미결 사진점검 시정조치가 없습니다.</p>
                ) : (
                  unresolvedInspectorRows.slice(0, 5).map(row => (
                    <div
                      key={`${row.inspectionId}-${row.actionId}`}
                      className="rounded-lg border border-slate-200/80 bg-white/80 p-2 text-xs dark:border-slate-700 dark:bg-slate-900/70"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 font-bold">
                        <span>{row.siteName || '현장 미입력'} · {row.location || row.inspectionTitle}</span>
                        <span className="psi-ud-pill">{globalActionStatusText(row, today)}</span>
                      </div>
                      <p className="mt-1">
                        {row.title} · 담당 {row.owner || '미지정'} · 기한 {row.dueDate || '미지정'}
                      </p>
                    </div>
                  ))
                )}
                <div className="psi-universal-drawer-actions">
                  <button
                    type="button"
                    className="is-primary"
                    onClick={() => {
                      onClose();
                      onNavigateToPage('safety-inspector');
                    }}
                  >
                    사진점검 · 개선관제 열기
                  </button>
                  <button
                    type="button"
                    disabled={inspectorLoading}
                    onClick={() => void loadInspectorActions()}
                  >
                    {inspectorLoading ? '조회 중...' : '새로고침'}
                  </button>
                </div>
              </article>

              <article className="psi-universal-drawer-card">
                <div className="psi-universal-drawer-card-top">
                  <span className="psi-ud-pill">현장 위험 이슈 관리</span>
                  <small className="psi-tabular-num">미완료 {openSiteIssues.length}건</small>
                </div>
                <h4>현장 위험 이슈 미결 목록</h4>
                {openSiteIssues.length === 0 ? (
                  <p>현재 미조치 현장 위험 이슈가 없습니다.</p>
                ) : (
                  openSiteIssues.slice(0, 5).map(issue => (
                    <div
                      key={issue.id}
                      className="rounded-lg border border-slate-200/80 bg-white/80 p-2 text-xs dark:border-slate-700 dark:bg-slate-900/70"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 font-bold">
                        <span>{issue.location || '위치 미상'} · {issue.type || '기타'}</span>
                        <span className="psi-ud-pill">{issue.status}</span>
                      </div>
                      <p className="mt-1">{issue.description}</p>
                    </div>
                  ))
                )}
                <div className="psi-universal-drawer-actions">
                  <button
                    type="button"
                    className="is-primary"
                    onClick={() => {
                      onClose();
                      onNavigateToPage('site-issue-management');
                    }}
                  >
                    현장 위험 이슈 관리 열기
                  </button>
                </div>
              </article>
            </>
          ) : activeTab === 'cases' ? (
            openCases.length === 0 ? (
              <div className="psi-universal-drawer-empty">
                <strong>미결 시정조치 0건</strong>
                <p>현재 범위 내 즉시 처리할 작업중지나 미결 조치가 없습니다.</p>
              </div>
            ) : (
              openCases.map(item => (
                <article
                  key={item.caseId}
                  className={
                    'psi-universal-drawer-card' + (item.stopWorkFlag ? ' is-critical' : '')
                  }
                >
                  <div className="psi-universal-drawer-card-top">
                    <span className={'psi-ud-pill' + (item.stopWorkFlag ? ' is-danger' : '')}>
                      {item.stopWorkFlag ? '작업중지' : NEXUS_PIPELINE_STATUS_LABELS[item.status]}
                    </span>
                    <small>{item.siteName}</small>
                  </div>
                  <h4>{item.locationLabel}</h4>
                  <p>{item.actionTitle || item.observationNote}</p>
                  <div className="psi-universal-drawer-actions">
                    <button
                      type="button"
                      className="is-primary"
                      onClick={() => handleAdvanceCase(item.caseId, 'closed')}
                    >
                      조치 완료 종결
                    </button>
                    {item.status !== 'recheck_pending' && (
                      <button
                        type="button"
                        onClick={() => handleAdvanceCase(item.caseId, 'recheck_pending')}
                      >
                        재점검 요청
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onNavigateToPage('safety-compliance-hub');
                      }}
                    >
                      전체 허브 이동
                    </button>
                  </div>
                </article>
              ))
            )
          ) : pendingPhotos.length === 0 ? (
            <div className="psi-universal-drawer-empty">
              <strong>검토 대기 사진 0건</strong>
              <p>모든 건설기계 사용전 점검 사진이 검토 완료 상태입니다.</p>
            </div>
          ) : (
            pendingPhotos.map(photo => (
              <article key={photo.submissionId} className="psi-universal-drawer-card">
                <div className="psi-universal-drawer-card-top">
                  <span
                    className={
                      'psi-ud-pill' +
                      (photo.status === 'revision_requested_hq' ? ' is-danger' : '')
                    }
                  >
                    {NEXUS_EQUIPMENT_PHOTO_STATUS_LABELS[photo.status]}
                  </span>
                  <small>{photo.siteName}</small>
                </div>
                <div className="psi-ud-photo-row">
                  {photo.photoDataUrl ? (
                    <img src={photo.photoDataUrl} alt={photo.equipmentLabel} />
                  ) : null}
                  <div>
                    <h4>{photo.equipmentLabel}</h4>
                    <p>{photo.workActivity} · {photo.inspectionPointSummary}</p>
                  </div>
                </div>
                <div className="psi-universal-drawer-actions">
                  <button
                    type="button"
                    className="is-primary"
                    onClick={() =>
                      handleReviewPhoto(photo.submissionId, photo.uploadedBy, 'hq_verified_for_ceo')
                    }
                  >
                    적합 승인
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleReviewPhoto(photo.submissionId, photo.uploadedBy, 'revision_requested_hq')
                    }
                  >
                    보완 요청
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToPage('safety-inspector');
                    }}
                  >
                    사진점검 화면
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </aside>
    </div>
  );
};

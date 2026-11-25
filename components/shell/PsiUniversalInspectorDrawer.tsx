import React, { useEffect, useMemo, useState } from 'react';
import type { Page } from '../../types';
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

/**
 * 어느 연계 화면에서나 페이지 이탈 없이 미결 시정조치·건설기계 사진을 즉시 결재/처리하는 통합 점검함입니다.
 */
export const PsiUniversalInspectorDrawer: React.FC<PsiUniversalInspectorDrawerProps> = ({
  open,
  onClose,
  authority,
  onNavigateToPage,
}) => {
  const [activeTab, setActiveTab] = useState<'cases' | 'photos'>('cases');
  const [revisionTick, setRevisionTick] = useState(0);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    const sync = () => setRevisionTick(t => t + 1);
    const events = [
      NEXUS_PIPELINE_UPDATED_EVENT,
      NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT,
      NEXUS_HQ_LOOP_UPDATED_EVENT,
      NEXUS_CEO_TRAINING_UPDATED_EVENT,
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
            aria-selected={activeTab === 'photos'}
            onClick={() => setActiveTab('photos')}
          >
            기계사진 검토 <b className="psi-tabular-num">{pendingPhotos.length}</b>
          </button>
        </div>

        <div className="psi-universal-drawer-body">
          {activeTab === 'cases' ? (
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

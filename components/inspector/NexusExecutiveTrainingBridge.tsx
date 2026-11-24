import React, { useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  TRAINING_LANGUAGE_FLAGS,
  TRAINING_LANGUAGE_LABELS,
  type TrainingLanguageCode,
} from '../../utils/constructionTrainingTranslation';
import {
  NEXUS_CORE_12_LANGUAGES,
  NEXUS_TRAINING_STATUS_LABELS,
  buildExecutiveTrainingDraftFromSeed,
  formatLanguageBadge,
  recordExecutiveTrainingSignatureProgress,
  recordIndividualWorkerHandwrittenSignature,
  stageExecutiveTrainingHandoff,
  type NexusExecutiveTrainingCampaign,
} from '../../utils/nexusExecutiveTrainingPipeline';
import { enqueueNexusOfflineMutation } from '../../utils/nexusOfflineQueue';
import {
  NEXUS_STRUCTURAL_INCIDENT_SEEDS,
  type NexusStructuralIncidentSeed,
} from '../../utils/nexusStructuralTaxonomy';

interface Props {
  workspaceRole?: 'hq' | 'field';
  siteLabel?: string;
  siteId?: string;
  activeSeed?: NexusStructuralIncidentSeed;
  campaigns: readonly NexusExecutiveTrainingCampaign[];
  onCampaignsChange: (next: NexusExecutiveTrainingCampaign[]) => void;
  onOpenAdminTraining?: (campaign: NexusExecutiveTrainingCampaign) => void;
}

export const NexusExecutiveTrainingBridge: React.FC<Props> = ({
  workspaceRole = 'hq',
  siteLabel,
  siteId,
  activeSeed,
  campaigns,
  onCampaignsChange,
  onOpenAdminTraining,
}) => {
  const isField = workspaceRole === 'field';
  const seed = activeSeed ?? NEXUS_STRUCTURAL_INCIDENT_SEEDS[0];
  const [selectedLang, setSelectedLang] = useState<TrainingLanguageCode>('vi-VN');
  const [targetWorkers, setTargetWorkers] = useState(12);
  const [speakingLang, setSpeakingLang] = useState<string>('');
  const [notice, setNotice] = useState('');
  const [workerNamesByCamp, setWorkerNamesByCamp] = useState<Record<string, string>>({});
  const sigCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const sigDrawingState = useRef<Record<string, { drawing: boolean; hasInk: boolean; initialized: boolean }>>({});

  const draftPreview = useMemo(
    () => buildExecutiveTrainingDraftFromSeed(seed, { targetWorkers }),
    [seed, targetWorkers],
  );

  const handleSpeakPreview = (lang: TrainingLanguageCode, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setNotice('이 브라우저에서는 내장 음성 합성을 지원하지 않습니다. QR·음성 배포 스튜디오에서 MP3/TTS로 배포하세요.');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.96;
      utterance.onend = () => setSpeakingLang('');
      utterance.onerror = () => setSpeakingLang('');
      setSpeakingLang(lang);
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeakingLang('');
    }
  };

  const handleDispatch12Lang = (openStudio: boolean) => {
    const created = stageExecutiveTrainingHandoff(seed, {
      targetWorkers,
      dispatchImmediately: true,
    });
    onCampaignsChange([created, ...campaigns.filter(c => c.campaignId !== created.campaignId)]);
    setNotice(
      `[${created.matchedCaseCode}] 04 대표이사 안전교육 12개 국어 캠페인(${created.targetWorkers}명 대상)이 발령되어 3D 황금 구체에 연결되었습니다.`,
    );
    if (openStudio && onOpenAdminTraining) {
      onOpenAdminTraining(created);
    }
  };

  const handleRecordWorkerSignature = (
    campaignId: string,
    lang: TrainingLanguageCode,
    addCount: number,
  ) => {
    const updated = recordExecutiveTrainingSignatureProgress(campaignId, {
      addSignatures: addCount,
      languageCode: lang,
    });
    enqueueNexusOfflineMutation({
      kind: 'training_signature',
      siteId,
      recordId: campaignId,
      summary: `${formatLanguageBadge(lang)} 작업팀 ${addCount}명 이수 확인`,
    });
    onCampaignsChange([...updated]);
    setNotice(
      `${formatLanguageBadge(lang)} 작업팀 모국어 이해·서명 ${addCount}건이 황금 구체 이수율 시그널로 즉시 환류되었습니다.`,
    );
  };

  const clearSignatureCanvas = (campaignId: string) => {
    const canvas = sigCanvasRefs.current[campaignId];
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    sigDrawingState.current[campaignId] = { drawing: false, hasInk: false, initialized: true };
  };

  const getScaledCanvasPoint = (
    canvas: HTMLCanvasElement,
    e: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleSigPointerDown = (
    campaignId: string,
    e: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const canvas = sigCanvasRefs.current[campaignId];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const st = sigDrawingState.current[campaignId] ?? {
      drawing: false,
      hasInk: false,
      initialized: false,
    };
    if (!st.initialized) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      st.initialized = true;
    }
    const pt = getScaledCanvasPoint(canvas, e);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    sigDrawingState.current[campaignId] = { drawing: true, hasInk: st.hasInk, initialized: true };
  };

  const handleSigPointerMove = (
    campaignId: string,
    e: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const st = sigDrawingState.current[campaignId];
    if (!st?.drawing) return;
    const canvas = sigCanvasRefs.current[campaignId];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pt = getScaledCanvasPoint(canvas, e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    st.hasInk = true;
  };

  const handleSigPointerUp = (campaignId: string) => {
    const st = sigDrawingState.current[campaignId];
    if (st) st.drawing = false;
  };

  const handleSaveHandwrittenWorkerSignature = (camp: NexusExecutiveTrainingCampaign) => {
    const canvas = sigCanvasRefs.current[camp.campaignId];
    const st = sigDrawingState.current[camp.campaignId];
    const workerName = workerNamesByCamp[camp.campaignId]?.trim() || '';
    if (!workerName) {
      setNotice('서명하는 근로자의 성명(또는 별칭)을 먼저 입력해 주세요.');
      return;
    }
    if (!canvas || !st?.hasInk) {
      setNotice('서명 패드에 손가락 또는 마우스로 자필 서명을 그린 뒤 저장해 주세요.');
      return;
    }
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const result = recordIndividualWorkerHandwrittenSignature(camp.campaignId, {
        workerName,
        languageCode: selectedLang,
        signatureDataUrl: dataUrl,
        siteId,
      });
      enqueueNexusOfflineMutation({
        kind: 'training_signature',
        siteId,
        recordId: result.receipt.signatureId,
        summary: `${formatLanguageBadge(selectedLang)} ${result.receipt.workerName} 자필 서명`,
      });
      clearSignatureCanvas(camp.campaignId);
      setWorkerNamesByCamp(prev => ({ ...prev, [camp.campaignId]: '' }));
      onCampaignsChange([...result.campaigns]);
      setNotice(
        `[자필 서명 저장 완료] ${formatLanguageBadge(selectedLang)} · ${result.receipt.workerName} 서명이 중대재해처벌법 증빙 대장과 이수율에 즉시 반영되었습니다.`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '자필 서명 저장 중 확인이 필요합니다.');
    }
  };

  return (
    <div className="nexus-ceo-training-bridge" aria-label="04 대표이사 12개국어 안전교육 전파 및 이수율 구체 환류">
      <div className="nexus-ceo-training-head">
        <div>
          <span className="nexus-3axis-kicker">
            SLICE 3 · 고위험 공정·유사사례 → 04 대표이사 안전교육 초안 → 12개 국어·음성·모바일 서명 → 구체 이수율 환류
          </span>
          <h3>04 대표이사 안전교육 12개 국어 즉시 전파 & 이수율 환류 스튜디오</h3>
        </div>
        <span className="nexus-3axis-confidence">
          연계 시드 [{seed.caseCode}] · 구체 포인트 #{seed.structuralNodeIndex}
        </span>
      </div>

      <div className="nexus-ceo-draft-grid">
        <div className="nexus-ceo-draft-ko">
          <div className="nexus-ceo-box-head">
            <strong>
              {isField
                ? `${siteLabel ? `${siteLabel} · ` : ''}본사 하달 대표이사 안전교육 5단계 안내`
                : '원클릭 생성 대표이사 안전교육 한국어 5단계 원문'}
            </strong>
            {!isField && (
              <label className="nexus-ceo-target-input">
                <span>지정 교육 대상(분모)</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  aria-label="지정 교육 대상 인원"
                  value={targetWorkers}
                  onChange={e => setTargetWorkers(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                />
                <small>명</small>
              </label>
            )}
          </div>
          <pre className="nexus-ceo-pre">{draftPreview.sourceTextKo}</pre>
          {isField ? (
            <p className="nexus-3axis-case-row-meta">
              본사·대표이사에서 하달된 12개국어 안전교육 원문을 확인하고, 우측 모국어 음성 안내 후 아래 작업팀 서명 버튼으로 이수율을 실시간 환류하세요.
            </p>
          ) : (
            <div className="nexus-ceo-actions">
              <button
                type="button"
                className="nexus-3axis-submit"
                onClick={() => handleDispatch12Lang(false)}
              >
                12개국어 전 현장 즉시 발령 & 구체 환류 ↗
              </button>
              {onOpenAdminTraining && (
                <button
                  type="button"
                  className="nexus-ceo-studio-btn"
                  onClick={() => handleDispatch12Lang(true)}
                >
                  04 대표이사 안전교육 QR·음성 스튜디오로 초안 보내기 ↗
                </button>
              )}
            </div>
          )}
        </div>

        <div className="nexus-ceo-draft-multilingual">
          <div className="nexus-ceo-box-head">
            <strong>12개 국어 모국어 보호 안내 · 작업중지 지시 · 음성 미리듣기</strong>
            <button
              type="button"
              className="nexus-ceo-tts-btn"
              onClick={() =>
                handleSpeakPreview(
                  selectedLang,
                  draftPreview.multilingualPreviews[selectedLang] || draftPreview.sourceTextKo,
                )
              }
            >
              {speakingLang === selectedLang ? '🔊 음성 안내 중…' : `🔊 ${TRAINING_LANGUAGE_LABELS[selectedLang]} 음성 미리듣기`}
            </button>
          </div>
          <div className="nexus-ceo-lang-pills" role="group" aria-label="12개 국어 모국어 미리보기 선택">
            {NEXUS_CORE_12_LANGUAGES.map(code => (
              <button
                key={code}
                type="button"
                aria-pressed={selectedLang === code}
                onClick={() => setSelectedLang(code)}
              >
                <span>{TRAINING_LANGUAGE_FLAGS[code]}</span>
                <small>{TRAINING_LANGUAGE_LABELS[code]}</small>
              </button>
            ))}
          </div>
          <pre className="nexus-ceo-pre is-native">
            {draftPreview.multilingualPreviews[selectedLang] || draftPreview.sourceTextKo}
          </pre>
        </div>
      </div>

      {notice && (
        <p role="status" className="nexus-3axis-feedback">
          {notice}
        </p>
      )}

      {campaigns.length > 0 && (
        <div className="nexus-ceo-campaign-list" aria-label="전 현장 대표이사 안전교육 서명·이수율 환류 현황">
          <strong>전 현장 12개 국어 대표이사 안전교육 전파 · 모바일 서명 이수율 환류 ({campaigns.length}건)</strong>
          <ul>
            {campaigns.slice(0, 5).map(camp => (
              <li key={camp.campaignId} data-status={camp.status}>
                <div className="nexus-3axis-case-row-top">
                  <span>
                    <b>[{camp.matchedCaseCode} · 구체 #{camp.structuralNodeIndex}]</b> {camp.title}
                  </span>
                  <em className={'status-pill status-' + camp.status}>
                    {NEXUS_TRAINING_STATUS_LABELS[camp.status]} · 이수율 {camp.completionRatePct ?? 0}% ({camp.confirmedSignatures}/{camp.targetWorkers}명 · {camp.participatingNationalities}개국)
                  </em>
                </div>
                <div className="nexus-ceo-progress-track" aria-hidden="true">
                  <i style={{ width: `${camp.completionRatePct ?? 0}%` }} />
                </div>
                {camp.signedLanguages && camp.signedLanguages.length > 0 && (
                  <div className="nexus-ceo-signed-langs" aria-label="서명 완료 국적 작업팀">
                    <span>서명 참여 국적:</span>
                    {camp.signedLanguages.map(code => (
                      <em key={code}>{formatLanguageBadge(code)}</em>
                    ))}
                  </div>
                )}
                <div className="nexus-3axis-case-row-actions">
                  <button
                    type="button"
                    onClick={() => handleRecordWorkerSignature(camp.campaignId, selectedLang, 3)}
                  >
                    + {formatLanguageBadge(selectedLang)} 작업팀 3명 서명 환류
                  </button>
                  {(['vi-VN', 'cmn-CN', 'uz-UZ', 'km-KH'] as const)
                    .filter(code => code !== selectedLang && !camp.signedLanguages?.includes(code))
                    .slice(0, 2)
                    .map(code => (
                      <button
                        key={code}
                        type="button"
                        className="is-quick-nationality"
                        onClick={() => handleRecordWorkerSignature(camp.campaignId, code, 3)}
                      >
                        + {formatLanguageBadge(code)} 3명 서명
                      </button>
                    ))}
                  {camp.confirmedSignatures < camp.targetWorkers && (
                    <button
                      type="button"
                      onClick={() =>
                        handleRecordWorkerSignature(
                          camp.campaignId,
                          selectedLang,
                          camp.targetWorkers - camp.confirmedSignatures,
                        )
                      }
                    >
                      전원 서명·이수 100% 완료 확인
                    </button>
                  )}
                  {onOpenAdminTraining && (
                    <button
                      type="button"
                      onClick={() => {
                        stageExecutiveTrainingHandoff(camp.matchedCaseCode, {
                          targetWorkers: camp.targetWorkers,
                          dispatchImmediately: true,
                        });
                        onOpenAdminTraining(camp);
                      }}
                    >
                      QR·음성 스튜디오에서 열기 ↗
                    </button>
                  )}
                </div>

                {camp.workerSignatureReceipts && camp.workerSignatureReceipts.length > 0 && (
                  <div className="nexus-sig-receipts" aria-label="저장된 근로자 모국어 자필 서명 내역">
                    {camp.workerSignatureReceipts.slice(0, 6).map(rec => (
                      <div key={rec.signatureId} className="nexus-sig-receipt-chip">
                        <img src={rec.signatureDataUrl} alt={`${rec.workerName} 자필 서명`} />
                        <span>
                          <b>{formatLanguageBadge(rec.languageCode)}</b> · {rec.workerName}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <details className="nexus-qr-kiosk-details">
                  <summary>📱 현장 QR코드 · {formatLanguageBadge(selectedLang)} 자필 서명 키오스크 열기 ({camp.workerSignatureReceipts?.length ?? 0}명 자필 기록)</summary>
                  <div className="nexus-qr-kiosk-panel">
                    <div className="nexus-qr-card">
                      <QRCodeCanvas
                        value={`${typeof window !== 'undefined' ? window.location.origin : 'https://new-psi-eta.vercel.app'}/?mode=worker-kiosk&nexusTraining=${encodeURIComponent(camp.campaignId)}&lang=${encodeURIComponent(selectedLang)}`}
                        size={112}
                        bgColor="#ffffff"
                        fgColor="#0b1724"
                        level="M"
                      />
                      <small>{formatLanguageBadge(selectedLang)} 전용 교육 QR</small>
                    </div>
                    <div className="nexus-qr-sign-box">
                      <div className="nexus-qr-sign-head">
                        <label>
                          <span>서명 근로자 성명</span>
                          <input
                            type="text"
                            aria-label={`서명 근로자 성명 ${camp.matchedCaseCode}`}
                            value={workerNamesByCamp[camp.campaignId] ?? ''}
                            maxLength={60}
                            onChange={e =>
                              setWorkerNamesByCamp(prev => ({
                                ...prev,
                                [camp.campaignId]: e.target.value,
                              }))
                            }
                            placeholder="예: NGUYEN VAN A / 김형틀"
                          />
                        </label>
                        <button
                          type="button"
                          className="nexus-ceo-tts-btn"
                          onClick={() =>
                            handleSpeakPreview(
                              selectedLang,
                              camp.multilingualPreviews[selectedLang] || camp.sourceTextKo,
                            )
                          }
                        >
                          🔊 {TRAINING_LANGUAGE_LABELS[selectedLang]} 음성
                        </button>
                      </div>
                      <canvas
                        ref={el => {
                          sigCanvasRefs.current[camp.campaignId] = el;
                        }}
                        width={320}
                        height={110}
                        className="nexus-sig-canvas"
                        aria-label={`근로자 자필 서명 패드 ${camp.matchedCaseCode}`}
                        onPointerDown={e => handleSigPointerDown(camp.campaignId, e)}
                        onPointerMove={e => handleSigPointerMove(camp.campaignId, e)}
                        onPointerUp={() => handleSigPointerUp(camp.campaignId)}
                        onPointerLeave={() => handleSigPointerUp(camp.campaignId)}
                      />
                      <div className="nexus-3axis-case-row-actions">
                        <button
                          type="button"
                          onClick={() => clearSignatureCanvas(camp.campaignId)}
                        >
                          서명 지우기
                        </button>
                        <button
                          type="button"
                          className="nexus-3axis-submit"
                          onClick={() => handleSaveHandwrittenWorkerSignature(camp)}
                        >
                          ✍️ 모국어 이해 확인 · 자필 서명 저장
                        </button>
                      </div>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

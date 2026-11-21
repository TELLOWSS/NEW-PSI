import React, { useMemo, useState } from 'react';
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
  stageExecutiveTrainingHandoff,
  type NexusExecutiveTrainingCampaign,
} from '../../utils/nexusExecutiveTrainingPipeline';
import {
  NEXUS_STRUCTURAL_INCIDENT_SEEDS,
  type NexusStructuralIncidentSeed,
} from '../../utils/nexusStructuralTaxonomy';

interface Props {
  activeSeed?: NexusStructuralIncidentSeed;
  campaigns: readonly NexusExecutiveTrainingCampaign[];
  onCampaignsChange: (next: NexusExecutiveTrainingCampaign[]) => void;
  onOpenAdminTraining?: (campaign: NexusExecutiveTrainingCampaign) => void;
}

export const NexusExecutiveTrainingBridge: React.FC<Props> = ({
  activeSeed,
  campaigns,
  onCampaignsChange,
  onOpenAdminTraining,
}) => {
  const seed = activeSeed ?? NEXUS_STRUCTURAL_INCIDENT_SEEDS[0];
  const [selectedLang, setSelectedLang] = useState<TrainingLanguageCode>('vi-VN');
  const [targetWorkers, setTargetWorkers] = useState(12);
  const [speakingLang, setSpeakingLang] = useState<string>('');
  const [notice, setNotice] = useState('');

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
    onCampaignsChange([...updated]);
    setNotice(
      `${formatLanguageBadge(lang)} 작업팀 모국어 이해·서명 ${addCount}건이 황금 구체 이수율 시그널로 즉시 환류되었습니다.`,
    );
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
            <strong>원클릭 생성 대표이사 안전교육 한국어 5단계 원문</strong>
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
          </div>
          <pre className="nexus-ceo-pre">{draftPreview.sourceTextKo}</pre>
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

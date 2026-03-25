
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { WorkerRecord, AppSettings, ScoreAdjustmentReasonCode, ScoreAdjustmentEntry } from '../../types';
import { CircularProgress } from '../shared/CircularProgress';
import { updateAnalysisBasedOnEdits } from '../../services/geminiService';
import { exportEvidencePackageCsv, exportEvidencePackagePdf } from '../../utils/evidenceReportUtils';
import { deriveCompetencyProfile, enforceSafetyLevel, getApprovalBlockers } from '../../utils/evidenceUtils';
import { getSafetyLevelThresholds, getSafetyLevelFromScore } from '../../utils/safetyLevelUtils';

type MetricTone = 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose';

interface CompetencyMetricCardProps {
    label: string;
    score: number;
    maxScore?: number;
    subtitle: string;
    tone?: MetricTone;
    penalty?: boolean;
}

const normalizeScore = (value: number, maxScore: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(maxScore, Math.round(value)));
};

const metricToneClass: Record<MetricTone, { badge: string; bar: string; panel: string; text: string; track: string }> = {
    slate: { badge: 'bg-slate-100 text-slate-700', bar: 'bg-slate-700', panel: 'bg-slate-50 border-slate-200', text: 'text-slate-700', track: 'bg-slate-200' },
    indigo: { badge: 'bg-indigo-100 text-indigo-700', bar: 'bg-indigo-600', panel: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700', track: 'bg-indigo-100' },
    emerald: { badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-600', panel: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', track: 'bg-emerald-100' },
    amber: { badge: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500', panel: 'bg-amber-50 border-amber-200', text: 'text-amber-700', track: 'bg-amber-100' },
    rose: { badge: 'bg-rose-100 text-rose-700', bar: 'bg-rose-500', panel: 'bg-rose-50 border-rose-200', text: 'text-rose-700', track: 'bg-rose-100' },
};

const CompetencyMetricCard: React.FC<CompetencyMetricCardProps> = ({
    label,
    score,
    maxScore = 100,
    subtitle,
    tone = 'slate',
    penalty = false,
}) => {
    const safeScore = normalizeScore(score, maxScore);
    const progress = maxScore > 0 ? Math.max(0, Math.min(100, (safeScore / maxScore) * 100)) : 0;
    const toneClass = metricToneClass[tone];

    return (
        <div className={`rounded-2xl border p-4 ${toneClass.panel}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-black text-slate-800">{label}</p>
                    <p className="mt-1 text-[11px] font-medium text-slate-500 leading-relaxed">{subtitle}</p>
                </div>
                <div className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${toneClass.badge}`}>
                    {penalty ? `-${safeScore}` : `${safeScore}점`}
                </div>
            </div>
            <div className={`mt-3 h-2.5 overflow-hidden rounded-full ${toneClass.track}`}>
                <div className={`h-full rounded-full ${toneClass.bar}`} style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-slate-400">
                <span>{penalty ? '감점 규모' : '달성 수준'}</span>
                <span className={toneClass.text}>{safeScore}/{maxScore}</span>
            </div>
        </div>
    );
};

const buildReassessmentAuditNote = (before: WorkerRecord, updated: Partial<WorkerRecord>): string => {
    const beforeScore = typeof before.safetyScore === 'number' ? before.safetyScore : 0;
    const afterScore = typeof updated.safetyScore === 'number' ? updated.safetyScore : beforeScore;
    const beforeLevel = before.safetyLevel;
    const afterLevel = (updated.safetyLevel as WorkerRecord['safetyLevel']) || beforeLevel;

    const beforeReasons = Array.isArray(before.scoreReasoning) ? before.scoreReasoning : [];
    const afterReasons = Array.isArray(updated.scoreReasoning) ? updated.scoreReasoning : beforeReasons;
    const addedReasons = afterReasons.filter(reason => !beforeReasons.includes(reason)).slice(0, 2);

    const parts = [`점수 ${beforeScore}→${afterScore}`, `등급 ${beforeLevel}→${afterLevel}`];

    if (addedReasons.length > 0) {
        parts.push(`근거추가: ${addedReasons.join(' / ')}`);
    } else if (afterReasons.length > 0) {
        parts.push(`근거유지: ${afterReasons.slice(0, 2).join(' / ')}`);
    }

    return `2차 재가공 실행 (${parts.join(' | ')})`;
};

const SCORE_REASON_OPTIONS: Array<{ code: ScoreAdjustmentReasonCode; label: string; impact: string }> = [
    { code: 'BEHAVIOR_NON_COMPLIANCE', label: '현장 지적(행동 위반)', impact: '개선이행도·숙련도 중심 감점' },
    { code: 'UNDERSTANDING_GAP', label: '수기 위험성평가 이해도 부족', impact: '위험성평가 이해도·업무이해도 중심 감점' },
    { code: 'DOCUMENT_INCONSISTENCY', label: '문서 내용 불일치', impact: '무결성·이해도 교차 감점' },
    { code: 'EVIDENCE_INSUFFICIENT', label: '증빙 부족/확인 불가', impact: '무결성 점수 중심 감점' },
    { code: 'OTHER', label: '기타(관리자 수기 판단)', impact: '관리자 근거 기반 감점' },
];

interface RecordDetailModalProps {
    record: WorkerRecord;
    onClose: () => void;
    onBack: () => void;
    onUpdateRecord: (record: WorkerRecord) => Promise<void> | void;
    onOpenReport: (record: WorkerRecord) => void;
    onReanalyze: (record: WorkerRecord) => Promise<WorkerRecord | null>;
    isReanalyzing: boolean;
}

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({ record: initialRecord, onClose, onBack, onUpdateRecord, onOpenReport, onReanalyze, isReanalyzing }) => {
    const [record, setRecord] = useState<WorkerRecord>(initialRecord);
    const [activeTab, setActiveTab] = useState<'info' | 'analysis' | 'qna'>('info');
    const [hasChanges, setHasChanges] = useState(false);
    const [isUpdatingAnalysis, setIsUpdatingAnalysis] = useState(false);
    const [actionType, setActionType] = useState('재교육');
    const [actionDetail, setActionDetail] = useState('');
    const [approvalComment, setApprovalComment] = useState('');
    const [pendingApprovalAction, setPendingApprovalAction] = useState<'approved' | 'rejected' | null>(null);
    const [approverRole, setApproverRole] = useState<'safety-manager' | 'site-manager'>('safety-manager');
    const [strictRoleGate, setStrictRoleGate] = useState(false);
    const [scoreReasonCode, setScoreReasonCode] = useState<ScoreAdjustmentReasonCode | ''>('');
    const [scoreReasonDetail, setScoreReasonDetail] = useState('');
    const [scoreEvidenceSummary, setScoreEvidenceSummary] = useState('');
    
    const docInputRef = useRef<HTMLInputElement>(null); // For Document Image
    const profileInputRef = useRef<HTMLInputElement>(null); // For Profile Photo

    const getConsistentRecord = (baseRecord: WorkerRecord): WorkerRecord => {
        const withCompetency = {
            ...baseRecord,
            competencyProfile: deriveCompetencyProfile(baseRecord),
        };
        return enforceSafetyLevel(withCompetency);
    };

    useEffect(() => { 
        setRecord(getConsistentRecord(initialRecord)); 
        setHasChanges(false); 
        setScoreReasonCode('');
        setScoreReasonDetail('');
        setScoreEvidenceSummary('');
    }, [initialRecord]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem('psi_app_settings');
            if (!raw) return;
            const parsed = JSON.parse(raw) as AppSettings;
            setStrictRoleGate(Boolean(parsed.approvalPolicy?.strictRoleGate));
        } catch {
            setStrictRoleGate(false);
        }
    }, []);

    const handleChange = <K extends keyof WorkerRecord>(field: K, value: WorkerRecord[K]) => {
        setRecord(prev => getConsistentRecord({ ...prev, [field]: value } as WorkerRecord));
        setHasChanges(true);
    };

    const scoreDropAmount = useMemo(() => {
        const before = typeof initialRecord.safetyScore === 'number' ? initialRecord.safetyScore : 0;
        const after = typeof record.safetyScore === 'number' ? record.safetyScore : 0;
        return Math.max(0, before - after);
    }, [initialRecord.safetyScore, record.safetyScore]);

    const safetyLevelThresholds = useMemo(() => getSafetyLevelThresholds(), []);
    const gradeExampleFor69 = useMemo(() => getSafetyLevelFromScore(69), []);

    const competencyMetrics = useMemo(() => {
        const profile = deriveCompetencyProfile(record);

        return [
        {
            label: '심리 지표',
            score: profile.psychologicalScore,
            subtitle: '작성 태도와 집중도 기반 안정성',
            tone: 'indigo' as const,
        },
        {
            label: '업무 이해도',
            score: profile.jobUnderstandingScore,
            subtitle: '공종·절차·역할 이해 수준',
            tone: 'emerald' as const,
        },
        {
            label: '위험성평가 이해도',
            score: profile.riskAssessmentUnderstandingScore,
            subtitle: '위험요인과 보호조치 연결 수준',
            tone: 'amber' as const,
        },
        {
            label: '숙련도',
            score: profile.proficiencyScore,
            subtitle: '0~5 일반론, 6~15 단일조치, 16~23 단계별 실무조치, 24~30 수치·통제 범위 명시',
            tone: 'slate' as const,
        },
        {
            label: '개선이행도',
            score: profile.improvementExecutionScore,
            subtitle: '0~5 실행계획 모호, 6~13 조치 2개+, 14~17 3개+ 흐름 명확, 18~20 담당·시점·확인방법 명시',
            tone: 'indigo' as const,
        },
        {
            label: '반복위반 페널티',
            score: profile.repeatViolationPenalty,
            maxScore: 20,
            subtitle: '반복 위반 신호에 따른 감점',
            tone: 'rose' as const,
            penalty: true,
        },
    ];
    }, [record]);

    const scoreDropNeedsIntegrityReason = scoreDropAmount > 0;

    const buildScoreAdjustmentEntry = (): ScoreAdjustmentEntry | null => {
        if (!scoreDropNeedsIntegrityReason) return null;

        const previousScore = typeof initialRecord.safetyScore === 'number' ? initialRecord.safetyScore : 0;
        const nextScore = typeof record.safetyScore === 'number' ? record.safetyScore : 0;

        if (!scoreReasonCode) {
            alert('점수 하향 사유 코드를 선택해주세요.');
            return null;
        }
        if (scoreReasonDetail.trim().length < 3) {
            alert('점수 하향 상세 사유를 3자 이상 입력해주세요.');
            return null;
        }
        if (scoreEvidenceSummary.trim().length < 3) {
            alert('증빙 요약(현장 지적/기록 근거)을 3자 이상 입력해주세요.');
            return null;
        }

        return {
            timestamp: new Date().toISOString(),
            actor: 'manager',
            previousScore,
            nextScore,
            reasonCode: scoreReasonCode,
            reasonDetail: scoreReasonDetail.trim(),
            evidenceSummary: scoreEvidenceSummary.trim(),
        };
    };

    const handleSave = () => {
        const approvalWasFinalized =
            record.reviewStatus === 'APPROVED' ||
            record.approvalStatus === 'APPROVED' ||
            record.approvalStatus === 'OVERRIDDEN';

        const shouldResetApproval = approvalWasFinalized && hasCriticalReviewEdits;

        const scoreAdjustmentEntry = buildScoreAdjustmentEntry();
        if (scoreDropNeedsIntegrityReason && !scoreAdjustmentEntry) return;

        const nextRecordBase: WorkerRecord = shouldResetApproval
            ? {
                ...record,
                reviewStatus: 'PENDING',
                approvalStatus: 'PENDING',
                approvedBy: undefined,
                approvedAt: undefined,
                auditTrail: [
                    ...(record.auditTrail || []),
                    {
                        stage: 'validation',
                        timestamp: new Date().toISOString(),
                        actor: 'manager',
                        note: '핵심 항목 수정으로 승인 상태를 재검토 대기로 전환',
                    }
                ],
            }
            : record;

        const nextRecord: WorkerRecord = scoreAdjustmentEntry
            ? {
                ...nextRecordBase,
                scoreAdjustmentHistory: [
                    ...(nextRecordBase.scoreAdjustmentHistory || []),
                    scoreAdjustmentEntry,
                ],
                auditTrail: [
                    ...(nextRecordBase.auditTrail || []),
                    {
                        stage: 'validation',
                        timestamp: new Date().toISOString(),
                        actor: 'manager',
                        note: `점수 하향 무결성 검증: ${scoreAdjustmentEntry.reasonCode} | ${scoreAdjustmentEntry.reasonDetail} | 증빙: ${scoreAdjustmentEntry.evidenceSummary}`,
                    }
                ],
            }
            : nextRecordBase;

        const consistentRecord = getConsistentRecord(nextRecord);
        onUpdateRecord(consistentRecord);
        setRecord(consistentRecord);
        setScoreReasonCode('');
        setScoreReasonDetail('');
        setScoreEvidenceSummary('');
        setHasChanges(false);
        alert(shouldResetApproval ? '저장되었습니다. 핵심 변경으로 승인 상태가 재검토 대기로 변경되었습니다.' : '저장되었습니다.');
    };

    const hasCriticalReviewEdits = useMemo(() => {
        const watchFields: (keyof WorkerRecord)[] = [
            'safetyScore',
            'safetyLevel',
            'fullText',
            'koreanTranslation',
            'aiInsights',
            'aiInsights_native',
            'strengths',
            'weakAreas',
            'suggestions',
            'handwrittenAnswers',
        ];

        return watchFields.some((field) => JSON.stringify(initialRecord[field]) !== JSON.stringify(record[field]));
    }, [initialRecord, record]);

    const runSecondaryProcessing = async (baseRecord: WorkerRecord): Promise<WorkerRecord> => {
        setIsUpdatingAnalysis(true);
        try {
            const updatedAnalysis = await updateAnalysisBasedOnEdits(baseRecord);
            if (updatedAnalysis) {
                return {
                    ...baseRecord,
                    ...updatedAnalysis,
                    auditTrail: [
                        ...(baseRecord.auditTrail || []),
                        {
                            stage: 'reassessment',
                            timestamp: new Date().toISOString(),
                            actor: 'manager',
                            note: buildReassessmentAuditNote(baseRecord, updatedAnalysis),
                        }
                    ]
                };
            }

            return {
                ...baseRecord,
                auditTrail: [
                    ...(baseRecord.auditTrail || []),
                    {
                        stage: 'reassessment',
                        timestamp: new Date().toISOString(),
                        actor: 'manager',
                        note: '2차 재가공 실패: AI가 갱신 결과를 반환하지 않음',
                    }
                ]
            };
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'unknown error';
            return {
                ...baseRecord,
                auditTrail: [
                    ...(baseRecord.auditTrail || []),
                    {
                        stage: 'reassessment',
                        timestamp: new Date().toISOString(),
                        actor: 'manager',
                        note: `2차 재가공 오류: ${errorMessage}`,
                    }
                ]
            };
        } finally {
            setIsUpdatingAnalysis(false);
        }
    };

    const showReviewCommentField = hasCriticalReviewEdits || pendingApprovalAction === 'rejected' || approvalComment.trim().length > 0;

    const handleOpenReportClick = () => {
        if (hasChanges) {
            const shouldSaveFirst = confirm('저장되지 않은 변경사항이 있습니다.\n1차 저장 후 안전 리포트로 이동하시겠습니까?');
            if (shouldSaveFirst) {
                onUpdateRecord(record);
                setHasChanges(false);
            }
        }
        onOpenReport(record);
    };

    const handleAddAction = () => {
        if (!actionDetail.trim()) {
            alert('조치 내용을 입력해주세요.');
            return;
        }
        const nextRecord: WorkerRecord = getConsistentRecord({
            ...record,
            actionHistory: [
                ...(record.actionHistory || []),
                {
                    timestamp: new Date().toISOString(),
                    actor: 'manager',
                    actionType,
                    detail: actionDetail.trim(),
                }
            ],
            auditTrail: [
                ...(record.auditTrail || []),
                {
                    stage: 'action',
                    timestamp: new Date().toISOString(),
                    actor: 'manager',
                    note: `${actionType}: ${actionDetail.trim()}`,
                }
            ]
        });
        setRecord(nextRecord);
        onUpdateRecord(nextRecord);
        setActionDetail('');
        setHasChanges(false);
        alert('조치 이력이 등록되었습니다.');
    };

    const handleApprove = async (status: 'approved' | 'rejected') => {
        setPendingApprovalAction(status);

        if (status === 'approved') {
            const effectiveRole = strictRoleGate ? 'safety-manager' : approverRole;
            const blockers = getApprovalBlockers(record, effectiveRole);
            if (blockers.length > 0) {
                const nextRecord: WorkerRecord = {
                    ...record,
                    auditTrail: [
                        ...(record.auditTrail || []),
                        {
                            stage: 'validation',
                            timestamp: new Date().toISOString(),
                            actor: 'safety-manager',
                            note: `승인 차단: ${blockers.join(' | ')}`,
                        }
                    ]
                };
                setRecord(nextRecord);
                await onUpdateRecord(nextRecord);
                alert(`승인을 진행할 수 없습니다.\n(검증 기준: ${effectiveRole === 'safety-manager' ? '안전관리자(엄격)' : '현장소장(기본)'})\n\n${blockers.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}`);
                return;
            }
        }

        const trimmedComment = approvalComment.trim();
        const commentRequired = status === 'rejected' || hasCriticalReviewEdits;
        if (commentRequired && trimmedComment.length === 0) {
            alert(status === 'rejected'
                ? '반려 사유(Comment)는 필수입니다.'
                : '수정 사항이 있으므로 승인 사유(Comment)는 필수입니다.');
            return;
        }

        const scoreAdjustmentEntry = buildScoreAdjustmentEntry();
        if (scoreDropNeedsIntegrityReason && !scoreAdjustmentEntry) {
            setPendingApprovalAction(null);
            return;
        }

        const nextRecordBase: WorkerRecord = {
            ...record,
            reviewStatus: status === 'approved' ? 'APPROVED' : 'REJECTED',
            adminComment: trimmedComment || undefined,
            reviewReason: trimmedComment || undefined,
            approvalStatus: status === 'approved' ? 'APPROVED' : 'PENDING',
            approvedBy: status === 'approved' ? 'safety-manager' : record.approvedBy,
            approvedAt: status === 'approved' ? new Date().toISOString() : record.approvedAt,
            approvalReason: trimmedComment || record.approvalReason,
            approvalHistory: [
                ...(record.approvalHistory || []),
                {
                    timestamp: new Date().toISOString(),
                    actor: 'safety-manager',
                    status,
                    comment: trimmedComment || undefined,
                }
            ],
            auditTrail: [
                ...(record.auditTrail || []),
                {
                    stage: 'approval',
                    timestamp: new Date().toISOString(),
                    actor: 'safety-manager',
                    note: status === 'approved'
                        ? `최종 승인${trimmedComment ? ` (${trimmedComment})` : ''}`
                        : `반려${trimmedComment ? ` (${trimmedComment})` : ''}`,
                }
            ]
        };

        const nextRecord: WorkerRecord = getConsistentRecord(scoreAdjustmentEntry
            ? {
                ...nextRecordBase,
                scoreAdjustmentHistory: [
                    ...(nextRecordBase.scoreAdjustmentHistory || []),
                    scoreAdjustmentEntry,
                ],
                auditTrail: [
                    ...(nextRecordBase.auditTrail || []),
                    {
                        stage: 'validation',
                        timestamp: new Date().toISOString(),
                        actor: 'manager',
                        note: `점수 하향 무결성 검증: ${scoreAdjustmentEntry.reasonCode} | ${scoreAdjustmentEntry.reasonDetail} | 증빙: ${scoreAdjustmentEntry.evidenceSummary}`,
                    }
                ],
            }
            : nextRecordBase);

        if (status === 'rejected') {
            setRecord(nextRecord);
            await onUpdateRecord(nextRecord);
            setScoreReasonCode('');
            setScoreReasonDetail('');
            setScoreEvidenceSummary('');
            setApprovalComment('');
            setPendingApprovalAction(null);
            setHasChanges(false);
            alert('반려 처리되었습니다.');
            return;
        }

        const finalApprovedRecord = await runSecondaryProcessing(nextRecord);
        const consistentFinalRecord = getConsistentRecord(finalApprovedRecord);
        setRecord(consistentFinalRecord);
        await onUpdateRecord(consistentFinalRecord);
        setScoreReasonCode('');
        setScoreReasonDetail('');
        setScoreEvidenceSummary('');
        setApprovalComment('');
        setPendingApprovalAction(null);
        setHasChanges(false);
        alert('최종 승인 처리되었습니다. 코멘트 기반 확정 데이터로 2차 가공이 실행되었습니다.');
    };

    const handleAnswerChange = (index: number, field: 'answerText' | 'koreanTranslation', value: string) => {
        const updated = [...(record.handwrittenAnswers || [])];
        if (!updated[index]) return;
        updated[index] = {
            ...updated[index],
            [field]: value,
        };
        handleChange('handwrittenAnswers', updated);
    };

    const handleExportEvidencePdf = async () => {
        await exportEvidencePackagePdf(record);
    };

    const handleExportEvidenceCsv = () => {
        exportEvidencePackageCsv(record);
    };

    const handleReanalyzeClick = async () => {
        if(confirm("이미지를 다시 OCR로 분석하시겠습니까? (현재 수정사항은 사라질 수 있습니다)")) {
            const updatedRecord = await onReanalyze(record);
            if (updatedRecord) {
                setRecord(getConsistentRecord(updatedRecord));
                alert('이미지 재분석이 완료되었습니다.');
            }
        }
    };

    const handleReflectChanges = async () => {
        alert('2차 가공은 승인 코멘트가 포함된 [최종 승인]에서만 자동 실행됩니다.');
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'original' | 'profile') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result as string;
                if (result) {
                    if (type === 'original') {
                        setRecord(prev => ({ ...prev, originalImage: result, filename: file.name }));
                    } else {
                        setRecord(prev => ({ ...prev, profileImage: result }));
                    }
                    setHasChanges(true);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const hasOriginalImage = !!record.originalImage && record.originalImage.length > 50;
    const hasProfileImage = !!record.profileImage && record.profileImage.length > 50;
    const competencyProfile = useMemo(() => deriveCompetencyProfile(record), [record]);
    const isKorean = record.nationality === '대한민국' || record.nationality === '한국' || (record.nationality || '').toLowerCase().includes('korea');
    const timelineLocale = isKorean ? 'ko-KR' : 'en-US';
    const timelineDateTimeOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    };
    const reassessmentTitle = isKorean ? '재평가(Reassessment) 전용 타임라인' : 'Reassessment Timeline';
    const reassessmentEmpty = isKorean ? '재평가 이력이 없습니다.' : 'No reassessment history.';
    const reassessmentTag = isKorean ? '[재평가]' : '[reassessment]';
    const reassessmentTrail = (record.auditTrail || []).filter(entry => entry.stage === 'reassessment').slice(-10).reverse();
    
    // Icon Display
    const isLeader = (record.role === 'leader') || (record.name === record.teamLeader);
    const isSubLeader = record.role === 'sub_leader';

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex justify-center items-center p-2 sm:p-4 backdrop-blur-md" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden animate-fade-in-up" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white z-20 shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                        <div>
                            <h2 className="text-xl font-black text-slate-800">기록 상세 검증</h2>
                            <p className="text-[10px] text-indigo-500 font-bold tracking-widest uppercase">OCR Verification Mode</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {hasChanges && (
                            <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-black shadow-lg shadow-indigo-200 animate-pulse">1차 저장 (기본정보)</button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                </header>

                <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
                    {/* LEFT: DOCUMENT IMAGE AREA */}
                    <div className="w-full lg:w-[50%] bg-slate-900 overflow-y-auto custom-scrollbar relative border-r border-slate-800 p-8 flex flex-col items-center">
                        <div className="sticky top-0 left-0 z-10 mb-6 w-full flex justify-between items-center gap-4">
                            <div className="flex flex-col items-start min-w-0 flex-1">
                                <span className="bg-black/60 text-white text-[10px] font-black px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md uppercase tracking-widest mb-1">위험성 평가표 원본</span>
                                {record.filename && (
                                    <span className="text-xs text-slate-400 font-bold bg-slate-800/80 px-3 py-1.5 rounded border border-slate-700 max-w-full truncate" title={record.filename}>
                                        📄 {record.filename}
                                    </span>
                                )}
                            </div>
                            <button 
                                onClick={() => docInputRef.current?.click()}
                                className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold px-3 py-1.5 rounded-full backdrop-blur-md border border-white/20 transition-all flex items-center gap-2 shrink-0"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                {hasOriginalImage ? '문서 교체' : '문서 등록'}
                            </button>
                            <input type="file" ref={docInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'original')} />
                        </div>
                        
                        {hasOriginalImage ? (
                            <div className="w-full max-w-2xl bg-white shadow-2xl p-1 animate-fade-in group relative">
                                <img 
                                    src={record.originalImage} 
                                    className="w-full h-auto block" 
                                    alt="Scanned Document"
                                />
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                                <svg className="w-20 h-20 mb-4 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <p className="font-black text-lg opacity-30 tracking-tight">원본 이미지가 없습니다.</p>
                                <button 
                                    onClick={() => docInputRef.current?.click()}
                                    className="mt-6 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2"
                                >
                                    문서 이미지 업로드
                                </button>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: PROFILE & INFO EDIT AREA */}
                    <div className="w-full lg:w-[50%] flex flex-col bg-slate-50 overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
                                <h4 className="text-sm font-black text-indigo-800 mb-2">모바일 작업 순서 안내</h4>
                                <p className="text-xs text-indigo-700 font-bold leading-relaxed">
                                    1) 근로자 정보 수정 → 2) 상단 <span className="underline">1차 저장</span> → 3) 하단 승인영역 코멘트 작성 → 4) <span className="underline">최종 승인</span>(2차 가공 자동 실행) → 5) 안전 리포트 보기
                                </p>
                            </div>

                            <div className="lg:hidden bg-white border border-slate-200 rounded-2xl p-2 grid grid-cols-3 gap-2 sticky top-0 z-10 shadow-sm">
                                <button
                                    onClick={handleSave}
                                    disabled={!hasChanges}
                                    className={`px-2 py-2 rounded-xl text-[11px] font-black transition-colors ${hasChanges ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                                >
                                    1차 저장
                                </button>
                                <button
                                    onClick={() => { void handleApprove('approved'); }}
                                    disabled={isUpdatingAnalysis || (hasCriticalReviewEdits && approvalComment.trim().length === 0)}
                                    className={`px-2 py-2 rounded-xl text-[11px] font-black transition-colors ${isUpdatingAnalysis || (hasCriticalReviewEdits && approvalComment.trim().length === 0) ? 'bg-slate-100 text-slate-400' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                                >
                                    최종 승인(수정)
                                </button>
                                <button
                                    onClick={handleOpenReportClick}
                                    className="px-2 py-2 rounded-xl text-[11px] font-black bg-slate-900 text-white"
                                >
                                    3차 리포트
                                </button>
                            </div>
                            
                            {/* 1. Profile Photo Section (NEW) */}
                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-6">
                                <div className="relative group shrink-0">
                                    <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 border-2 border-slate-200 shadow-inner flex items-center justify-center relative">
                                        {hasProfileImage ? (
                                            <img src={record.profileImage} className="w-full h-full object-cover" alt="Profile" />
                                        ) : (
                                            <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        )}
                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        </div>
                                        <input type="file" ref={profileInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'profile')} />
                                        <button onClick={() => profileInputRef.current?.click()} className="absolute inset-0 w-full h-full cursor-pointer"></button>
                                    </div>
                                    <div className="absolute -bottom-2 -right-2 bg-indigo-600 text-white p-1.5 rounded-full shadow border-2 border-white pointer-events-none">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-black text-slate-900 mb-1">증명사진(프로필) 등록</h3>
                                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                        이곳에 등록된 사진은 <strong>사원증(ID Card)</strong> 및 <strong>개인 리포트</strong>의 프로필 영역에 사용됩니다. 
                                        문서 이미지와 별도로 관리됩니다.
                                    </p>
                                    {!hasProfileImage && (
                                        <button onClick={() => profileInputRef.current?.click()} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">
                                            + 사진 업로드하기
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xs font-black text-indigo-600 flex items-center gap-3 uppercase tracking-widest">
                                        <span className="p-1.5 bg-indigo-50 rounded-lg">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </span>
                                        근로자 기본 정보 수정
                                    </h3>
                                    <button 
                                        onClick={handleReflectChanges} 
                                        disabled={isUpdatingAnalysis}
                                        className="text-[10px] font-bold bg-violet-100 text-violet-700 px-3 py-1.5 rounded-lg hover:bg-violet-200 transition-colors flex items-center gap-1"
                                    >
                                        {isUpdatingAnalysis ? (
                                            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        ) : (
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        )}
                                        승인 전 직접 실행 불가
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">
                                                근로자 성명 
                                                {isLeader && <span className="text-yellow-500 ml-1">👑</span>}
                                                {isSubLeader && <span className="text-slate-400 ml-1">🛡️</span>}
                                                {record.isTranslator && <span className="text-blue-500 ml-1">🗣️</span>}
                                                {record.isSignalman && <span className="text-green-500 ml-1">🚦</span>}
                                            </label>
                                            <input 
                                                type="text" 
                                                value={record.name} 
                                                onChange={(e) => handleChange('name', e.target.value)}
                                                className="w-full text-2xl font-black p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 h-[72px]"
                                                placeholder="성명 확인/수정"
                                            />
                                        </div>
                                        <div className="w-40 shrink-0">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px] text-center">직급 (Hierarchy)</label>
                                            <div className="relative h-[72px]">
                                                <select 
                                                    value={record.role || 'worker'} 
                                                    onChange={(e) => handleChange('role', e.target.value)}
                                                    className={`w-full h-full px-4 rounded-2xl font-black text-xs appearance-none cursor-pointer border-2 transition-all shadow-sm focus:outline-none focus:ring-4 focus:ring-opacity-20
                                                        ${record.role === 'leader' 
                                                            ? 'bg-yellow-50 text-yellow-800 border-yellow-300 focus:ring-yellow-400' 
                                                            : record.role === 'sub_leader' 
                                                                ? 'bg-slate-100 text-slate-700 border-slate-300 focus:ring-slate-400' 
                                                                : 'bg-white text-slate-600 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500'}`}
                                                >
                                                    <option value="worker">일반 팀원</option>
                                                    <option value="sub_leader">부팀장/반장</option>
                                                    <option value="leader">팀장/소장</option>
                                                </select>
                                                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                                                    <svg className={`w-5 h-5 ${
                                                        record.role === 'leader' ? 'text-yellow-600' :
                                                        'text-slate-400'
                                                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Duties Selection */}
                                    <div className="p-4 bg-slate-100 rounded-xl border border-slate-200">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 tracking-[2px]">특수 임무 부여 (겸직 가능)</label>
                                        <div className="flex gap-4">
                                            <label className={`flex-1 flex items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all ${record.isTranslator ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                                                <input type="checkbox" checked={!!record.isTranslator} onChange={(e) => handleChange('isTranslator', e.target.checked)} className="hidden" />
                                                <span className="text-xl mr-2">🗣️</span>
                                                <span className="font-bold text-sm">통역 담당</span>
                                            </label>
                                            <label className={`flex-1 flex items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all ${record.isSignalman ? 'bg-green-50 border-green-400 text-green-700 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                                                <input type="checkbox" checked={!!record.isSignalman} onChange={(e) => handleChange('isSignalman', e.target.checked)} className="hidden" />
                                                <span className="text-xl mr-2">🚦</span>
                                                <span className="font-bold text-sm">신호수/유도원</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">공종</label>
                                            <input type="text" value={record.jobField} onChange={(e) => handleChange('jobField', e.target.value)} className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">팀장 (Team Leader)</label>
                                            <input 
                                                type="text" 
                                                value={record.teamLeader || ""} 
                                                onChange={(e) => handleChange('teamLeader', e.target.value)} 
                                                placeholder="예: 홍길동 팀장"
                                                className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600" 
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">사번 (Employee ID)</label>
                                            <input
                                                type="text"
                                                value={record.employeeId || ''}
                                                onChange={(e) => handleChange('employeeId', e.target.value)}
                                                placeholder="예: EMP-2026-001"
                                                className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">QR 식별자 (QR ID)</label>
                                            <input
                                                type="text"
                                                value={record.qrId || ''}
                                                onChange={(e) => handleChange('qrId', e.target.value)}
                                                placeholder="예: QR-7F3A"
                                                className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">국적 (AI 번역 기준)</label>
                                            <select 
                                                value={record.nationality} 
                                                onChange={(e) => handleChange('nationality', e.target.value)} 
                                                className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600 appearance-none"
                                            >
                                                <option value="한국">한국 (Korea)</option>
                                                <option value="중국">중국 (China)</option>
                                                <option value="베트남">베트남 (Vietnam)</option>
                                                <option value="태국">태국 (Thailand)</option>
                                                <option value="캄보디아">캄보디아 (Cambodia)</option>
                                                <option value="인도네시아">인도네시아 (Indonesia)</option>
                                                <option value="우즈베키스탄">우즈베키스탄 (Uzbekistan)</option>
                                                <option value="몽골">몽골 (Mongolia)</option>
                                                <option value="카자흐스탄">카자흐스탄 (Kazakhstan)</option>
                                                <option value="필리핀">필리핀 (Philippines)</option>
                                                <option value="네팔">네팔 (Nepal)</option>
                                                <option value="미얀마">미얀마 (Myanmar)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">작성일 (Date)</label>
                                            <input 
                                                type="date" 
                                                value={record.date} 
                                                onChange={(e) => handleChange('date', e.target.value)}
                                                className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 p-1.5 bg-slate-200 rounded-2xl shrink-0">
                                {['info', 'analysis', 'qna'].map(t => (
                                    <button key={t} onClick={() => setActiveTab(t as 'info' | 'analysis' | 'qna')} className={`flex-1 py-3 text-xs font-black rounded-xl transition-all ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                        {t === 'info' ? '성과지표' : t === 'analysis' ? 'AI 인사이트' : '수기 답변'}
                                    </button>
                                ))}
                            </div>

                            <div className="min-h-[300px]">
                                {activeTab === 'info' && (
                                    <div className="space-y-4">
                                        <div className="bg-white p-10 rounded-3xl shadow-sm border border-slate-200 flex items-center justify-between group">
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-[3px]">SAFETY SCORE</p>
                                                <input 
                                                    type="number" 
                                                    value={record.safetyScore} 
                                                    onChange={(e) => handleChange('safetyScore', parseInt(e.target.value) || 0)}
                                                    className="text-8xl font-black text-slate-900 w-48 focus:outline-none bg-transparent"
                                                />
                                                <p className="text-xs text-slate-500 font-bold mt-2">
                                                    OCR 신뢰도: {typeof record.ocrConfidence === 'number' ? `${(record.ocrConfidence * 100).toFixed(0)}%` : 'N/A'}
                                                </p>
                                                <p className="text-xs text-slate-500 font-bold mt-1">
                                                    무결성 점수: {typeof record.integrityScore === 'number' ? `${record.integrityScore}점` : 'N/A'}
                                                </p>
                                                <p className="text-xs text-slate-500 font-bold mt-1 break-all">
                                                    증빙 해시: {record.evidenceHash || 'N/A'}
                                                </p>
                                                <p className="text-xs text-indigo-600 font-bold mt-2">
                                                    종합역량 점수(P): {competencyProfile.weightedScore}점 ({competencyProfile.weightVersion})
                                                </p>
                                                <p className="text-xs text-emerald-700 font-bold mt-2">
                                                    등급 기준: 고급 ≥ {safetyLevelThresholds.advancedMin}, 중급 ≥ {safetyLevelThresholds.intermediateMin}, 초급 &lt; {safetyLevelThresholds.intermediateMin} (예: 69점 = {gradeExampleFor69})
                                                </p>
                                            </div>
                                            <CircularProgress score={record.safetyScore} level={record.safetyLevel} />
                                        </div>

                                        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
                                            <h4 className="text-sm font-black text-slate-800 mb-4">개인 안전역량 세부지표</h4>
                                            <p className="text-[11px] font-bold text-slate-500 mb-4">
                                                채점 루브릭 안내: 숙련도(④)는 검증 가능한 실무 행동의 구체성, 개선이행도(⑤)는 실행 계획의 명확성(담당·시점·확인방법) 중심으로 평가됩니다.
                                            </p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                {competencyMetrics.map((metric) => (
                                                    <CompetencyMetricCard
                                                        key={metric.label}
                                                        label={metric.label}
                                                        score={metric.score}
                                                        maxScore={metric.maxScore}
                                                        subtitle={metric.subtitle}
                                                        tone={metric.tone}
                                                        penalty={metric.penalty}
                                                    />
                                                ))}
                                            </div>
                                        </div>

                                        {scoreDropNeedsIntegrityReason && (
                                            <div className="bg-white p-5 sm:p-6 rounded-3xl border border-rose-200 shadow-sm">
                                                <h4 className="text-sm font-black text-rose-700 mb-2">점수 하향 무결성 검증 (필수)</h4>
                                                <p className="text-xs text-slate-600 font-bold mb-3">점수 하향: {initialRecord.safetyScore} → {record.safetyScore} (총 {scoreDropAmount}점 하향)</p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <select
                                                        value={scoreReasonCode}
                                                        onChange={(e) => setScoreReasonCode(e.target.value as ScoreAdjustmentReasonCode)}
                                                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                                                    >
                                                        <option value="">사유 코드 선택</option>
                                                        {SCORE_REASON_OPTIONS.map((item) => (
                                                            <option key={item.code} value={item.code}>{item.label}</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="text"
                                                        value={scoreEvidenceSummary}
                                                        onChange={(e) => setScoreEvidenceSummary(e.target.value)}
                                                        placeholder="증빙 요약 (예: 현장 지적 2건, 작업전 TBM 미이행)"
                                                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                                                    />
                                                </div>
                                                <textarea
                                                    value={scoreReasonDetail}
                                                    onChange={(e) => setScoreReasonDetail(e.target.value)}
                                                    placeholder="상세 사유 (행동 위반/이해도 부족/문서불일치 등 분리 기재)"
                                                    className="mt-3 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium min-h-[72px]"
                                                />
                                                <div className="mt-2 text-[11px] text-slate-500 font-bold">
                                                    {scoreReasonCode
                                                        ? `영향 지표: ${SCORE_REASON_OPTIONS.find((item) => item.code === scoreReasonCode)?.impact || '-'}`
                                                        : '영향 지표: 사유 코드를 선택하면 표시됩니다.'}
                                                </div>
                                            </div>
                                        )}

                                        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
                                            <h4 className="text-sm font-black text-slate-800 mb-4">조치 이력 등록 (S165/S166)</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm">
                                                    <option value="재교육">재교육</option>
                                                    <option value="현장코칭">현장코칭</option>
                                                    <option value="작업중지">작업중지</option>
                                                    <option value="보호구개선">보호구개선</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    value={actionDetail}
                                                    onChange={(e) => setActionDetail(e.target.value)}
                                                    placeholder="조치 상세 내용"
                                                    className="md:col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                                                />
                                            </div>
                                            <div className="mt-3 flex justify-end">
                                                <button onClick={handleAddAction} className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-black hover:bg-indigo-700">조치 이력 추가</button>
                                            </div>
                                            <div className="mt-3 text-xs text-slate-500 font-bold">누적 조치 이력: {(record.actionHistory || []).length}건</div>
                                        </div>

                                        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
                                            <h4 className="text-sm font-black text-slate-800 mb-4">승인/검토 처리 (S350)</h4>
                                            {!strictRoleGate && (
                                                <div className="mb-3">
                                                    <label className="block text-[11px] font-black text-slate-500 mb-1">승인권자 기준</label>
                                                    <select
                                                        value={approverRole}
                                                        onChange={(e) => setApproverRole(e.target.value as 'safety-manager' | 'site-manager')}
                                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold"
                                                    >
                                                        <option value="safety-manager">안전관리자(엄격 검증)</option>
                                                        <option value="site-manager">현장소장(기본 검증)</option>
                                                    </select>
                                                </div>
                                            )}
                                            {strictRoleGate && (
                                                <div className="mb-3 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg p-2.5">
                                                    시스템 정책상 안전관리자 엄격 승인 기준이 강제 적용됩니다.
                                                </div>
                                            )}
                                            {showReviewCommentField ? (
                                                <textarea
                                                    value={approvalComment}
                                                    onChange={(e) => setApprovalComment(e.target.value)}
                                                    placeholder="수정/반려 사유(Comment)를 입력하세요"
                                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium min-h-[80px]"
                                                />
                                            ) : (
                                                <div className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-500">
                                                    점수/분석/판독 결과를 수정하거나 반려를 선택하면 사유(Comment) 입력창이 활성화됩니다.
                                                </div>
                                            )}
                                            {(hasCriticalReviewEdits || pendingApprovalAction === 'rejected') && (
                                                <p className="mt-2 text-[11px] font-black text-rose-600">
                                                    수정 또는 반려 처리 시 사유(Comment) 입력은 필수입니다.
                                                </p>
                                            )}
                                            <div className="mt-3 flex flex-col sm:flex-row gap-2 justify-end">
                                                <button
                                                    onClick={() => { void handleApprove('rejected'); }}
                                                    disabled={isUpdatingAnalysis}
                                                    className={`w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-black ${isUpdatingAnalysis ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'}`}
                                                >
                                                    반려(재촬영/재작성 요망)
                                                </button>
                                                <button
                                                    onClick={() => { void handleApprove('approved'); }}
                                                    disabled={isUpdatingAnalysis || (hasCriticalReviewEdits && approvalComment.trim().length === 0)}
                                                    className={`w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-black ${isUpdatingAnalysis || (hasCriticalReviewEdits && approvalComment.trim().length === 0) ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                                                >
                                                    최종 승인(수정)
                                                </button>
                                            </div>
                                            <div className="mt-3 text-xs text-slate-500 font-bold">누적 승인 이력: {(record.approvalHistory || []).length}건</div>
                                        </div>

                                        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                                            <h4 className="text-sm font-black text-slate-800 mb-3">최근 감사 이력</h4>
                                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                                {(record.auditTrail || []).slice(-5).reverse().map((entry, idx) => (
                                                    <div key={`${entry.timestamp}-${idx}`} className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-2">
                                                        <div className="font-black text-slate-700">[{entry.stage}] {entry.actor}</div>
                                                        <div className="text-slate-500">{new Date(entry.timestamp).toLocaleString()}</div>
                                                        {entry.note && <div className="text-slate-600 mt-1">{entry.note}</div>}
                                                    </div>
                                                ))}
                                                {(record.auditTrail || []).length === 0 && <div className="text-xs text-slate-400">감사 이력이 없습니다.</div>}
                                            </div>

                                            <div className="mt-4 pt-4 border-t border-slate-200">
                                                <h5 className="text-xs font-black text-violet-700 mb-2">{reassessmentTitle}</h5>
                                                <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar">
                                                    {reassessmentTrail.map((entry, idx) => (
                                                        <div key={`re-${entry.timestamp}-${idx}`} className="text-xs bg-violet-50 border border-violet-200 rounded-lg p-2">
                                                            <div className="font-black text-violet-800">{reassessmentTag} {entry.actor}</div>
                                                            <div className="text-violet-500">{new Date(entry.timestamp).toLocaleString(timelineLocale, timelineDateTimeOptions)}</div>
                                                            {entry.note && <div className="text-violet-700 mt-1">{entry.note}</div>}
                                                        </div>
                                                    ))}
                                                    {reassessmentTrail.length === 0 && <div className="text-xs text-slate-400">{reassessmentEmpty}</div>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'analysis' && (
                                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm h-full min-h-[300px]">
                                        <div className="mb-4">
                                            <p className="text-xs text-slate-400 font-bold mb-1">KOREAN</p>
                                            <textarea 
                                                value={record.aiInsights} 
                                                onChange={(e) => handleChange('aiInsights', e.target.value)}
                                                className="w-full min-h-[120px] text-base text-slate-700 leading-relaxed border-none focus:ring-0 resize-none bg-slate-50 rounded-xl p-4 font-medium"
                                                placeholder="AI 분석 인사이트를 확인하거나 수정하세요."
                                            />
                                        </div>
                                        <div>
                                            <p className="text-xs text-indigo-400 font-bold mb-1 flex items-center gap-1">
                                                NATIVE ({record.nationality})
                                                <span className="text-[10px] text-slate-400 font-normal">* 국적 변경 후 'AI 분석 갱신' 클릭 시 자동 번역됨</span>
                                            </p>
                                            <textarea 
                                                value={record.aiInsights_native} 
                                                onChange={(e) => handleChange('aiInsights_native', e.target.value)}
                                                className="w-full min-h-[120px] text-base text-slate-600 leading-relaxed border-none focus:ring-0 resize-none bg-indigo-50/50 rounded-xl p-4 font-medium"
                                                placeholder="모국어 번역 내용입니다."
                                            />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'qna' && (
                                    <div className="space-y-4 pb-4">
                                        {record.handwrittenAnswers.map((ans, idx) => (
                                            <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-widest">Question {ans.questionNumber}</span>
                                                </div>
                                                <div className="space-y-4">
                                                    <div className="bg-slate-50 p-4 rounded-xl">
                                                        <p className="text-xs text-slate-400 font-bold uppercase mb-1">OCR Original</p>
                                                        <textarea
                                                            value={ans.answerText}
                                                            onChange={(e) => handleAnswerChange(idx, 'answerText', e.target.value)}
                                                            className="w-full min-h-[90px] text-sm text-slate-600 bg-white border border-slate-200 rounded-lg p-3 font-medium"
                                                        />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-indigo-400 font-bold uppercase mb-1">Translation</p>
                                                        <textarea
                                                            value={ans.koreanTranslation}
                                                            onChange={(e) => handleAnswerChange(idx, 'koreanTranslation', e.target.value)}
                                                            className="w-full min-h-[90px] text-sm text-slate-700 bg-indigo-50 border border-indigo-100 rounded-lg p-3 font-bold"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div className="p-6 bg-white border-t border-slate-200 flex justify-between items-center shadow-inner z-10 shrink-0">
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={handleReanalyzeClick} 
                                    disabled={isReanalyzing} 
                                    className={`text-xs font-black flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${isReanalyzing ? 'bg-slate-100 text-slate-400' : 'text-slate-500 hover:bg-slate-100'}`}
                                >
                                    <svg className={`w-4 h-4 ${isReanalyzing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth={2.5}/></svg>
                                    이미지 전체 재분석 (OCR)
                                </button>
                                <button onClick={handleExportEvidenceCsv} className="text-xs font-black px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all">증빙 CSV</button>
                                <button onClick={handleExportEvidencePdf} className="text-xs font-black px-4 py-2 rounded-xl bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-all">증빙 패키지 PDF</button>
                            </div>
                            <button onClick={handleOpenReportClick} className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-sm font-black shadow-2xl hover:bg-black transition-all transform hover:-translate-y-1">3차 안전 리포트 보기</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

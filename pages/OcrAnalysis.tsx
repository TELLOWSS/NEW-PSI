
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { FileUpload } from '../components/FileUpload';
import { Spinner } from '../components/Spinner';
import { analyzeWorkerRiskAssessment, updateAnalysisBasedOnEdits, getQuotaState, setQuotaExhausted, clearQuotaState, isRateLimitError, validateImageFormat, isFormatCompatibleWithAI } from '../services/geminiService';
import { extractMessage } from '../utils/errorUtils';
import type { WorkerRecord, OcrErrorType, AppSettings } from '../types';
import { fileToBase64 } from '../utils/fileUtils';
import { getSafetyLevelFromScore } from '../utils/safetyLevelUtils';
import { getApiCallState, incrementApiCallCount, resetApiCallCount, type DailyCounterState } from '../utils/apiCounterUtils';
import { MasterTemplateList, type MasterTemplate } from '../components/shared/MasterTemplateList';
import { MasterAssignment, type MasterAssignmentItem, type MasterGroup } from '../components/shared/MasterAssignment';
import { CollapsibleSection } from '../components/shared/CollapsibleSection';
import { handleSupabasePermissionError, supabase } from '../lib/supabaseClient';

const buildMasterDataLoadErrorMessage = (rawMessage?: string) => {
    const message = String(rawMessage || '알 수 없는 오류');
    return `기록 양식/배정 데이터 조회 실패: ${message}\n\n현재 group 전용 모드입니다. Supabase에 group 뷰/컬럼이 적용되었는지 확인해 주세요.`;
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

const getSafetyLevelClass = (level: '초급' | '중급' | '고급') => {
    switch (level) {
        case '고급': return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
        case '중급': return 'bg-amber-100 text-amber-800 border border-amber-200';
        case '초급': return 'bg-rose-100 text-rose-800 border border-rose-200';
        default: return 'bg-slate-100 text-slate-800';
    }
};

const isManagementRole = (field: string) => 
    /관리|팀장|부장|과장|기사|공무|소장/.test(field);

const classifyLegacyOcrErrorType = (raw: string): OcrErrorType => {
    const message = (raw || '').toLowerCase();

    if (message.includes('모서리') || message.includes('잘림') || message.includes('배경') || message.includes('layout') || message.includes('crop')) return 'LAYOUT';
    if (message.includes('해상도') || message.includes('low resolution') || message.includes('too short') || message.includes('멀리')) return 'RESOLUTION';
    if (message.includes('악필') || message.includes('손글씨') || message.includes('handwriting') || message.includes('illegible')) return 'HANDWRITING';
    if (message.includes('반사') || message.includes('그림자') || message.includes('초점') || message.includes('흔들') || message.includes('blur') || message.includes('glare')) return 'QUALITY';
    return 'UNKNOWN';
};

const getOcrErrorTypeFromRecord = (record: WorkerRecord): OcrErrorType => {
    if (record.ocrErrorType) return record.ocrErrorType;
    return classifyLegacyOcrErrorType(String(record.aiInsights || ''));
};

const getOcrErrorGuideMessage = (errorType: OcrErrorType): string => {
    switch (errorType) {
        case 'QUALITY':
            return '📸 사진에 빛 반사가 있거나 흔들렸습니다. 밝은 곳에서 초점을 맞춰 다시 찍어주세요.';
        case 'HANDWRITING':
            return '✍️ 글씨를 인식하기 어렵습니다. 정자체로 작성되었는지 확인해 주세요.';
        case 'LAYOUT':
            return '📄 문서의 모서리가 잘렸습니다. 기록지 전체가 화면에 들어오게 찍어주세요.';
        case 'RESOLUTION':
            return '🔎 해상도가 낮거나 너무 멀리서 촬영되었습니다. 문서에 가까이 다가가 선명하게 촬영해 주세요.';
        default:
            return '🛠️ 서버 또는 네트워크 오류가 발생했습니다. 잠시 후 다시 촬영하거나 재시도해 주세요.';
    }
};

const getOcrErrorGuideSummary = (errorType: OcrErrorType): string => {
    switch (errorType) {
        case 'QUALITY':
            return '조치: 반사/흔들림 최소화 후 재촬영';
        case 'HANDWRITING':
            return '조치: 정자체 확인 후 재작성/재촬영';
        case 'LAYOUT':
            return '조치: 문서 전체(모서리 포함) 재촬영';
        case 'RESOLUTION':
            return '조치: 가까이서 고해상도 재촬영';
        default:
            return '조치: 잠시 후 재시도 또는 네트워크 확인';
    }
};

const getOcrErrorTypeKoreanLabel = (errorType: OcrErrorType): string => {
    switch (errorType) {
        case 'QUALITY':
            return '촬영 품질';
        case 'RESOLUTION':
            return '해상도';
        case 'HANDWRITING':
            return '악필/필기';
        case 'LAYOUT':
            return '문서 구도';
        default:
            return '기타 오류';
    }
};

const getOcrErrorMobileLabel = (errorType: OcrErrorType): string => {
    switch (errorType) {
        case 'QUALITY':
            return '📸 품질';
        case 'HANDWRITING':
            return '✍️ 악필';
        case 'LAYOUT':
            return '📄 레이아웃';
        case 'RESOLUTION':
            return '🔎 해상도';
        default:
            return '🛠️ 기타';
    }
};

const normalizeRetryImageData = (image?: string): string => {
    if (!image || typeof image !== 'string') return '';
    const trimmed = image.trim();
    const withoutHeader = trimmed.includes('base64,')
        ? trimmed.split('base64,').pop() || ''
        : trimmed;
    return withoutHeader.replace(/[\r\n\s]/g, '');
};

const hasRetryableOriginalImage = (image?: string): boolean => {
    return normalizeRetryImageData(image).length >= 100;
};

const createFileAnalysisErrorRecord = (file: File, message: string, errorType: OcrErrorType = 'UNKNOWN'): WorkerRecord => {
    const now = Date.now();
    const filename = String(file.name || 'unknown-file');
    const baseName = filename.includes('.') ? filename.replace(/\.[^/.]+$/, '') : filename;

    return {
        id: `upload-fail-${now}-${Math.random().toString(36).slice(2, 8)}`,
        name: baseName || '분석 실패',
        jobField: '미분류',
        teamLeader: '미지정',
        role: 'worker',
        isTranslator: false,
        isSignalman: false,
        date: new Date().toISOString().split('T')[0],
        nationality: '미상',
        language: 'unknown',
        handwrittenAnswers: [],
        fullText: '분석 실패',
        koreanTranslation: '',
        safetyScore: 0,
        ocrErrorType: errorType,
        ocrErrorMessage: message,
        safetyLevel: '초급',
        strengths: [],
        strengths_native: [],
        weakAreas: [],
        weakAreas_native: [],
        improvement: '',
        improvement_native: '',
        suggestions: [],
        suggestions_native: [],
        aiInsights: message,
        aiInsights_native: message,
        selfAssessedRiskLevel: '중',
        filename,
    };
};

const getPreflightFailureReason = (record: WorkerRecord): string | null => {
    const rawImage = String(record.originalImage || '').trim();
    if (!rawImage) return '원본 이미지가 없습니다. 문서 이미지를 다시 등록해야 합니다.';

    const cleanImage = normalizeRetryImageData(rawImage);
    if (!cleanImage || cleanImage.length < 100) {
        return '이미지 데이터가 너무 짧거나 손상되었습니다. 원본 문서를 다시 업로드해야 합니다.';
    }

    const formatValidation = validateImageFormat(cleanImage);
    if (!formatValidation.isValid) {
        return `이미지 데이터 손상 또는 base64 형식 오류입니다. (${formatValidation.error || '형식 오류'})`;
    }

    if (!formatValidation.supportedFormat) {
        return `지원하지 않는 파일 형식입니다. 감지 형식: ${formatValidation.detectedFormat}`;
    }

    if (!isFormatCompatibleWithAI(formatValidation.detectedFormat)) {
        return `AI 미지원 형식입니다. JPG/PNG/WebP/HEIC로 변환 후 다시 등록하세요. (현재: ${formatValidation.detectedFormat})`;
    }

    return null;
};

// [강화된 실패 판단 로직 - 안전성 강화]
const isFailedRecord = (r: WorkerRecord): boolean => {
    if (r.ocrErrorType) return true;

    // 안전 점수가 0일 경우 실패
    if (r.safetyScore === 0) return true;
    
    // AI 분석 결과가 없거나 비어있을 경우 실패
    if (!r.aiInsights || r.aiInsights.trim() === "") return true;
    
    // 이름에서 실패 패턴 확인
    const name = String(r.name || '');
    if (name.includes('할당량 초과') || name.includes('분석 실패') || name.includes('이미지 데이터')) {
        return true;
    }
    
    // AI 분석 결과에서 오류 패턴 확인
    const insight = String(r.aiInsights || '');
    if (insight.includes('API 요청량') || 
        insight.includes('오류 상세') || 
        insight.includes('Resource has been exhausted') || 
        insight.includes('429') ||
        insight.includes('분석 실패') ||
        insight.includes('재시도 필요')) {
        return true;
    }
    
    return false;
};

const isHardRetryTarget = (r: WorkerRecord): boolean => {
    if (r.ocrErrorType) return true;
    if (r.safetyScore === 0) return true;

    const insight = String(r.aiInsights || '').toLowerCase();
    return (
        insight.includes('429') ||
        insight.includes('resource_exhausted') ||
        insight.includes('할당량') ||
        insight.includes('분석 실패') ||
        insight.includes('재시도 필요') ||
        insight.includes('원본 이미지 데이터 소실')
    );
};

// 우선순위 점수: 낮을수록 먼저 처리 (0=최고우선)
const getRetryPriorityScore = (r: WorkerRecord): number => {
    if (r.safetyScore === 0 && r.ocrErrorType) return 0; // 완전 실패
    if (r.safetyScore === 0) return 1;                    // 점수 없음
    if (r.ocrErrorType) return 2;                         // OCR 오류
    const insight = String(r.aiInsights || '').toLowerCase();
    if (insight.includes('할당량') || insight.includes('분석 실패') || insight.includes('재시도 필요')) return 3;
    if (typeof r.ocrConfidence === 'number' && r.ocrConfidence < 0.5) return 4; // 신뢰도 극저
    return 5; // 저신뢰
};

const getFlag = (nationality: string) => {
    const n = (nationality || '').toLowerCase();
    if (n.includes('베트남') || n.includes('vietnam')) return '🇻🇳';
    if (n.includes('중국') || n.includes('china')) return '🇨🇳';
    if (n.includes('태국') || n.includes('thailand')) return '🇹🇭';
    if (n.includes('우즈벡') || n.includes('uzbekistan')) return '🇺🇿';
    if (n.includes('캄보디아') || n.includes('cambodia')) return '🇰🇭';
    if (n.includes('몽골') || n.includes('mongolia')) return '🇲🇳';
    if (n.includes('필리핀')) return '🇵🇭';
    if (n.includes('인도네시아')) return '🇮🇩';
    if (n.includes('카자흐스탄')) return '🇰🇿';
    if (n.includes('네팔')) return '🇳🇵';
    if (n.includes('미얀마')) return '🇲🇲';
    if (n.includes('한국') || n.includes('korea') || n.includes('대한민국')) return '🇰🇷';
    return ''; 
};

const getLeaderIcon = (record: WorkerRecord) => {
    const badges = [];
    if (record.role === 'leader' || (record.name === record.teamLeader)) {
        badges.push(<span key="leader" className="text-yellow-500 text-sm" title="팀장">👑</span>);
    } else if (record.role === 'sub_leader') {
        badges.push(<span key="sub" className="text-slate-400 text-sm font-bold" title="부팀장">🛡️</span>);
    }
    if (record.isTranslator) {
        const flag = getFlag(record.nationality);
        badges.push(<span key="trans" className="text-sm" title="통역 담당">{flag}🗣️</span>);
    }
    if (record.isSignalman) {
        badges.push(<span key="signal" className="text-sm" title="신호수 (장비 유도)">🚦</span>);
    }
    if (badges.length === 0) return null;
    return <span className="flex items-center gap-1">{badges}</span>;
};

interface OcrAnalysisProps {
    onAnalysisComplete: (records: WorkerRecord[]) => void;
    existingRecords: WorkerRecord[];
    onDeleteAll: () => void;
    onImport: (records: WorkerRecord[]) => void;
    onViewDetails: (record: WorkerRecord) => void;
    onOpenReport: (record: WorkerRecord) => void;
    onDeleteRecord: (recordId: string) => void;
    onUpdateRecord: (record: WorkerRecord) => void;
}

type RetryDiagnostics = {
    total: number;
    success: number;
    fail: number;
    serverSuccess: number;
    clientFallbackSuccess: number;
    preflightFail: number;
    processingFail: number;
    serverRouteFail: number;
    lastUpdatedAt: string;
};

const OcrAnalysis: React.FC<OcrAnalysisProps> = ({ 
    onAnalysisComplete, 
    existingRecords, 
    onDeleteAll, 
    onImport, 
    onViewDetails, 
    onOpenReport,
    onDeleteRecord, 
    onUpdateRecord 
}) => {
    const [files, setFiles] = useState<File[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progress, setProgress] = useState('');
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
    const [cooldownTime, setCooldownTime] = useState(0); // For UI countdown
    const [searchTerm, setSearchTerm] = useState('');
    const [filterLevel, setFilterLevel] = useState<string>('all');
    const [filterField, setFilterField] = useState<string>('all');
    const [filterLeader, setFilterLeader] = useState<string>('all');
    const [filterTrust, setFilterTrust] = useState<'all' | 'pending' | 'finalized'>('all');
    const [dailyCounter, setDailyCounter] = useState<DailyCounterState>(() => getApiCallState());
    const [importValidationSummary, setImportValidationSummary] = useState<string>('');
    const [importValidationDetails, setImportValidationDetails] = useState<string>('');
    const [masterTemplates, setMasterTemplates] = useState<MasterTemplate[]>([]);
    const [selectedMasterTemplateId, setSelectedMasterTemplateId] = useState('');
    const [masterGroups, setMasterGroups] = useState<MasterGroup[]>([]);
    const [masterAssignments, setMasterAssignments] = useState<MasterAssignmentItem[]>([]);
    const [openMasterSection, setOpenMasterSection] = useState<'templates' | 'assignments' | null>(null);
    const [retryDiagnostics, setRetryDiagnostics] = useState<RetryDiagnostics | null>(null);

    const fetchMasterGroups = useCallback(async () => {
        return supabase
            .from('record_master_groups')
            .select('id, name')
            .order('updated_at', { ascending: false });
    }, []);

    const fetchMasterAssignments = useCallback(async () => {
        const assignmentViewResult = await supabase
            .from('record_master_assignment_groups')
            .select('id, group_id, template_id, status, effective_date')
            .order('updated_at', { ascending: false });

        if (!assignmentViewResult.error) {
            return assignmentViewResult;
        }

        const groupColumnResult = await supabase
            .from('record_master_assignments')
            .select('id, group_id, template_id, status, effective_date')
            .order('updated_at', { ascending: false });

        if (!groupColumnResult.error) {
            return groupColumnResult;
        }

        return groupColumnResult;
    }, []);

    const insertMasterGroup = useCallback(async (name: string) => {
        return supabase
            .from('record_master_groups')
            .insert({ name })
            .select('id, name')
            .single();
    }, []);

    const deleteMasterGroup = useCallback(async (groupId: string) => {
        return supabase
            .from('record_master_groups')
            .delete()
            .eq('id', groupId);
    }, []);

    const loadMasterData = useCallback(async () => {
        const [templateResult, groupResult, assignmentResult] = await Promise.all([
            supabase
                .from('record_master_templates')
                .select('id, name, version, field_schema, updated_at')
                .order('updated_at', { ascending: false }),
            fetchMasterGroups(),
            fetchMasterAssignments(),
        ]);

        if (templateResult.error || groupResult.error || assignmentResult.error) {
            const firstError = templateResult.error || groupResult.error || assignmentResult.error;
            if (!handleSupabasePermissionError(firstError)) {
                alert(buildMasterDataLoadErrorMessage(firstError?.message));
            }
            return;
        }

        const mappedTemplates: MasterTemplate[] = (templateResult.data || []).map((row: any) => ({
            id: String(row.id),
            name: String(row.name || ''),
            version: String(row.version || ''),
            fieldSchema: String(row.field_schema || ''),
            updatedAt: String(row.updated_at || '').replace('T', ' ').slice(0, 16),
        }));

        const mappedGroups: MasterGroup[] = (groupResult.data || []).map((row: any) => ({
            id: String(row.id),
            name: String(row.name || ''),
        }));

        const mappedAssignments: MasterAssignmentItem[] = (assignmentResult.data || []).map((row: any) => ({
            id: String(row.id),
            groupId: String(row.group_id || ''),
            templateId: String(row.template_id),
            status: row.status === 'inactive' ? 'inactive' : 'active',
            effectiveDate: String(row.effective_date || ''),
        }));

        setMasterTemplates(mappedTemplates);
        setMasterGroups(mappedGroups);
        setMasterAssignments(mappedAssignments);
        setSelectedMasterTemplateId((prev) => prev || mappedTemplates[0]?.id || '');
    }, [fetchMasterAssignments, fetchMasterGroups]);

    useEffect(() => {
        void loadMasterData();
    }, [loadMasterData]);

    const handleCreateMasterTemplate = async (payload: { name: string; version: string; fieldSchema: string }) => {
        const result = await supabase
            .from('record_master_templates')
            .insert({
                name: payload.name,
                version: payload.version,
                field_schema: payload.fieldSchema,
            })
            .select('id, name, version, field_schema, updated_at')
            .single();

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`템플릿 생성 실패: ${result.error.message}`);
            }
            return;
        }

        const next: MasterTemplate = {
            id: String(result.data.id),
            name: String(result.data.name || ''),
            version: String(result.data.version || ''),
            fieldSchema: String(result.data.field_schema || ''),
            updatedAt: String(result.data.updated_at || '').replace('T', ' ').slice(0, 16),
        };

        setMasterTemplates((prev) => [next, ...prev]);
        setSelectedMasterTemplateId(next.id);
    };

    const handleDeleteMasterTemplate = async (templateId: string) => {
        if (!confirm('해당 템플릿을 삭제하시겠습니까?')) return;

        const result = await supabase
            .from('record_master_templates')
            .delete()
            .eq('id', templateId);

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`템플릿 삭제 실패: ${result.error.message}`);
            }
            return;
        }

        setMasterTemplates((prev) => prev.filter((item) => item.id !== templateId));
        setMasterAssignments((prev) => prev.filter((item) => item.templateId !== templateId));
        setSelectedMasterTemplateId((prev) => (prev === templateId ? '' : prev));
    };

    const handleAddMasterGroup = async (groupName: string) => {
        const normalized = groupName.trim();
        if (!normalized) return;

        const result = await insertMasterGroup(normalized);

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`공종/팀 그룹 추가 실패: ${result.error.message}`);
            }
            return;
        }

        setMasterGroups((prev) => [{ id: String(result.data.id), name: String(result.data.name || '') }, ...prev]);
    };

    const handleDeleteMasterGroup = async (groupId: string) => {
        const result = await deleteMasterGroup(groupId);

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`공종/팀 그룹 삭제 실패: ${result.error.message}`);
            }
            return;
        }

        setMasterGroups((prev) => prev.filter((group) => group.id !== groupId));
        setMasterAssignments((prev) => prev.filter((item) => item.groupId !== groupId));
    };

    const handleCreateMasterAssignment = async (payload: { groupId: string; templateId: string; effectiveDate: string }) => {
        const primaryResult = await supabase
            .from('record_master_assignments')
            .upsert(
                {
                    group_id: payload.groupId,
                    template_id: payload.templateId,
                    status: 'active',
                    effective_date: payload.effectiveDate,
                },
                { onConflict: 'group_id,template_id' }
            )
            .select('id, group_id, template_id, status, effective_date')
            .single();

        const result = primaryResult;

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`배정 저장 실패: ${result.error.message}`);
            }
            return;
        }

        const next: MasterAssignmentItem = {
            id: String(result.data.id),
            groupId: String((result.data as any).group_id || ''),
            templateId: String(result.data.template_id),
            status: result.data.status === 'inactive' ? 'inactive' : 'active',
            effectiveDate: String(result.data.effective_date || ''),
        };

        setMasterAssignments((prev) => {
            const existingIndex = prev.findIndex((item) => item.id === next.id);
            if (existingIndex >= 0) {
                return prev.map((item, index) => (index === existingIndex ? next : item));
            }
            return [next, ...prev.filter((item) => !(item.groupId === next.groupId && item.templateId === next.templateId))];
        });
    };

    const handleDeleteMasterAssignment = async (assignmentId: string) => {
        const result = await supabase
            .from('record_master_assignments')
            .delete()
            .eq('id', assignmentId);

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`배정 삭제 실패: ${result.error.message}`);
            }
            return;
        }

        setMasterAssignments((prev) => prev.filter((item) => item.id !== assignmentId));
    };

    const handleSetMasterAssignmentStatus = async (assignmentId: string, status: 'active' | 'inactive') => {
        const result = await supabase
            .from('record_master_assignments')
            .update({ status })
            .eq('id', assignmentId)
            .select('id')
            .single();

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`상태 변경 실패: ${result.error.message}`);
            }
            return;
        }

        setMasterAssignments((prev) => prev.map((item) => (
            item.id === assignmentId ? { ...item, status } : item
        )));
    };

    const getExpectedSafetyLevel = useCallback((record: WorkerRecord): WorkerRecord['safetyLevel'] => {
        const score = typeof record.safetyScore === 'number' ? record.safetyScore : 0;
        return getSafetyLevelFromScore(score);
    }, []);

    const isGradeFinalizedByReview = useCallback((record: WorkerRecord): boolean => {
        if (record.reviewStatus === 'APPROVED') return true;
        if (record.approvalStatus === 'APPROVED' || record.approvalStatus === 'OVERRIDDEN') return true;

        const approvalHistory = record.approvalHistory || [];
        if (approvalHistory.length === 0) return false;
        const latest = approvalHistory[approvalHistory.length - 1];
        return latest?.status === 'approved';
    }, []);

    const needsGradeRevalidation = useCallback((record: WorkerRecord): boolean => {
        if (isGradeFinalizedByReview(record)) return false;
        return record.safetyLevel !== getExpectedSafetyLevel(record);
    }, [getExpectedSafetyLevel, isGradeFinalizedByReview]);

    const getReviewTrustState = useCallback((record: WorkerRecord): 'FINALIZED' | 'PENDING' | 'NONE' => {
        if (isGradeFinalizedByReview(record)) return 'FINALIZED';

        const hasReviewTrail = (record.approvalHistory || []).length > 0;
        const isPending = record.reviewStatus === 'PENDING' || record.approvalStatus === 'PENDING';

        if (isPending || hasReviewTrail) return 'PENDING';
        return 'NONE';
    }, [isGradeFinalizedByReview]);
    
    // Strict stop control
    const stopRef = useRef<boolean>(false);
    const importInputRef = useRef<HTMLInputElement>(null);

    // Prevent accidental close during analysis
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isAnalyzing) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isAnalyzing]);

    const teamLeaders = useMemo(() => {
        const leaders = new Set(existingRecords.map(r => r.teamLeader || '미지정'));
        return Array.from(leaders).sort();
    }, [existingRecords]);

    const filteredRecords = useMemo(() => {
        return existingRecords.filter(r => {
            const searchStr = `${r.name || ''} ${r.jobField || ''} ${r.nationality || ''}`.toLowerCase();
            const matchesSearch = searchStr.includes(searchTerm.toLowerCase());
            const matchesLevel = filterLevel === 'all' || r.safetyLevel === filterLevel;
            const matchesField = filterField === 'all' || r.jobField === filterField;
            const matchesLeader = filterLeader === 'all' || (r.teamLeader || '미지정') === filterLeader;
            const trustState = getReviewTrustState(r);
            const matchesTrust =
                filterTrust === 'all' ||
                (filterTrust === 'pending' && trustState === 'PENDING') ||
                (filterTrust === 'finalized' && trustState === 'FINALIZED');

            return matchesSearch && matchesLevel && matchesField && matchesLeader && matchesTrust;
        });
    }, [existingRecords, searchTerm, filterLevel, filterField, filterLeader, filterTrust, getReviewTrustState]);

    const recordsWithImages = useMemo(() => {
        return existingRecords.filter(r => hasRetryableOriginalImage(r.originalImage));
    }, [existingRecords]);

    const failedRecords = useMemo(() => {
        return existingRecords.filter(r => 
            isFailedRecord(r) && 
            hasRetryableOriginalImage(r.originalImage)
        );
    }, [existingRecords]);

    const lowConfidenceCount = useMemo(() => {
        return existingRecords.filter(r => typeof r.ocrConfidence === 'number' && r.ocrConfidence < 0.7).length;
    }, [existingRecords]);

    const primaryFailedRecord = useMemo(() => failedRecords[0] || null, [failedRecords]);

    const primaryFailedErrorType = useMemo<OcrErrorType | null>(() => {
        if (!primaryFailedRecord) return null;
        return getOcrErrorTypeFromRecord(primaryFailedRecord);
    }, [primaryFailedRecord]);

    const primaryFailedPreflightReason = useMemo(() => {
        if (!primaryFailedRecord) return null;
        return getPreflightFailureReason(primaryFailedRecord);
    }, [primaryFailedRecord]);

    const handleRetryCapture = useCallback(() => {
        const target = document.getElementById('new-ocr-capture-section');
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        alert('신규 기록 분석 영역에서 다시 촬영/업로드를 진행해 주세요.');
    }, []);

    // 분석 중단 요청
    const stopAnalysis = useCallback(() => {
        stopRef.current = true;
        setProgress('중단 요청 중...');
    }, []);

    // [SMART DELAY] UI countdown included
    const waitWithCountdown = async (seconds: number, messagePrefix: string) => {
        for (let i = seconds; i > 0; i--) {
            if (stopRef.current) throw new Error("STOPPED");
            setCooldownTime(i);
            setProgress(`${messagePrefix} (${i}초 대기 중...)`);
            await new Promise(r => setTimeout(r, 1000));
        }
        setCooldownTime(0);
    };

    const requestServerRetryAnalysis = useCallback(async (record: WorkerRecord): Promise<WorkerRecord> => {
        const response = await fetch('/api/ocr/retry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recordId: record.id,
                imageSource: record.originalImage,
                filenameHint: record.filename || record.name,
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.record) {
            throw new Error(data?.message || '서버 OCR 재분석 실패');
        }

        return {
            ...record,
            ...data.record,
            id: record.id,
            originalImage: record.originalImage,
            profileImage: record.profileImage,
            filename: record.filename,
            role: record.role !== 'worker' ? record.role : data.record.role,
            isTranslator: record.isTranslator || data.record.isTranslator,
            isSignalman: record.isSignalman || data.record.isSignalman,
            ocrErrorType: undefined,
            ocrErrorMessage: undefined,
        } as WorkerRecord;
    }, []);

    const getBatchSplitSize = (): number => {
        try {
            const raw = localStorage.getItem('psi_app_settings');
            if (!raw) return 50;
            const parsed = JSON.parse(raw) as AppSettings;
            const size = parsed.batchSplitSize;
            if (typeof size === 'number' && size >= 10 && size <= 500) return size;
        } catch { /* ignore */ }
        return 50;
    };

    const runBatchAnalysis = async (targetRecords: WorkerRecord[], title: string, forceReanalyze: boolean = false) => {
        const total = targetRecords.length;
        if (total === 0) return alert('재분석할 대상이 없습니다.');
        
        // [Quota State Check] Verify API quota status before batch processing
        const quotaState = getQuotaState();
        if (quotaState.isExhausted) {
            const recoveryTime = Math.ceil((quotaState.nextRetryTime - Date.now()) / 1000);
            if (recoveryTime > 0) {
                const forceRetry = confirm(`⚠️ API 할당량 대기 상태입니다.\n예상 복구: 약 ${recoveryTime}초 후\n\n지금 즉시 재시도(대기상태 해제) 하시겠습니까?\n※ 즉시 재시도 시 429가 다시 발생할 수 있습니다.`);
                if (!forceRetry) {
                    alert(`복구 대기 중입니다.\n${new Date(quotaState.nextRetryTime).toLocaleTimeString()} 이후 재시도 권장`);
                    return;
                }
                clearQuotaState();
            }
        }
        
        if (forceReanalyze) {
            console.log(`[강제 재분석] Preflight 검증 스킵, 직접 API 호출 모드`);
        }
        
        setIsAnalyzing(true);
        setProgress(`[${title}] 재분석 준비 중...`);
        setBatchProgress({ current: 0, total });
        stopRef.current = false;
        setRetryDiagnostics({
            total,
            success: 0,
            fail: 0,
            serverSuccess: 0,
            clientFallbackSuccess: 0,
            preflightFail: 0,
            processingFail: 0,
            serverRouteFail: 0,
            lastUpdatedAt: new Date().toISOString(),
        });
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
        
        let successCount = 0;
        let failCount = 0;
        let stopped = false;
        let serverSuccessCount = 0;
        let clientFallbackSuccessCount = 0;
        let preflightFailCount = 0;
        let processingFailCount = 0;
        let serverRouteFailCount = 0;
        
        // [Adaptive Throttling State]
        // Start with a 4s buffer. If we hit limits, increase this dynamically.
        let dynamicDelayBuffer = 4;

        // [Priority Queue] 고위험→실패→저신뢰 순으로 정렬
        const processQueue = [...targetRecords].sort((a, b) => getRetryPriorityScore(a) - getRetryPriorityScore(b));

        try {
            for (let i = 0; i < processQueue.length; i++) {
                if (stopRef.current) { stopped = true; break; }
                
                const record = processQueue[i];
                setBatchProgress(p => ({ ...p, current: i + 1 }));
                setProgress(`[${title}] ${record.name || '미상'} 처리 중...`);
                
                try {
                    // 1. Data Integrity Check
                    if (!forceReanalyze && !hasRetryableOriginalImage(record.originalImage)) {
                        console.warn(`Skipping ${record.id}: Image loss.`);
                        const errorRecord: WorkerRecord = {
                            ...record,
                            aiInsights: "❌ 원본 이미지 데이터 소실 (분석 불가)",
                            ocrErrorType: 'LAYOUT',
                            ocrErrorMessage: '원본 이미지 데이터 소실',
                            safetyScore: 0,
                        };
                        onUpdateRecord(errorRecord);
                        failCount++;
                        preflightFailCount++;
                        setRetryDiagnostics({
                            total,
                            success: successCount,
                            fail: failCount,
                            serverSuccess: serverSuccessCount,
                            clientFallbackSuccess: clientFallbackSuccessCount,
                            preflightFail: preflightFailCount,
                            processingFail: processingFailCount,
                            serverRouteFail: serverRouteFailCount,
                            lastUpdatedAt: new Date().toISOString(),
                        });
                        continue; 
                    }
                    
                    // [강제 재분석 모드] 이미지 없어도 계속 진행 (API 호출 통해 재분석)
                    if (forceReanalyze && !hasRetryableOriginalImage(record.originalImage)) {
                        console.log(`[강제 재분석] ${record.id}: 이미지 데이터 없음 감지. API 호출로 재분석 시도...`);
                    }

                    // [Step 3] Image Format Validation
                    const cleanImage = normalizeRetryImageData(record.originalImage);
                    const formatValidation = validateImageFormat(cleanImage);
                    
                    if (!forceReanalyze && !formatValidation.isValid) {
                        console.warn(`Image format error for ${record.id}: ${formatValidation.error}`);
                        const errorRecord: WorkerRecord = {
                            ...record,
                            aiInsights: `❌ 이미지 형식 오류: ${formatValidation.error} (감지: ${formatValidation.detectedFormat})`,
                            ocrErrorType: classifyLegacyOcrErrorType(String(formatValidation.error || '')),
                            ocrErrorMessage: String(formatValidation.error || '이미지 형식 오류'),
                            safetyScore: 0,
                        };
                        onUpdateRecord(errorRecord);
                        failCount++;
                        preflightFailCount++;
                        setRetryDiagnostics({
                            total,
                            success: successCount,
                            fail: failCount,
                            serverSuccess: serverSuccessCount,
                            clientFallbackSuccess: clientFallbackSuccessCount,
                            preflightFail: preflightFailCount,
                            processingFail: processingFailCount,
                            serverRouteFail: serverRouteFailCount,
                            lastUpdatedAt: new Date().toISOString(),
                        });
                        continue;
                    }
                    
                    if (!forceReanalyze && !formatValidation.supportedFormat) {
                        console.warn(`Unsupported format for ${record.id}: ${formatValidation.detectedFormat}`);
                        const errorRecord: WorkerRecord = {
                            ...record,
                            aiInsights: `⚠️ 지원하지 않는 이미지 형식: ${formatValidation.detectedFormat}`,
                            ocrErrorType: 'QUALITY',
                            ocrErrorMessage: `지원하지 않는 이미지 형식: ${formatValidation.detectedFormat}`,
                            safetyScore: 0,
                        };
                        onUpdateRecord(errorRecord);
                        failCount++;
                        preflightFailCount++;
                        setRetryDiagnostics({
                            total,
                            success: successCount,
                            fail: failCount,
                            serverSuccess: serverSuccessCount,
                            clientFallbackSuccess: clientFallbackSuccessCount,
                            preflightFail: preflightFailCount,
                            processingFail: processingFailCount,
                            serverRouteFail: serverRouteFailCount,
                            lastUpdatedAt: new Date().toISOString(),
                        });
                        continue;
                    }
                    
                    if (!forceReanalyze && !isFormatCompatibleWithAI(formatValidation.detectedFormat)) {
                        console.warn(`Format not AI-compatible for ${record.id}: ${formatValidation.detectedFormat}`);
                        const errorRecord: WorkerRecord = {
                            ...record,
                            aiInsights: `⚠️ AI 분석 미지원 형식: ${formatValidation.detectedFormat}. JPEG, PNG, GIF, WebP, HEIC 형식만 지원됩니다.`,
                            ocrErrorType: 'QUALITY',
                            ocrErrorMessage: `AI 분석 미지원 형식: ${formatValidation.detectedFormat}`,
                            safetyScore: 0,
                        };
                        onUpdateRecord(errorRecord);
                        failCount++;
                        preflightFailCount++;
                        setRetryDiagnostics({
                            total,
                            success: successCount,
                            fail: failCount,
                            serverSuccess: serverSuccessCount,
                            clientFallbackSuccess: clientFallbackSuccessCount,
                            preflightFail: preflightFailCount,
                            processingFail: processingFailCount,
                            serverRouteFail: serverRouteFailCount,
                            lastUpdatedAt: new Date().toISOString(),
                        });
                        continue;
                    }

                    // 2. Call API with Retry Logic for Rate Limits
                    let apiResult = null;
                    let retryCount = 0;
                    const MAX_RETRIES = 3; 
                    let usedClientFallback = false;

                    while (retryCount < MAX_RETRIES) {
                        try {
                            const modeLabel = forceReanalyze ? '[강제 모드]' : '';
                            setProgress(`${modeLabel} [${title}] ${record.name || '미상'} 서버 OCR 재분석 요청 중...`);

                            try {
                                apiResult = await requestServerRetryAnalysis(record);
                                usedClientFallback = false;
                            } catch (serverError: any) {
                                const serverMessage = extractMessage(serverError);
                                const shouldFallbackToClient =
                                    serverMessage.toLowerCase().includes('failed to fetch') ||
                                    serverMessage.includes('404') ||
                                    serverMessage.includes('Method Not Allowed');

                                if (!shouldFallbackToClient) {
                                    serverRouteFailCount++;
                                    throw serverError;
                                }

                                const modeLabel = forceReanalyze ? '[강제 모드]' : '';
                                setProgress(`${modeLabel} [${title}] ${record.name || '미상'} 브라우저 OCR 폴백 실행 중...`);
                                const results = await analyzeWorkerRiskAssessment(record.originalImage || cleanImage, '', record.filename || record.name);
                                if (results && results.length > 0) {
                                    apiResult = results[0];
                                    usedClientFallback = true;
                                } else {
                                    throw new Error('Empty result from AI');
                                }
                            }

                            if (apiResult) {
                                const insightText = String(apiResult.aiInsights || '');
                                if ((apiResult.safetyScore === 0 && (insightText.includes('오류') || insightText.includes('실패'))) || insightText.includes('429') || insightText.includes('RESOURCE_EXHAUSTED')) {
                                    throw new Error(insightText || '분석 실패');
                                }
                                break; // Success!
                            }
                        } catch (err: any) {
                            const errMsg = err.message || JSON.stringify(err);
                            
                            // [CRITICAL] Detect Rate Limit (429 or Resource Exhausted) using utility function
                            if (isRateLimitError(errMsg)) {
                                console.warn(`Rate limit hit for ${record.name}. Cooling down...`);
                                
                                // Mark quota as exhausted and trigger recovery timer
                                setQuotaExhausted(15); // 15분 복구 대기
                                
                                // Permanently increase delay buffer for future requests
                                dynamicDelayBuffer = Math.min(10, dynamicDelayBuffer + 2);
                                
                                // Wait 30 seconds then retry loop
                                await waitWithCountdown(30, "⚠️ API 할당량 초과! 냉각 중");
                                retryCount++;
                            } else {
                                // Other errors (format, parsing) -> fail immediately
                                throw err; 
                            }
                        }
                    }

                    if (stopRef.current) { stopped = true; break; }

                    if (apiResult) {
                        const updatedRecord: WorkerRecord = {
                            ...apiResult,
                            id: record.id, 
                            originalImage: record.originalImage, 
                            profileImage: record.profileImage, 
                            filename: record.filename,
                            role: record.role !== 'worker' ? record.role : apiResult.role,
                            isTranslator: record.isTranslator || apiResult.isTranslator,
                            isSignalman: record.isSignalman || apiResult.isSignalman
                        };
                        onUpdateRecord(updatedRecord);
                        
                        if (isFailedRecord(updatedRecord)) {
                            failCount++;
                            processingFailCount++;
                            const next = incrementApiCallCount('fail');
                            setDailyCounter(next);
                        } else {
                            successCount++;
                            if (usedClientFallback) {
                                clientFallbackSuccessCount++;
                            } else {
                                serverSuccessCount++;
                            }
                            const next = incrementApiCallCount('success');
                            setDailyCounter(next);
                        }

                        setRetryDiagnostics({
                            total,
                            success: successCount,
                            fail: failCount,
                            serverSuccess: serverSuccessCount,
                            clientFallbackSuccess: clientFallbackSuccessCount,
                            preflightFail: preflightFailCount,
                            processingFail: processingFailCount,
                            serverRouteFail: serverRouteFailCount,
                            lastUpdatedAt: new Date().toISOString(),
                        });

                        // Adaptive Rate Limit Buffer
                        if (i < processQueue.length - 1) {
                            await waitWithCountdown(dynamicDelayBuffer, "다음 분석 대기 (Throttle)");
                        }

                    } else {
                        // Final Failure after retries
                                const errorRecord: WorkerRecord = {
                            ...record,
                            aiInsights: "⛔ 반복적인 API 오류로 분석 실패 (재시도 필요)",
                            ocrErrorType: 'UNKNOWN',
                            ocrErrorMessage: '반복적인 API 오류',
                        };
                        onUpdateRecord(errorRecord);
                        failCount++;
                        processingFailCount++;
                        setRetryDiagnostics({
                            total,
                            success: successCount,
                            fail: failCount,
                            serverSuccess: serverSuccessCount,
                            clientFallbackSuccess: clientFallbackSuccessCount,
                            preflightFail: preflightFailCount,
                            processingFail: processingFailCount,
                            serverRouteFail: serverRouteFailCount,
                            lastUpdatedAt: new Date().toISOString(),
                        });
                        // Safety cooldown even on fail
                        await waitWithCountdown(2, "오류 복구 중");
                    }

                } catch (err: unknown) {
                    const errMsg = extractMessage(err);
                    if (errMsg === "STOPPED") { stopped = true; break; }
                    console.error("Batch Error:", err);
                    const errorRecord: WorkerRecord = {
                        ...record,
                        aiInsights: `⛔ 시스템 오류: ${errMsg}`,
                        ocrErrorType: classifyLegacyOcrErrorType(errMsg),
                        ocrErrorMessage: errMsg,
                    };
                    onUpdateRecord(errorRecord);
                    failCount++;
                    processingFailCount++;
                    setRetryDiagnostics({
                        total,
                        success: successCount,
                        fail: failCount,
                        serverSuccess: serverSuccessCount,
                        clientFallbackSuccess: clientFallbackSuccessCount,
                        preflightFail: preflightFailCount,
                        processingFail: processingFailCount,
                        serverRouteFail: serverRouteFailCount,
                        lastUpdatedAt: new Date().toISOString(),
                    });
                }
            }
        } catch (globalErr: unknown) {
            const gMsg = extractMessage(globalErr);
            console.error("Global Batch Error:", gMsg);
            alert("일괄 처리 중 예상치 못한 오류가 발생하여 중단되었습니다.");
        } finally {
            setIsAnalyzing(false);
            setProgress('');
            setCooldownTime(0);
            setBatchProgress({ current: 0, total: 0 });
            
            const modeLabel = forceReanalyze ? '[강제 재분석]' : '';
            const reasonsReport = `\n[원인 집계]\n- 서버 성공: ${serverSuccessCount}\n- 브라우저 폴백 성공: ${clientFallbackSuccessCount}\n- 사전 검증 실패: ${preflightFailCount}\n- OCR 처리 실패: ${processingFailCount}\n- 서버 라우트 실패: ${serverRouteFailCount}`;
            
            if (stopped) {
                alert(`${modeLabel} 분석이 중단되었습니다.\n(성공: ${successCount}, 실패: ${failCount})${reasonsReport}`);
            } else {
                if (forceReanalyze) {
                    alert(`${modeLabel} ${title} 완료.\n\n✅ 성공: ${successCount}\n❌ 실패: ${failCount}${reasonsReport}\n\n※ Preflight 검증 스킵 모드로 실행되었습니다.\n※ 실패 건은 '강제 재분석' 또는 '스마트 재분석' 버튼으로 다시 시도할 수 있습니다.`);
                } else {
                    alert(`${title} 완료.\n성공: ${successCount}\n실패: ${failCount}${reasonsReport}\n\n* 실패 건은 '실패/대기 건 재분석' 버튼으로 다시 시도할 수 있습니다.`);
                }
            }
        }
    };

    // [IMPROVED] AI 갱신 함수명 명확화 + 재시도 로직 추가
    const handleBatchTextAnalysis = async () => {
        const targets = filteredRecords;
        const total = targets.length;
        if (total === 0) return alert('대상 없음');
        if (!confirm(`${total}명에 대해 AI 분석을 갱신합니다.`)) return;

        setIsAnalyzing(true);
        setBatchProgress({ current: 0, total });
        stopRef.current = false;

        let successCount = 0;
        let failCount = 0;
        let stopped = false;
        let dynamicDelayBuffer = 2; // 초기 지연

        try {
            for (let i = 0; i < total; i++) {
                if (stopRef.current) { stopped = true; break; }
                const record = targets[i];
                setBatchProgress(p => ({ ...p, current: i + 1 }));
                setProgress(`갱신 중: ${record.name}`);

                // [FIXED] Add retry counter to prevent infinite loops (Bug #2)
                let retryCount = 0;
                const MAX_TEXT_RETRIES = 2;
                let shouldExitRetry = false;

                while (retryCount < MAX_TEXT_RETRIES && !shouldExitRetry) {
                    try {
                        const updatedAnalysis = await updateAnalysisBasedOnEdits(record);
                        if (stopRef.current) { stopped = true; break; }

                        if (updatedAnalysis) {
                            const mergedBase: WorkerRecord = {
                                ...record,
                                ...updatedAnalysis,
                                auditTrail: [
                                    ...(record.auditTrail || []),
                                    {
                                        stage: 'reassessment',
                                        timestamp: new Date().toISOString(),
                                        actor: 'manager',
                                        note: buildReassessmentAuditNote(record, updatedAnalysis),
                                    }
                                ]
                            };
                            const mergedRecord: WorkerRecord = isFailedRecord(mergedBase)
                                ? mergedBase
                                : {
                                    ...mergedBase,
                                    ocrErrorType: undefined,
                                    ocrErrorMessage: undefined,
                                };
                            onUpdateRecord(mergedRecord);
                            successCount++;
                        } else {
                            failCount++;
                        }
                        shouldExitRetry = true; // Successfully completed (success or intentional null)
                    } catch (e: any) {
                        const eMsg = extractMessage(e);
                        if (eMsg === "STOPPED") { stopped = true; break; }
                        
                        // [IMPROVED] 429 에러 감지 및 처리 with retry limit
                        if (isRateLimitError(eMsg)) {
                            retryCount++;
                            console.warn(`Rate limit hit for ${record.name} (attempt ${retryCount}/${MAX_TEXT_RETRIES})`);
                            setQuotaExhausted(15);
                            dynamicDelayBuffer = Math.min(10, dynamicDelayBuffer + 2); // throttle 증가
                            
                            if (retryCount < MAX_TEXT_RETRIES) {
                                // 30초 대기 후 재시도
                                await waitWithCountdown(30, "⚠️ API 할당량 초과! 냉각 중");
                            } else {
                                // Max retries reached
                                failCount++;
                                console.error(`Max retries reached for ${record.name}`);
                                shouldExitRetry = true;
                            }
                        } else {
                            failCount++;
                            console.error(`Batch update error for ${record.name}:`, e);
                            shouldExitRetry = true; // Exit retry loop for non-rate-limit errors
                        }
                    }
                }

                if (stopRef.current) { stopped = true; break; }
                
                // 동적 지연 (429 회피)
                if (i < total - 1 && !stopRef.current) {
                    await waitWithCountdown(dynamicDelayBuffer, "다음 갱신 대기");
                }
            }
        } finally {
            setIsAnalyzing(false);
            setProgress('');
            setCooldownTime(0);
            setBatchProgress({ current: 0, total: 0 });
            if (stopped) {
                alert(`중단됨: 성공 ${successCount}, 실패 ${failCount}`);
            } else {
                alert(`완료: 성공 ${successCount}, 실패 ${failCount}`);
            }
        }
    };

    const handleBatchReanalyze = () => {
        const splitSize = getBatchSplitSize();
        const total = recordsWithImages.length;
        const splitWarning = total > splitSize
            ? `\n\n⚠️ 현재 분할 단위: ${splitSize}건 (설정에서 변경 가능)\n${total}건 중 ${splitSize}건씩 우선순위 순으로 처리됩니다.`
            : '';
        if (confirm(`전체 ${total}건 재분석 하시겠습니까?\n[주의] 무료 티어 한도는 시점/계정 상태에 따라 변동됩니다.${splitWarning}\n\n계속하시겠습니까?`)) {
            // 분할 단위가 total보다 작으면 우선순위 상위 splitSize건만 처리
            const sortedByPriority = [...recordsWithImages].sort((a, b) => getRetryPriorityScore(a) - getRetryPriorityScore(b));
            const batch = total > splitSize ? sortedByPriority.slice(0, splitSize) : sortedByPriority;
            runBatchAnalysis(batch, total > splitSize ? `전체 재분석 (${batch.length}/${total}건 우선 처리)` : "전체 재분석");
        }
    };

    const handleRetryFailed = () => {
        const hardTargets = failedRecords.filter(isHardRetryTarget);
        if (hardTargets.length === 0) {
            alert('재시도할 하드 실패 건이 없습니다.\n(점수 미달/저신뢰 건은 개별 검토를 권장합니다.)');
            return;
        }

        if (confirm(`하드 실패 ${hardTargets.length}건만 우선 재시도 하시겠습니까?\n(할당량 절약을 위해 저신뢰 경고 건은 제외)`)) {
            runBatchAnalysis(hardTargets, "하드 실패 재분석");
        }
    };

    const handleForceReanalyze = () => {
        if (failedRecords.length === 0) {
            alert('재분석할 실패/대기 건이 없습니다.');
            return;
        }

        const confirm_msg = confirm(
            `⚠️ 강제 재분석 모드\n\n실패/대기 건 ${failedRecords.length}건을 Preflight 검증을 우회하여\n` +
            `직접 Gemini API로 재분석하시겠습니까?\n\n` +
            `※ 유료 API를 사용하므로 재분석 결과가 나올 때까지 비용이 발생합니다.`
        );
        
        if (confirm_msg) {
            runBatchAnalysis(failedRecords, "강제 재분석 (Preflight 스킵)", true);
        }
    };

    // File Upload Handler (Simple Version)
    const handleAnalyze = async () => {
        // Redirect to file processing which uses same logic if needed, 
        // but typically file upload relies on user adding files first.
        // For mass file upload, we should also implement throttling if > 10 files.
        if (files.length === 0) return;
        
        setIsAnalyzing(true);
        setBatchProgress({ current: 0, total: files.length });
        stopRef.current = false;
        
        const results: WorkerRecord[] = [];
        let stopped = false;
        
        try {
            for (let i = 0; i < files.length; i++) {
                if (stopRef.current) { stopped = true; break; }
                setBatchProgress(p => ({ ...p, current: i + 1 }));
                setProgress(`분석 중: ${files[i].name}`);
                
                // [IMPROVED] 재시도 로직 추가 (무한 루프 방지)
                let retryCount = 0;
                const MAX_FILE_RETRIES = 2;
                let analyzed = false;
                
                while (retryCount < MAX_FILE_RETRIES && !analyzed && !stopRef.current) {
                    try {
                        const base64 = await fileToBase64(files[i]);
                        const res = await analyzeWorkerRiskAssessment(base64, files[i].type, files[i].name);
                        
                        if (stopRef.current) { stopped = true; break; }

                        if (res && res.length > 0) {
                            results.push(res[0]);
                            analyzed = true; // 성공 시 루프 종료
                        } else {
                            throw new Error("Empty result from AI");
                        }
                    } catch (e: any) {
                        const eMsg = e.message || JSON.stringify(e);
                        retryCount++;
                        
                        // 429 에러는 우아한 실패 (다음 파일로)
                        if (isRateLimitError(eMsg)) {
                            console.warn(`Rate limit hit on file ${files[i].name}`);
                            setQuotaExhausted(60);
                            const failMessage = '⛔ API 할당량 초과로 분석 실패 (재시도 필요)';
                            results.push(createFileAnalysisErrorRecord(files[i], failMessage, 'UNKNOWN'));
                            const next = incrementApiCallCount('fail');
                            setDailyCounter(next);
                            analyzed = true;
                            break; // 이 파일 건너뛰기
                        }
                        
                        // 다른 에러는 재시도
                        if (retryCount < MAX_FILE_RETRIES) {
                            await waitWithCountdown(30, `재시도 중 (${retryCount}/${MAX_FILE_RETRIES})`);
                        } else {
                            console.error(`Failed after ${MAX_FILE_RETRIES} retries:`, e);
                            const failMessage = `⛔ 파일 분석 실패: ${extractMessage(e) || '알 수 없는 오류'}`;
                            results.push(createFileAnalysisErrorRecord(files[i], failMessage, 'UNKNOWN'));
                            const next = incrementApiCallCount('fail');
                            setDailyCounter(next);
                            analyzed = true;
                            alert(`파일 분석 실패: ${files[i].name}`);
                        }
                    }
                }
                
                // 파일 분석 간 지연
                if (i < files.length - 1 && !stopRef.current && analyzed) {
                    await waitWithCountdown(4, "다음 파일 대기");
                }
            }
            
            if (results.length > 0) onAnalysisComplete(results);
        } finally {
            setIsAnalyzing(false);
            setFiles([]);
            setProgress('');
            setCooldownTime(0);
            setBatchProgress({ current: 0, total: 0 });
            if(stopped) alert("중단됨");
        }
    };

    const handleExport = () => {
        if(!confirm("경고: 이미지 데이터가 포함된 백업 파일은 용량이 매우 클 수 있습니다.\n계속하시겠습니까?")) return;
        const dataStr = JSON.stringify(existingRecords, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PSI_Backup_${new Date().toISOString().slice(0,10)}.json`;
        link.click();
    };

    const extractImportRecords = (payload: unknown): unknown[] => {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== 'object') return [];

        const obj = payload as Record<string, unknown>;
        const candidates = [obj.records, obj.workerRecords, obj.data, obj.items];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) return candidate;
        }
        return [];
    };

    const analyzeImportSchema = (records: unknown[]) => {
        const requiredStringFields = ['id', 'name', 'jobField', 'date', 'nationality', 'safetyLevel'];
        const requiredArrayFields = ['strengths', 'weakAreas', 'suggestions'];
        const requiredNumberFields = ['safetyScore'];

        const missingFieldCounts: Record<string, number> = {};
        const typeIssueCounts: Record<string, number> = {};
        const sampleIssues: string[] = [];

        const objectItems = records.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
        let itemsWithIssues = 0;
        let validLikeItems = 0;

        const addCount = (bucket: Record<string, number>, key: string) => {
            bucket[key] = (bucket[key] || 0) + 1;
        };

        objectItems.forEach((item, idx) => {
            const missingFields: string[] = [];
            const typeFields: string[] = [];

            for (const field of requiredStringFields) {
                const val = item[field];
                const valid = typeof val === 'string' && val.trim().length > 0;
                if (!valid) {
                    missingFields.push(field);
                    addCount(missingFieldCounts, field);
                }
            }

            for (const field of requiredArrayFields) {
                const val = item[field];
                if (!Array.isArray(val)) {
                    typeFields.push(`${field}(array)`);
                    addCount(typeIssueCounts, `${field}(array)`);
                }
            }

            for (const field of requiredNumberFields) {
                const val = item[field];
                const validNumber = typeof val === 'number' && Number.isFinite(val);
                if (!validNumber) {
                    typeFields.push(`${field}(number)`);
                    addCount(typeIssueCounts, `${field}(number)`);
                }
            }

            if (missingFields.length > 0 || typeFields.length > 0) {
                itemsWithIssues++;
                if (sampleIssues.length < 8) {
                    sampleIssues.push(`- #${idx + 1}: 누락[${missingFields.join(', ') || '-'}], 타입[${typeFields.join(', ') || '-'}]`);
                }
            } else {
                validLikeItems++;
            }
        });

        const invalidItems = records.length - objectItems.length;
        const problematicItems = invalidItems + itemsWithIssues;

        const sortedMissing = Object.entries(missingFieldCounts).sort((a, b) => b[1] - a[1]);
        const sortedTypes = Object.entries(typeIssueCounts).sort((a, b) => b[1] - a[1]);

        const summary = `검증 완료: 전체 ${records.length}건 / 객체형 ${objectItems.length}건 / 문제 항목 ${problematicItems}건`;
        const details = [
            `총 레코드: ${records.length}`,
            `객체형 레코드: ${objectItems.length}`,
            `구조 자체 오류(객체 아님): ${invalidItems}`,
            `필드 오류 포함 레코드: ${itemsWithIssues}`,
            `기준 필드 충족 레코드: ${validLikeItems}`,
            '',
            '[누락 필드 TOP]',
            ...(sortedMissing.length > 0 ? sortedMissing.map(([k, v]) => `- ${k}: ${v}`) : ['- 없음']),
            '',
            '[타입 불일치 TOP]',
            ...(sortedTypes.length > 0 ? sortedTypes.map(([k, v]) => `- ${k}: ${v}`) : ['- 없음']),
            '',
            '[샘플 오류]',
            ...(sampleIssues.length > 0 ? sampleIssues : ['- 없음'])
        ].join('\n');

        return {
            objectItems,
            problematicItems,
            summary,
            details,
        };
    };

    const handleImportFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (re) => {
            try {
                const data = JSON.parse(re.target?.result as string);
                const records = extractImportRecords(data);
                if (!Array.isArray(records) || records.length === 0) {
                    alert('복구 가능한 근로자 기록을 찾지 못했습니다. (배열 또는 records/workerRecords 키 필요)');
                    return;
                }

                const validation = analyzeImportSchema(records);
                setImportValidationSummary(validation.summary);
                setImportValidationDetails(validation.details);

                if (validation.objectItems.length === 0) {
                    alert('복구 가능한 객체형 근로자 기록이 없습니다. JSON 구조를 확인해주세요.');
                    return;
                }

                onImport(validation.objectItems as WorkerRecord[]);
                alert(`백업 복구 요청 완료\n- 원본: ${records.length}건\n- 복구 대상: ${validation.objectItems.length}건\n- 문제 항목: ${validation.problematicItems}건\n\n상세는 화면의 '복구 파일 스키마 검증 결과'를 확인하세요.`);
            } catch (err) {
                alert('파일 형식이 잘못되었습니다.');
            } finally {
                if (importInputRef.current) importInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="space-y-8 animate-fade-in-up">
            {/* Control Panel */}
            <div className="bg-slate-900 rounded-3xl p-5 sm:p-8 shadow-2xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-48 -mt-48"></div>
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-8">
                    <div className="flex-1 text-center lg:text-left">
                        <h3 className="text-xl sm:text-2xl font-black mb-2 flex items-center gap-3 justify-center lg:justify-start">
                            기록 데이터 마스터 관리
                            <span className="text-xs bg-indigo-600 px-2 py-1 rounded-md font-bold uppercase tracking-widest">PRO</span>
                        </h3>
                        <p className="text-slate-400 font-medium">
                            <span className="text-indigo-400 font-bold">스마트 스로틀링(Smart Throttling)</span> 및 <span className="text-indigo-400 font-bold">Gemini Flash</span> 최적화로, 
                            10,000장 이상의 대량 기록도 API 할당량에 맞춰 자동으로 속도를 조절하며 전수 분석합니다. (무료 티어 한도는 계정/시점별 변동)
                        </p>
                        <div className="flex justify-center lg:justify-start gap-8 mt-6">
                            <div className="text-center">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">총 기록수</p>
                                <p className="text-2xl font-black text-indigo-400">{existingRecords.length}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">분석 실패/대기</p>
                                <p className={`text-2xl font-black ${failedRecords.length > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`}>{failedRecords.length}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">신뢰도 미달(&lt;70%)</p>
                                <p className={`text-2xl font-black ${lowConfidenceCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>{lowConfidenceCount}</p>
                            </div>
                            <div className="text-center border-l border-white/10 pl-8">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">오늘 API 호출</p>
                                <p className={`text-2xl font-black ${dailyCounter.count > 800 ? 'text-rose-400' : dailyCounter.count > 400 ? 'text-amber-400' : 'text-emerald-400'}`}>{dailyCounter.count}</p>
                                <p className="text-[9px] text-slate-600 mt-0.5">✓{dailyCounter.successCount} ✗{dailyCounter.failCount}</p>
                                <button onClick={() => { resetApiCallCount(); setDailyCounter(getApiCallState()); }} className="text-[9px] text-slate-500 hover:text-slate-300 underline mt-0.5" title="오늘 카운터 초기화">초기화</button>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-2.5 sm:gap-3 w-full lg:w-auto">
                        {/* Retry Button */}
                        {failedRecords.length > 0 && !isAnalyzing && (
                            <button 
                                onClick={handleRetryFailed}
                                className="w-full sm:w-auto px-5 sm:px-6 py-3 bg-rose-600 hover:bg-rose-700 rounded-2xl font-black text-sm shadow-xl transition-all border border-rose-500 flex items-center justify-center gap-2 group animate-bounce"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                실패/대기 건 스마트 재분석 ({failedRecords.length})
                            </button>
                        )}
                        
                        {/* Force Reanalyze Button */}
                        {failedRecords.length > 0 && !isAnalyzing && (
                            <button 
                                onClick={handleForceReanalyze}
                                className="w-full sm:w-auto px-5 sm:px-6 py-3 bg-red-700 hover:bg-red-800 rounded-2xl font-black text-sm shadow-xl transition-all border border-red-600 flex items-center justify-center gap-2 group"
                                title="Preflight 검증을 우회하고 모든 실패/대기 건을 직접 API로 재분석합니다"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                강제 재분석 (검증 스킵)
                            </button>
                        )}
                        
                        {recordsWithImages.length > 0 && !isAnalyzing && (
                            <button 
                                onClick={handleBatchReanalyze}
                                className="w-full sm:w-auto px-5 sm:px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-2xl font-black text-sm shadow-xl transition-all border border-emerald-500 flex items-center justify-center gap-2 group"
                            >
                                <svg className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth={2.5}/></svg>
                                전체 일괄 재분석 (OCR)
                            </button>
                        )}
                        
                        <button onClick={() => importInputRef.current?.click()} className="w-full sm:w-auto px-5 sm:px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl font-black text-sm transition-all">JSON 불러오기</button>
                        <input type="file" ref={importInputRef} className="hidden" accept=".json" onChange={(e) => {
                             const file = e.target.files?.[0];
                             if (file) handleImportFile(file);
                        }} />
                        <button onClick={handleExport} className="w-full sm:w-auto px-5 sm:px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-2xl font-black text-sm shadow-xl transition-all">백업 내보내기</button>
                        <button onClick={onDeleteAll} className="w-full sm:w-auto px-5 sm:px-6 py-3 bg-rose-600 hover:bg-rose-700 rounded-2xl font-black text-sm shadow-xl transition-all">전체 삭제</button>
                    </div>
                </div>

                {/* Progress Bar with Cooldown Indicator */}
                {isAnalyzing && (
                    <div className="mt-8 pt-6 border-t border-white/10 animate-fade-in">
                        <div className="flex justify-between items-end mb-2">
                            <span className={`text-sm font-black uppercase tracking-widest flex items-center gap-2 ${cooldownTime > 0 ? 'text-yellow-400' : 'text-indigo-400'}`}>
                                <span className={`w-2 h-2 rounded-full animate-pulse ${cooldownTime > 0 ? 'bg-yellow-400' : 'bg-indigo-400'}`}></span>
                                {progress}
                            </span>
                            <span className="text-sm font-black">{batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}%</span>
                        </div>
                        <div className="w-full bg-white/10 h-4 rounded-full overflow-hidden mb-4 relative">
                            <div 
                                className={`h-full transition-all duration-300 ease-out ${cooldownTime > 0 ? 'bg-yellow-500' : 'bg-gradient-to-r from-indigo-500 to-emerald-400'}`}
                                style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
                            ></div>
                            {cooldownTime > 0 && (
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-black/50 uppercase tracking-widest">
                                    API Cooling Down... {cooldownTime}s
                                </div>
                            )}
                        </div>
                        <div className="flex justify-center">
                            <button 
                                onClick={stopAnalysis} 
                                className="px-8 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-sm shadow-xl transition-all flex items-center gap-2 animate-pulse"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                분석 즉시 중단 (STOP)
                            </button>
                        </div>
                        <p className="text-center text-xs text-slate-400 mt-2 font-medium">대량 분석 중입니다. 창을 닫지 마세요.</p>
                    </div>
                )}

                {retryDiagnostics && (
                    <div className="mt-6 pt-5 border-t border-white/10 animate-fade-in">
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">서버 성공</p>
                                <p className="mt-1 text-2xl font-black text-emerald-200">{retryDiagnostics.serverSuccess}</p>
                            </div>
                            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">폴백 성공</p>
                                <p className="mt-1 text-2xl font-black text-cyan-200">{retryDiagnostics.clientFallbackSuccess}</p>
                            </div>
                            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">사전 검증 실패</p>
                                <p className="mt-1 text-2xl font-black text-amber-200">{retryDiagnostics.preflightFail}</p>
                            </div>
                            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-rose-300">OCR 처리 실패</p>
                                <p className="mt-1 text-2xl font-black text-rose-200">{retryDiagnostics.processingFail}</p>
                            </div>
                            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">서버 라우트 실패</p>
                                <p className="mt-1 text-2xl font-black text-violet-200">{retryDiagnostics.serverRouteFail}</p>
                            </div>
                        </div>
                        <p className="mt-3 text-[11px] font-bold text-slate-400">
                            마지막 재분석 집계 · 총 {retryDiagnostics.total}건 / 성공 {retryDiagnostics.success}건 / 실패 {retryDiagnostics.fail}건
                        </p>
                    </div>
                )}

                {importValidationSummary && (
                    <div className="mt-6 pt-5 border-t border-white/10 animate-fade-in">
                        <div className="bg-black/20 border border-white/10 rounded-2xl p-4 sm:p-5">
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <h4 className="text-sm sm:text-base font-black text-indigo-300">복구 파일 스키마 검증 결과</h4>
                                <button
                                    onClick={() => {
                                        setImportValidationSummary('');
                                        setImportValidationDetails('');
                                    }}
                                    className="text-[11px] text-slate-300 hover:text-white font-bold"
                                >
                                    닫기
                                </button>
                            </div>
                            <p className="text-xs sm:text-sm text-emerald-300 font-bold mb-3">{importValidationSummary}</p>
                            <pre className="text-[11px] sm:text-xs leading-relaxed text-slate-200 bg-black/30 rounded-xl p-3 overflow-x-auto max-h-56 whitespace-pre-wrap">{importValidationDetails}</pre>
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 sm:p-6">
                <CollapsibleSection
                    title="기록 양식·공종/팀 배정 관리"
                    summary={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">양식 {masterTemplates.length} · 그룹 {masterGroups.length} · 배정 {masterAssignments.length}</span>}
                >
                    <div className="space-y-5">
                        <div className="flex flex-col gap-1">
                            <p className="text-sm font-bold text-slate-500">기록 양식을 만들고, 공종/팀별로 사용할 양식을 쉽게 지정할 수 있습니다.</p>
                        </div>

                        <CollapsibleSection
                            title="기록 양식 관리"
                            isOpen={openMasterSection === 'templates'}
                            onToggle={() => setOpenMasterSection((prev) => prev === 'templates' ? null : 'templates')}
                            summary={<span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-black text-indigo-700">총 {masterTemplates.length}개</span>}
                        >
                            <MasterTemplateList
                                templates={masterTemplates}
                                selectedTemplateId={selectedMasterTemplateId}
                                onSelectTemplate={setSelectedMasterTemplateId}
                                onCreateTemplate={handleCreateMasterTemplate}
                                onDeleteTemplate={handleDeleteMasterTemplate}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="공종·팀별 기록 양식 배정"
                            isOpen={openMasterSection === 'assignments'}
                            onToggle={() => setOpenMasterSection((prev) => prev === 'assignments' ? null : 'assignments')}
                            summary={<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">그룹 {masterGroups.length} · 배정 {masterAssignments.length}</span>}
                        >
                            <MasterAssignment
                                groups={masterGroups}
                                templates={masterTemplates}
                                assignments={masterAssignments}
                                onAddGroup={handleAddMasterGroup}
                                onDeleteGroup={handleDeleteMasterGroup}
                                onCreateAssignment={handleCreateMasterAssignment}
                                onDeleteAssignment={handleDeleteMasterAssignment}
                                onSetAssignmentStatus={handleSetMasterAssignmentStatus}
                            />
                        </CollapsibleSection>
                    </div>
                </CollapsibleSection>
            </div>

            {primaryFailedRecord && primaryFailedErrorType && (
                <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-5 sm:p-6 shadow-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <p className="text-xs font-black text-rose-600 uppercase tracking-widest">OCR 오류 자동 분류</p>
                            <h4 className="text-lg sm:text-xl font-black text-rose-800 mt-1">{primaryFailedRecord.name || '미상'} · {getOcrErrorTypeKoreanLabel(primaryFailedErrorType)}</h4>
                            <p className="text-sm font-bold text-rose-700 mt-2">{getOcrErrorGuideMessage(primaryFailedErrorType)}</p>
                            {primaryFailedPreflightReason && (
                                <p className="text-xs font-black text-rose-900 mt-2">사전검증 실패 사유: {primaryFailedPreflightReason}</p>
                            )}
                        </div>
                        <button
                            onClick={handleRetryCapture}
                            className="w-full sm:w-auto px-6 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-base shadow-xl transition-all"
                        >
                            🔄 다시 촬영하기
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 flex flex-col gap-4 no-print">
                <div className="flex items-center justify-between gap-3">
                    <h4 className="text-base sm:text-lg font-black text-slate-900">검색 및 필터링</h4>
                    <span className="text-[11px] font-bold text-slate-500">데이터 목록 전용</span>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
                    <div className="relative flex-1 w-full">
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth={2}/></svg>
                        <input type="text" placeholder="근로자 명, 공종 등으로 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold" />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-xs font-bold text-slate-500">팀장 필터:</label>
                        <select value={filterLeader} onChange={(e) => setFilterLeader(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[120px]">
                            <option value="all">전체</option>
                            {teamLeaders.map(leader => (
                                <option key={leader} value={leader}>{leader}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-xs font-bold text-slate-500">신뢰 상태:</label>
                        <select value={filterTrust} onChange={(e) => setFilterTrust(e.target.value as 'all' | 'pending' | 'finalized')} className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[120px]">
                            <option value="all">전체</option>
                            <option value="pending">재검토 대기</option>
                            <option value="finalized">최종확정</option>
                        </select>
                    </div>
                    <button onClick={handleBatchTextAnalysis} 
                        disabled={isAnalyzing}
                        className="w-full md:w-auto px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        수정사항 AI 반영 갱신
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                <th className="px-4 sm:px-8 py-4">근로자 정보</th>
                                <th className="px-4 sm:px-8 py-4">공종/직군</th>
                                <th className="px-4 sm:px-8 py-4">팀장 (Leader)</th>
                                <th className="px-4 sm:px-8 py-4 text-center">안전 점수</th>
                                <th className="px-4 sm:px-8 py-4 text-center">이미지 상태</th>
                                <th className="px-4 sm:px-8 py-4 text-right">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 font-medium">
                            {filteredRecords.map((r: WorkerRecord) => {
                                const isManager = isManagementRole(r.jobField);
                                const hasImage = hasRetryableOriginalImage(r.originalImage);
                                const failed = isFailedRecord(r);
                                const rowErrorType = failed ? getOcrErrorTypeFromRecord(r) : null;
                                const rowGuideMessage = rowErrorType ? getOcrErrorGuideMessage(rowErrorType) : '';
                                const rowGuideSummary = rowErrorType ? getOcrErrorGuideSummary(rowErrorType) : '';
                                const rowGuideMobile = rowErrorType ? getOcrErrorMobileLabel(rowErrorType) : '';
                                const preflightReason = failed ? getPreflightFailureReason(r) : null;
                                
                                return (
                                    <tr key={r.id} className={`hover:bg-indigo-50/30 transition-colors group ${isManager ? 'bg-slate-50/50 opacity-80' : ''} ${failed ? 'bg-rose-50/50' : ''}`} onClick={() => onViewDetails(r)}>
                                        <td className="px-4 sm:px-8 py-5 font-black text-slate-800">
                                            <div className="flex flex-col">
                                                <span className={`flex items-center gap-1 ${failed ? 'text-rose-600' : ''}`}>
                                                    {r.name}
                                                    {getLeaderIcon(r)}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-bold tracking-wider">{r.nationality} | {r.date}</span>
                                                {typeof r.ocrConfidence === 'number' && (
                                                    <span className="text-[9px] text-slate-500 font-bold">OCR 신뢰도: {(r.ocrConfidence * 100).toFixed(0)}%</span>
                                                )}
                                                {failed && <span className="text-[9px] text-rose-500 font-bold">⚠️ 분석 필요/실패</span>}
                                                {failed && rowErrorType && (
                                                    <span className="mt-1 inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-100 text-rose-700 border border-rose-200">
                                                        {getOcrErrorTypeKoreanLabel(rowErrorType)}
                                                    </span>
                                                )}
                                                {failed && rowGuideMessage && (
                                                    <>
                                                        <span className="sm:hidden text-[10px] text-rose-700 font-black mt-1 leading-snug" title={rowGuideMessage}>
                                                            {rowGuideMobile}
                                                        </span>
                                                        <span className="hidden sm:block text-[10px] text-rose-700 font-bold mt-1 leading-snug" title={rowGuideMessage}>
                                                            {rowGuideSummary}
                                                        </span>
                                                    </>
                                                )}
                                                {failed && preflightReason && (
                                                    <span className="text-[10px] text-amber-700 font-black mt-1 leading-snug">
                                                        사전검증: {preflightReason}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 sm:px-8 py-5 text-slate-500 font-bold">{r.jobField}</td>
                                        <td className="px-4 sm:px-8 py-5 text-slate-600 font-bold text-sm">
                                            {r.teamLeader && r.teamLeader !== '미지정' ? (
                                                <span className={`bg-slate-100 px-2 py-1 rounded border border-slate-200 ${getLeaderIcon(r) ? 'text-indigo-600 font-black border-indigo-200 bg-indigo-50' : 'text-slate-600'}`}>
                                                    {r.teamLeader}
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 text-xs">미지정</span>
                                            )}
                                        </td>
                                        <td className="px-4 sm:px-8 py-5 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className={`px-3 py-1 rounded-full text-xs font-black shadow-sm ${getSafetyLevelClass(r.safetyLevel)}`}>{r.safetyScore}</span>
                                                <span className="text-[10px] font-black text-slate-500">{r.safetyLevel}</span>
                                                {needsGradeRevalidation(r) && (
                                                    <span className="text-[9px] font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded">등급 재검증 필요</span>
                                                )}
                                                {getReviewTrustState(r) === 'PENDING' && (
                                                    <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded">재검토 대기</span>
                                                )}
                                                {getReviewTrustState(r) === 'FINALIZED' && (
                                                    <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">최종확정</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 sm:px-8 py-5 text-center">
                                            {hasImage ? (
                                                <span className="text-emerald-500 font-black text-[9px] uppercase">OK</span>
                                            ) : (
                                                <span className="text-rose-400 font-black text-[9px] uppercase bg-rose-100 px-2 py-1 rounded">IMG LOSS</span>
                                            )}
                                        </td>
                                        <td className="px-4 sm:px-8 py-5 text-right">
                                            <div className="flex justify-end gap-2">
                                                {failed && !isAnalyzing && hasImage && (
                                                    <button onClick={(e) => { e.stopPropagation(); runBatchAnalysis([r], '개별 재분석'); }} className="px-3 py-2 bg-rose-100 text-rose-600 font-bold text-xs rounded-xl hover:bg-rose-200 transition-all">
                                                        재시도
                                                    </button>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); onViewDetails(r); }} className="px-4 py-2 bg-white border border-slate-200 text-indigo-600 font-black text-xs rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm">상세검증 바로가기</button>
                                                <button onClick={(e) => { e.stopPropagation(); onOpenReport(r); }} className="px-4 py-2 bg-slate-900 text-white font-black text-xs rounded-xl hover:bg-black transition-all shadow-sm">리포트 바로가기</button>
                                                <button onClick={(e) => { e.stopPropagation(); onDeleteRecord(r.id); }} className="p-2 bg-slate-100 text-slate-400 hover:bg-rose-500 hover:text-white rounded-xl transition-all" title="삭제">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="new-ocr-capture-section" className="bg-white p-5 sm:p-10 rounded-3xl shadow-xl border border-slate-100 overflow-hidden relative">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">신규 기록 분석</h3>
                <FileUpload onFilesChange={setFiles} onAnalyze={() => {}} isAnalyzing={isAnalyzing} fileCount={files.length} />
                {files.length > 0 && !isAnalyzing && (
                    <div className="mt-8 flex justify-center">
                        <button onClick={handleAnalyze} className="w-full max-w-md py-4 sm:py-5 bg-indigo-600 text-white text-xl sm:text-2xl font-black rounded-2xl shadow-2xl hover:bg-indigo-700 transition-all animate-pulse-gold">신규 분석 시작</button>
                    </div>
                )}
            </div>
        </div>
    );
};
export default OcrAnalysis;

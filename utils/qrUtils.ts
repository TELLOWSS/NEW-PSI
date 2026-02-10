
import type { WorkerRecord } from '../types';

/**
 * [QR 데이터 생성 유틸리티]
 * 
 * 공유 링크(QR) 생성 시 URL 길이 제한(약 2000자)을 넘지 않도록
 * 이미지 데이터는 절대 포함하지 않고 순수 텍스트 데이터만 압축합니다.
 */

// 1단계: 전체 텍스트 데이터 포함 (이미지 제외)
const minifyFull = (record: WorkerRecord) => {
    const safeStr = (val: unknown): string => (typeof val === 'string') ? val : String(val ?? "");
    const safeNum = (val: unknown): number => (typeof val === 'number') ? val : Number(val) || 0;
    const safeArr = (val: unknown): string[] => Array.isArray(val) ? val.filter(v => typeof v === 'string') as string[] : [];
    // 배열 데이터를 | 로 구분하여 압축
    const safeJoin = (arr: unknown[], limit: number): string => safeArr(arr).slice(0, limit).map(safeStr).join('|');

    return [
        4, // Schema Version (Updated)
        safeStr(record.name).substring(0, 15),
        safeStr(record.jobField).substring(0, 10),
        safeStr(record.date),
        safeStr(record.nationality),
        safeNum(record.safetyScore),
        safeStr(record.safetyLevel),
        safeJoin(record.weakAreas, 2), // 취약점 최대 2개
        safeJoin(record.strengths, 1), // 강점 최대 1개
        safeStr(record.aiInsights).substring(0, 100), // 인사이트 100자 제한
        safeStr(record.teamLeader || ""),
        safeStr(record.role || "worker"),
        // 이미지는 URL 용량 초과 원인이므로 절대 포함하지 않음
    ];
};

const encodeData = (data: unknown[]): string => {
    try {
        const jsonStr = JSON.stringify(data);
        // UTF-8 안전 인코딩
        const utf8 = unescape(encodeURIComponent(jsonStr));
        const base64 = window.btoa(utf8);
        // URL 안전 문자열로 변환
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
        console.warn("Encoding failed", e);
        return "";
    }
};

export const generateReportUrl = (record: WorkerRecord): string => {
    try {
        if (!record) return "";
        const baseUrl = window.location.origin + window.location.pathname; // 현재 도메인 주소
        
        // 텍스트 데이터만 포함하여 인코딩
        const payload = encodeData(minifyFull(record));
        
        return `${baseUrl}?d=${payload}`;
    } catch (e) {
        return "";
    }
};

export const restoreRecordFromUrl = (safeBase64: string): WorkerRecord | null => {
    try {
        if (!safeBase64 || typeof safeBase64 !== 'string') return null;

        const base64 = safeBase64.replace(/-/g, '+').replace(/_/g, '/');
        const utf8Bytes = window.atob(base64);
        const jsonStr = decodeURIComponent(escape(utf8Bytes));
        const data = JSON.parse(jsonStr);

        if (!Array.isArray(data)) return null;

        const safeGet = (index: number, defaultVal: unknown = ""): unknown => (data[index] !== undefined && data[index] !== null) ? data[index] : defaultVal;
        const splitStr = (val: unknown): string[] => (typeof val === 'string' && val.length > 0) ? val.split('|') : [];

        // 복원 시 이미지는 없으므로 빈 값 처리 (공유 받은 사람은 텍스트만 확인 가능)
        return {
            id: `shared-${Date.now()}`,
            name: String(safeGet(1, "공유된 근로자")),
            jobField: String(safeGet(2, "미분류")),
            date: String(safeGet(3, new Date().toISOString().split('T')[0])),
            nationality: String(safeGet(4, "미상")),
            safetyScore: Number(safeGet(5, 0)),
            safetyLevel: String(safeGet(6, "초급")) as '초급' | '중급' | '고급',
            weakAreas: splitStr(safeGet(7)),
            strengths: splitStr(safeGet(8)),
            aiInsights: String(safeGet(9, "공유된 요약 리포트입니다.")),
            teamLeader: String(safeGet(10, "")),
            role: String(safeGet(11, "worker")) as 'worker' | 'leader' | 'sub_leader',
            
            // 필수 필드 기본값 채움
            aiInsights_native: "",
            weakAreas_native: [],
            strengths_native: [],
            handwrittenAnswers: [],
            improvement: "",
            improvement_native: "",
            suggestions: [],
            suggestions_native: [],
            selfAssessedRiskLevel: '중',
            language: 'unknown',
            fullText: '',
            koreanTranslation: '',
            originalImage: undefined, // 이미지는 공유되지 않음
            profileImage: undefined   // 이미지는 공유되지 않음
        };
    } catch (e) {
        console.warn("Restoration failed", e);
        return null;
    }
};

import type { AccidentBigDataRecord } from '../types';
import type { AccidentCrossLinkAlert } from './accidentBigData';
import type { TbmAccidentCase, TbmEvidenceSource } from './tbmEducationStudio';

export const ACCIDENT_EDUCATION_HANDOFF_KEY = 'psi_accident_education_handoff_v1';

export interface AccidentEducationHandoff {
  id: string;
  createdAt: string;
  sourceLabel: string;
  workType: string;
  accidentCases: TbmAccidentCase[];
  evidenceSource: TbmEvidenceSource;
  riskHint?: { risk: string; action: string };
}

const cleanText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

const formatTitle = (record: AccidentBigDataRecord): string => {
  const trade = cleanText(record.jobField) || '전체 공종';
  const task = cleanText(record.workTask);
  const hazard = cleanText(record.hazardType) || '위험요인';
  return task ? `[${trade}] ${task} · ${hazard}` : `[${trade}] ${hazard} 사고 사례`;
};

const toTbmAccidentCase = (record: AccidentBigDataRecord): TbmAccidentCase => {
  const sourceParts = [cleanText(record.sourceContractor), cleanText(record.siteName)].filter(Boolean);
  const relevanceParts = [
    cleanText(record.jobField),
    cleanText(record.workStage),
    cleanText(record.hazardType),
  ].filter(Boolean);

  return {
    id: `bigdata-${record.id}`,
    title: formatTitle(record),
    occurredAt: cleanText(record.occurredDate),
    source: sourceParts.join(' · ') || '사고 빅데이터',
    summary: cleanText(record.summary) || formatTitle(record),
    siteRelevance: relevanceParts.join(' · ') || '현장 동종 작업 유의',
    lesson:
      cleanText(record.preventionMeasure) ||
      cleanText(record.rootCause) ||
      cleanText(record.directCause) ||
      '작업 전 위험요인 확인 및 안전수칙·보호구 착용 점검',
  };
};

export function buildAccidentEducationHandoffFromRecord(
  record: AccidentBigDataRecord,
): AccidentEducationHandoff {
  const now = new Date().toISOString();
  const workType = cleanText(record.jobField) || '전체 공종';
  const title = formatTitle(record);
  const accidentCase = toTbmAccidentCase(record);
  const hazard = cleanText(record.hazardType) || workType;
  const action =
    cleanText(record.preventionMeasure) ||
    cleanText(record.rootCause) ||
    cleanText(record.directCause) ||
    '작업 전 위험요인 제거 및 안전조치 확인';

  const sourceLines = [
    `[사고 빅데이터 연계 사례] ${title}`,
    record.occurredDate ? `- 발생일: ${cleanText(record.occurredDate)}` : '',
    record.sourceContractor || record.siteName
      ? `- 출처/현장: ${[cleanText(record.sourceContractor), cleanText(record.siteName)].filter(Boolean).join(' · ')}`
      : '',
    `- 공종/세부작업: ${workType}${record.workTask ? ` · ${cleanText(record.workTask)}` : ''}`,
    record.workStage ? `- 작업단계: ${cleanText(record.workStage)}` : '',
    `- 위험유형: ${hazard}${record.severity ? ` (${cleanText(record.severity)})` : ''}`,
    record.summary ? `- 사고 내용: ${cleanText(record.summary)}` : '',
    record.directCause ? `- 직접 원인: ${cleanText(record.directCause)}` : '',
    record.rootCause ? `- 근본 원인: ${cleanText(record.rootCause)}` : '',
    `- 재발 방지 대책: ${action}`,
    Array.isArray(record.preWorkCheckpoints) && record.preWorkCheckpoints.length > 0
      ? `- 작업 전 확인: ${record.preWorkCheckpoints.map(cleanText).filter(Boolean).join(' / ')}`
      : '',
  ].filter(Boolean);

  return {
    id: `rec-${record.id}-${Date.now()}`,
    createdAt: now,
    sourceLabel: title,
    workType,
    accidentCases: [accidentCase],
    evidenceSource: {
      id: `bigdata-src-${record.id}`,
      kind: 'manual',
      title: `[사고 빅데이터] ${title}`,
      text: sourceLines.join('\n'),
      createdAt: now,
    },
    riskHint:
      cleanText(record.hazardType) || cleanText(record.preventionMeasure)
        ? { risk: hazard, action }
        : undefined,
  };
}

export function buildAccidentEducationHandoffFromAlert(
  alert: AccidentCrossLinkAlert,
  matchingRecords: readonly AccidentBigDataRecord[] = [],
): AccidentEducationHandoff {
  const now = new Date().toISOString();
  const workType = cleanText(alert.jobField) || '전체 공종';
  const topHazard = cleanText(alert.topHazard) || '주요 위험요인';

  const prioritized = [...matchingRecords]
    .sort((a, b) => {
      const severityScore = (item: AccidentBigDataRecord) =>
        item.severity === '중대재해'
          ? 4
          : item.severity === '중상(장기·입원)'
            ? 3
            : item.severity === '휴업재해(3일↑)'
              ? 2
              : 1;
      const diff = severityScore(b) - severityScore(a);
      if (diff !== 0) return diff;
      return cleanText(b.occurredDate).localeCompare(cleanText(a.occurredDate));
    })
    .slice(0, 3);

  const accidentCases: TbmAccidentCase[] =
    prioritized.length > 0
      ? prioritized.map(toTbmAccidentCase)
      : [
          {
            id: `bigdata-alert-${workType}`,
            title: `[${workType}] ${topHazard} 집중 경보`,
            occurredAt: '',
            source: '사고 빅데이터 공종 경보',
            summary:
              cleanText(alert.reasonSummary) ||
              `${workType} 공종 사고 ${alert.accidentCount}건 (중상·중대 ${alert.severeCount}건) 분석`,
            siteRelevance: `${workType} · 주 위험 ${topHazard}`,
            lesson:
              alert.checkpoints.map(cleanText).filter(Boolean).slice(0, 2).join(' / ') ||
              '해당 공종 핵심 위험요인 사전 점검 및 작업중지 기준 공유',
          },
        ];

  const topPrevention =
    prioritized.map((r) => cleanText(r.preventionMeasure)).find(Boolean) ||
    alert.checkpoints.map(cleanText).find(Boolean) ||
    '해당 공종 핵심 위험요인 사전 점검 및 작업중지 기준 공유';

  const sourceLines = [
    `[사고 빅데이터 공종 경보 연계] ${workType} · 주 위험 [${topHazard}]`,
    `- 누적 사고: ${alert.accidentCount}건 (중상·중대 ${alert.severeCount}건)`,
    alert.reasonSummary ? `- 분석 요약: ${cleanText(alert.reasonSummary)}` : '',
    alert.checkpoints.length > 0
      ? `- 핵심 점검사항: ${alert.checkpoints.map(cleanText).filter(Boolean).join(' / ')}`
      : '',
    ...prioritized.map(
      (item, idx) =>
        `- 대표 사례 ${idx + 1}: ${cleanText(item.occurredDate)} ${cleanText(item.summary)} (대책: ${cleanText(item.preventionMeasure) || cleanText(item.rootCause) || '안전수칙 준수'})`,
    ),
  ].filter(Boolean);

  return {
    id: `alert-${workType}-${Date.now()}`,
    createdAt: now,
    sourceLabel: `${workType} 공종 · 주 위험 [${topHazard}]`,
    workType,
    accidentCases,
    evidenceSource: {
      id: `bigdata-alert-src-${workType}`,
      kind: 'manual',
      title: `[사고 빅데이터 경보] ${workType} (${topHazard})`,
      text: sourceLines.join('\n'),
      createdAt: now,
    },
    riskHint: {
      risk: topHazard,
      action: topPrevention,
    },
  };
}

export function saveAccidentEducationHandoff(handoff: AccidentEducationHandoff): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACCIDENT_EDUCATION_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // Ignore storage quota errors
  }
}

export function readAccidentEducationHandoff(): AccidentEducationHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACCIDENT_EDUCATION_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const candidate = parsed as Partial<AccidentEducationHandoff>;
    if (!candidate.evidenceSource || !Array.isArray(candidate.accidentCases)) return null;
    return candidate as AccidentEducationHandoff;
  } catch {
    return null;
  }
}

export function clearAccidentEducationHandoff(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ACCIDENT_EDUCATION_HANDOFF_KEY);
  } catch {
    // Ignore storage errors
  }
}

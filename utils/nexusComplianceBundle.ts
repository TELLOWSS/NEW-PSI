import { getKoreanCalendarDay } from './monthlyFieldFollowup';
import type { NexusEquipmentPhotoSubmission } from './nexusEquipmentPhotoReport';
import { NEXUS_EQUIPMENT_PHOTO_STATUS_LABELS } from './nexusEquipmentPhotoReport';
import type { NexusExecutiveTrainingCampaign } from './nexusExecutiveTrainingPipeline';
import {
  NEXUS_INVESTIGATION_STATUS_LABELS,
  NEXUS_VISIT_STATUS_LABELS,
  type NexusAiInvestigationRecord,
  type NexusHqVisitPlan,
} from './nexusHqCommandLoop';
import { NEXUS_PIPELINE_STATUS_LABELS, type NexusPipelineCase } from './nexusQuickPipeline';
import { escapeSpreadsheetCsvCell } from './spreadsheetCsv';
import { buildPsiExportFileName } from './exportFileNaming';

export interface NexusZipEntryInput {
  name: string;
  data: Uint8Array;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export const computeCrc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/**
 * Builds an uncompressed Store-mode ZIP archive with UTF-8 filename flag (0x0800)
 * and IEEE CRC-32 checksums so Windows Explorer, macOS Finder, and unzip parse Korean filenames cleanly.
 */
export const buildStoreZipArchive = (entries: readonly NexusZipEntryInput[]): Uint8Array => {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileNameBytes = encoder.encode(entry.name.replace(/\\/g, '/'));
    const data = entry.data;
    const crc = computeCrc32(data);

    const localHeader = new Uint8Array(30 + fileNameBytes.length);
    const lView = new DataView(localHeader.buffer);
    lView.setUint32(0, 0x04034b50, true); // Local file header signature
    lView.setUint16(4, 20, true); // Version needed
    lView.setUint16(6, 0x0800, true); // UTF-8 filename bit
    lView.setUint16(8, 0, true); // Store method (0)
    lView.setUint16(10, 0, true);
    lView.setUint16(12, 0x5421, true);
    lView.setUint32(14, crc, true);
    lView.setUint32(18, data.length, true);
    lView.setUint32(22, data.length, true);
    lView.setUint16(26, fileNameBytes.length, true);
    lView.setUint16(28, 0, true);
    localHeader.set(fileNameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + fileNameBytes.length);
    const cView = new DataView(centralHeader.buffer);
    cView.setUint32(0, 0x02014b50, true); // Central directory signature
    cView.setUint16(4, 20, true);
    cView.setUint16(6, 20, true);
    cView.setUint16(8, 0x0800, true);
    cView.setUint16(10, 0, true);
    cView.setUint16(12, 0, true);
    cView.setUint16(14, 0x5421, true);
    cView.setUint32(16, crc, true);
    cView.setUint32(20, data.length, true);
    cView.setUint32(24, data.length, true);
    cView.setUint16(28, fileNameBytes.length, true);
    cView.setUint16(30, 0, true);
    cView.setUint16(32, 0, true);
    cView.setUint16(34, 0, true);
    cView.setUint16(36, 0, true);
    cView.setUint32(38, 0, true);
    cView.setUint32(42, offset, true);
    centralHeader.set(fileNameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const eView = new DataView(eocd.buffer);
  eView.setUint32(0, 0x06054b50, true);
  eView.setUint16(4, 0, true);
  eView.setUint16(6, 0, true);
  eView.setUint16(8, entries.length, true);
  eView.setUint16(10, entries.length, true);
  eView.setUint32(12, centralSize, true);
  eView.setUint32(16, offset, true);
  eView.setUint16(20, 0, true);

  const totalSize = offset + centralSize + eocd.length;
  const archive = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of localParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  archive.set(eocd, cursor);
  return archive;
};

const toCsv = (headers: readonly string[], rows: readonly (readonly unknown[])[]): string => {
  const encodeRow = (cells: readonly unknown[]) =>
    cells.map(c => escapeSpreadsheetCsvCell(c)).join(',');
  return '\uFEFF' + [encodeRow(headers), ...rows.map(encodeRow)].join('\r\n');
};

const decodeDataUrlBytes = (dataUrl: string): { ext: string; bytes: Uint8Array } | null => {
  if (!dataUrl) return null;
  if (dataUrl.startsWith('data:image/svg+xml')) {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) return null;
    const raw = dataUrl.slice(commaIdx + 1);
    const decoded = dataUrl.includes(';base64,') ? atob(raw) : decodeURIComponent(raw);
    return { ext: 'svg', bytes: new TextEncoder().encode(decoded) };
  }
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return null;
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { ext, bytes };
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const copy = new Uint8Array(bytes);
    const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return computeCrc32(bytes).toString(16).padStart(8, '0');
};

import type { SapaDefenseHydratedCard, SapaGovernanceMode } from './sapaDefenseLedger';
import { SAPA_ERP_STATUS_LABELS } from './sapaDefenseLedger';

export interface NexusComplianceBundleInput {
  asOfDate?: string;
  periodLabel?: string;
  siteScopeLabel?: string;
  pipelineCases: readonly NexusPipelineCase[];
  equipmentReports: readonly NexusEquipmentPhotoSubmission[];
  trainingCampaigns: readonly NexusExecutiveTrainingCampaign[];
  visitPlans: readonly NexusHqVisitPlan[];
  investigations: readonly NexusAiInvestigationRecord[];
  defenseCards?: readonly SapaDefenseHydratedCard[];
  governanceMode?: SapaGovernanceMode;
}

export interface NexusComplianceBundleResult {
  bundleId: string;
  fileName: string;
  fileCount: number;
  embeddedPhotoCount: number;
  embeddedSignatureCount: number;
  manifest: {
    bundleId: string;
    generatedAt: string;
    asOfDate: string;
    siteScopeLabel: string;
    periodLabel: string;
    counts: {
      pipelineCases: number;
      stopWorkCases: number;
      equipmentPhotos: number;
      trainingCampaigns: number;
      handwrittenSignatures: number;
      visitPlans: number;
      investigations: number;
    };
    files: readonly { name: string; bytes: number; sha256: string }[];
  };
  zipBytes: Uint8Array;
  summaryText: string;
}

export const buildNexusComplianceBundle = async (
  input: NexusComplianceBundleInput,
  nowIso = new Date().toISOString(),
): Promise<NexusComplianceBundleResult> => {
  const asOfDate = input.asOfDate || getKoreanCalendarDay();
  const compactDate = asOfDate.replace(/-/g, '');
  const bundleId = `PSI-SAPA-${compactDate}`;
  const siteScopeLabel = input.siteScopeLabel || '전 현장 통합 포트폴리오';
  const periodLabel = input.periodLabel || `${asOfDate.slice(0, 7)} 월간·반기 법적 이행 증빙`;
  const encoder = new TextEncoder();

  const stopWorkCases = input.pipelineCases.filter(c => c.stopWorkFlag);
  const allReceipts = input.trainingCampaigns.flatMap(camp =>
    (camp.workerSignatureReceipts ?? []).map(rec => ({
      campaignId: camp.campaignId,
      matchedCaseCode: camp.matchedCaseCode,
      ...rec,
    })),
  );

  const summaryText = [
    `[중대재해처벌법 안전·보건 확보의무 이행 통합 증빙 패키지] (${bundleId})`,
    `작성 기준일: ${asOfDate} | 편철 기간: ${periodLabel} | 대상 범위: ${siteScopeLabel}`,
    '',
    '1. 유해·위험요인 확인 및 시정조치·작업중지 이력',
    ` - 등록 시정조치 파이프라인: 총 ${input.pipelineCases.length}건 (임시통제·작업중지 ${stopWorkCases.length}건 포함)`,
    ` - 종결 완료: ${input.pipelineCases.filter(c => c.status === 'closed').length}건`,
    '',
    '2. 건설기계(타설·크레인·고소작업대) 사용전 점검 사진·경영진 보고',
    ` - 본사 제출 사진: 총 ${input.equipmentReports.length}건 (CEO 보고 완료 ${input.equipmentReports.filter(e => e.status === 'reported_to_ceo').length}건)`,
    '',
    '3. 대표이사 12개국어 안전교육 전파 및 작업자 모국어 자필 서명부',
    ` - 발령 캠페인: ${input.trainingCampaigns.length}건 / 전자 자필서명 증빙: ${allReceipts.length}건`,
    '',
    '4. 본사 순회점검·사전브리핑 및 사고조사 승인·재발방지 편입',
    ` - 순회점검 계획·현장 접수: ${input.visitPlans.length}건 / 사고조사(6하원칙·근본원인): ${input.investigations.length}건`,
  ].join('\n');

  const entries: NexusZipEntryInput[] = [
    { name: '00_경영책임자_법적이행_요약보고서.txt', data: encoder.encode(summaryText) },
    {
      name: '01_시정조치_작업중지_이력.csv',
      data: encoder.encode(
        toCsv(
          ['케이스ID', '현장ID', '위치', '매칭사례코드', '작업중지', '시정조치', '본사긴급지시', '담당자', '기한', '상태'],
          input.pipelineCases.map(c => [
            c.caseId,
            c.siteId || '',
            c.locationLabel,
            c.matchedCaseCode,
            c.stopWorkFlag ? 'Y' : 'N',
            c.actionTitle,
            c.hqDirectiveNote || '',
            c.assignee,
            c.dueDate,
            NEXUS_PIPELINE_STATUS_LABELS[c.status],
          ]),
        ),
      ),
    },
    {
      name: '02_건설기계_사용전점검_보고대장.csv',
      data: encoder.encode(
        toCsv(
          ['보고ID', '현장명', '건설기계', '작업내용', '업로더', '본사검토자', '보완메모', '상태', '보고일시'],
          input.equipmentReports.map(e => [
            e.submissionId,
            e.siteName,
            e.equipmentLabel,
            e.workActivity,
            e.uploadedBy,
            e.hqReviewer || '',
            e.fieldSupplementNote || '',
            NEXUS_EQUIPMENT_PHOTO_STATUS_LABELS[e.status],
            e.ceoReportedAt || e.updatedAt,
          ]),
        ),
      ),
    },
    {
      name: '03_12개국어_안전교육_자필서명부.csv',
      data: encoder.encode(
        toCsv(
          ['캠페인ID', '연계시드', '서명ID', '근로자성명', '언어코드', '현장ID', '서명일시'],
          allReceipts.map(r => [
            r.campaignId,
            r.matchedCaseCode,
            r.signatureId,
            r.workerName,
            r.languageCode,
            r.siteId || '',
            r.signedAt,
          ]),
        ),
      ),
    },
    {
      name: '04_본사_순회점검_사고조사승인.csv',
      data: encoder.encode(
        toCsv(
          ['구분', '식별ID', '현장명', '제목·목적', '현장접수·승인자', '상태', '기준일'],
          [
            ...input.visitPlans.map(v => [
              '본사순회점검',
              v.visitId,
              v.siteName,
              v.purpose,
              v.fieldAcknowledgedBy ? `${v.fieldAcknowledgedBy} (${v.fieldAcknowledgedAt})` : '미접수',
              NEXUS_VISIT_STATUS_LABELS[v.status],
              v.visitDate,
            ]),
            ...input.investigations.map(inv => [
              '사고조사',
              inv.investigationId,
              inv.siteName,
              inv.incidentTitle,
              inv.approverLabel || inv.authorLabel,
              NEXUS_INVESTIGATION_STATUS_LABELS[inv.status],
              inv.updatedAt.slice(0, 10),
            ]),
          ],
        ),
      ),
    },
  ];

  let embeddedPhotoCount = 0;
  for (const eq of input.equipmentReports) {
    const decoded = decodeDataUrlBytes(eq.photoDataUrl);
    if (decoded) {
      embeddedPhotoCount++;
      entries.push({
        name: `photos/${eq.submissionId}.${decoded.ext}`,
        data: decoded.bytes,
      });
    }
  }

  let embeddedSignatureCount = 0;
  for (const rec of allReceipts) {
    const decoded = decodeDataUrlBytes(rec.signatureDataUrl);
    if (decoded) {
      embeddedSignatureCount++;
      entries.push({
        name: `signatures/${rec.signatureId}_${rec.languageCode}.${decoded.ext}`,
        data: decoded.bytes,
      });
    }
  }

  if (input.defenseCards && input.defenseCards.length > 0) {
    entries.push({
      name: '05_시행령4조_9대방어카드_이행대장.csv',
      data: encoder.encode(
        toCsv(
          ['현장ID', '현장명', '카드ID', '법적근거', '루틴주기', '방어상태', '기한', '결재라인', '대표이사지시', '무결성해시', '봉인일시'],
          input.defenseCards.map(c => [
            c.siteId,
            c.siteName,
            `${c.cardId} ${c.spec.shortTitle}`,
            c.spec.legalBasis,
            c.spec.cycleLabel,
            c.signalLabel,
            c.dueDate,
            c.approvalSteps.map(s => `${s.roleLabel}:${s.status}`).join(' > '),
            c.ceoDirectiveNote || '',
            c.sealHash || '',
            c.sealedAt || '',
          ]),
        ),
      ),
    });

    entries.push({
      name: '06_ERP특정항목_연계_및_결재로그.csv',
      data: encoder.encode(
        toCsv(
          ['운영모드', '현장ID', '카드ID', 'ERP문서번호', 'ERP현장코드', 'ERP예산코드', '원가센터', '협력사코드', '집행금액(원)', 'ERP상태', '사용자정의ERP항목'],
          input.defenseCards.map(c => [
            input.governanceMode || 'erp_bridge',
            c.siteId,
            c.cardId,
            c.erpBridge.erpDocNo,
            c.erpBridge.erpSiteCode,
            c.erpBridge.erpBudgetCode,
            c.erpBridge.erpCostCenter,
            c.erpBridge.erpVendorCode,
            c.erpBridge.erpAmountKrw ?? '',
            SAPA_ERP_STATUS_LABELS[c.erpBridge.erpApprovalStatus],
            c.erpBridge.erpCustomFields.map(f => `${f.label || f.key}=${f.value}`).join(' | '),
          ]),
        ),
      ),
    });

    for (const card of input.defenseCards) {
      const folder = `sapa_cards/${card.spec.folderName}/${card.siteId}`;
      const cardBrief = [
        `[${card.spec.code}. ${card.spec.title}] (${card.spec.legalBasis})`,
        `현장: ${card.siteName} (${card.siteId}) | 기준월: ${card.periodKey} | 상태: ${card.signalLabel}`,
        `ERP 문서번호: ${card.erpBridge.erpDocNo || '미연결'} | 현장코드: ${card.erpBridge.erpSiteCode} | 예산코드: ${card.erpBridge.erpBudgetCode}`,
        `실무 메모: ${card.summaryMemo || '-'}`,
        `경영책임자 확인·지시: ${card.ceoDirectiveNote || '-'}`,
        `무결성 SHA-256 봉인: ${card.sealHash || '미봉인'}`,
        `결재 이력:`,
        ...card.approvalSteps.map(
          s => `  - ${s.stepOrder}차 ${s.roleLabel}: ${s.status} (${s.actorName || '-'} / ${s.actedAt || '-'}) ${s.note}`,
        ),
      ].join('\n');
      entries.push({
        name: `${folder}/카드이행기록.txt`,
        data: encoder.encode(cardBrief),
      });
      if (card.erpBridge.erpAttachmentDataUrl) {
        const decodedAtt = decodeDataUrlBytes(card.erpBridge.erpAttachmentDataUrl);
        if (decodedAtt) {
          entries.push({
            name: `${folder}/erp_증빙첨부.${decodedAtt.ext}`,
            data: decodedAtt.bytes,
          });
        }
      }
    }
  }

  const fileDigests = await Promise.all(
    entries.map(async entry => ({
      name: entry.name,
      bytes: entry.data.length,
      sha256: await sha256Hex(entry.data),
    })),
  );

  const manifest = {
    bundleId,
    generatedAt: nowIso,
    asOfDate,
    siteScopeLabel,
    periodLabel,
    counts: {
      pipelineCases: input.pipelineCases.length,
      stopWorkCases: stopWorkCases.length,
      equipmentPhotos: input.equipmentReports.length,
      trainingCampaigns: input.trainingCampaigns.length,
      handwrittenSignatures: allReceipts.length,
      visitPlans: input.visitPlans.length,
      investigations: input.investigations.length,
    },
    files: fileDigests,
  };

  entries.push({
    name: '00_증빙무결성_매니페스트.json',
    data: encoder.encode(JSON.stringify(manifest, null, 2)),
  });

  const zipBytes = buildStoreZipArchive(entries);
  const fileName = buildPsiExportFileName({
    tokens: ['PSI_중대재해처벌법_이행증빙', asOfDate],
    extension: 'zip',
  });

  return {
    bundleId,
    fileName,
    fileCount: entries.length,
    embeddedPhotoCount,
    embeddedSignatureCount,
    manifest,
    zipBytes,
    summaryText,
  };
};

export const downloadNexusComplianceZip = async (
  input: NexusComplianceBundleInput,
): Promise<NexusComplianceBundleResult> => {
  const result = await buildNexusComplianceBundle(input);
  if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
    const bufferCopy = new Uint8Array(result.zipBytes);
    const blob = new Blob([bufferCopy.buffer], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
  return result;
};

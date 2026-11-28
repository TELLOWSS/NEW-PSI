import type { NexusEquipmentPhotoSubmission } from './nexusEquipmentPhotoReport';
import { NEXUS_EQUIPMENT_PHOTO_STATUS_LABELS } from './nexusEquipmentPhotoReport';
import type { NexusExecutiveTrainingCampaign } from './nexusExecutiveTrainingPipeline';
import type {
  NexusAiInvestigationRecord,
  NexusHqVisitPlan,
  NexusSitePortfolioScorecard,
} from './nexusHqCommandLoop';
import type { NexusPipelineCase } from './nexusQuickPipeline';
import { buildPsiExportFileName } from './exportFileNaming';

export interface NexusExecutiveDeckPhotoCard {
  submissionId: string;
  siteName: string;
  equipmentLabel: string;
  workActivity: string;
  statusLabel: string;
  reviewerLabel: string;
  photoDataUrl: string;
}

export interface NexusExecutiveDeckSlideSpec {
  slideNumber: number;
  kind: 'cover_kpi' | 'site_matrix' | 'equipment_gallery' | 'action_training';
  title: string;
  subtitle: string;
  kpiCards?: readonly { label: string; value: string; sub: string }[];
  tableHeaders?: readonly string[];
  tableRows?: readonly (readonly string[])[];
  photoCards?: readonly NexusExecutiveDeckPhotoCard[];
  bullets?: readonly string[];
}

export interface NexusExecutiveBriefingDeckSpec {
  deckId: string;
  asOfDate: string;
  reporterLabel: string;
  fileName: string;
  totalSlides: number;
  slides: readonly NexusExecutiveDeckSlideSpec[];
}

export interface BuildExecutiveBriefingDeckInput {
  asOfDate: string;
  reporterLabel?: string;
  siteMatrix: readonly NexusSitePortfolioScorecard[];
  pipelineCases: readonly NexusPipelineCase[];
  equipmentReports: readonly NexusEquipmentPhotoSubmission[];
  visitPlans: readonly NexusHqVisitPlan[];
  investigations: readonly NexusAiInvestigationRecord[];
  trainingCampaigns: readonly NexusExecutiveTrainingCampaign[];
}

export const buildExecutiveBriefingDeckSpec = (
  input: BuildExecutiveBriefingDeckInput,
): NexusExecutiveBriefingDeckSpec => {
  const reporterLabel = String(input.reporterLabel || '').trim() || '본사 CSO · 안전보건실';
  const openCases = input.pipelineCases.filter(c => c.status !== 'closed');
  const closedCases = input.pipelineCases.filter(c => c.status === 'closed');
  const stopWorkCases = openCases.filter(c => c.stopWorkFlag);
  const closureRatePct = input.pipelineCases.length
    ? Math.round((closedCases.length / input.pipelineCases.length) * 100)
    : 100;

  const readyEquip = input.equipmentReports.filter(
    e => e.status === 'hq_verified_for_ceo' || e.status === 'reported_to_ceo',
  );
  const totalTargetWorkers = input.trainingCampaigns.reduce((s, c) => s + (c.targetWorkers || 0), 0);
  const totalConfirmedSigs = input.trainingCampaigns.reduce((s, c) => s + (c.confirmedSignatures || 0), 0);
  const avgTrainingPct =
    totalTargetWorkers > 0 ? Math.min(100, Math.round((totalConfirmedSigs / totalTargetWorkers) * 100)) : 0;

  const pendingApprovals = input.investigations.filter(i => i.status === 'ai_draft_pending_hq');
  const approvedInvs = input.investigations.filter(i => i.status === 'hq_approved_propagated');
  const activeVisits = input.visitPlans.filter(v => v.status !== 'action_issued_closed');
  const ackedVisits = activeVisits.filter(v => Boolean(v.fieldAcknowledgedAt));

  const slides: NexusExecutiveDeckSlideSpec[] = [];

  // Slide 1: Cover & Core KPI Summary
  slides.push({
    slideNumber: 1,
    kind: 'cover_kpi',
    title: '대표이사 · 경영진 일일 전사 안전 통합 브리핑',
    subtitle: `기준일 ${input.asOfDate} · 보고 책임: ${reporterLabel} · 관제 현장 ${input.siteMatrix.length}개소`,
    kpiCards: [
      {
        label: '⛔ 임시통제·작업중지',
        value: `${stopWorkCases.length}건`,
        sub: `전체 미결 ${openCases.length}건 / 종결률 ${closureRatePct}%`,
      },
      {
        label: '🏗️ 건설기계 사용전 사진',
        value: `${readyEquip.length}건`,
        sub: `전체 접수 ${input.equipmentReports.length}건 중 본사 적합·보고`,
      },
      {
        label: '🔍 사고조사 승인·순회',
        value: `${pendingApprovals.length} / ${activeVisits.length}건`,
        sub: `사례DB 편입 ${approvedInvs.length}건 · 현장 순회접수 ${ackedVisits.length}건`,
      },
      {
        label: '🌐 12개국어 교육 이수율',
        value: `${avgTrainingPct}%`,
        sub: `${totalConfirmedSigs}/${totalTargetWorkers}명 서명 완료`,
      },
    ],
  });

  // Slide 2: All-Sites Matrix Comparison Table
  slides.push({
    slideNumber: 2,
    kind: 'site_matrix',
    title: '전사 현장별 위험 · 조치 · 순회 · 교육 포트폴리오 매트릭스',
    subtitle: '단일 현장 격리(Field) 데이터 기반 본사 전사 통합 집계',
    tableHeaders: ['현장명', '등급', '미결', '초과', '순회', '승인·보완', '교육 이수율'],
    tableRows: input.siteMatrix.map(site => [
      site.shortLabel,
      site.urgencyLabel,
      `${site.openActionsCount}건`,
      `${site.overdueActionsCount}건`,
      `${site.activeVisitsCount}건`,
      `${site.pendingApprovalsCount + site.revisionRequestedCount}건`,
      site.avgTrainingCompletionPct !== null ? `${site.avgTrainingCompletionPct}%` : '대기',
    ]),
  });

  // Slide 3+: Equipment Photo Gallery (4 photos per slide)
  const equipmentSource = readyEquip.length > 0 ? readyEquip : input.equipmentReports.slice(0, 4);
  if (equipmentSource.length === 0) {
    slides.push({
      slideNumber: slides.length + 1,
      kind: 'equipment_gallery',
      title: '건설기계 사용전 점검 사진 · 경영진 보고 갤러리',
      subtitle: '금일 본사 적합 확인 또는 경영진 보고 편입 건설기계 점검 사진 현황',
      photoCards: [],
      bullets: ['금일 접수 및 승인 완료된 건설기계 사용전 사진이 아직 없습니다.'],
    });
  } else {
    for (let offset = 0; offset < equipmentSource.length; offset += 4) {
      const chunk = equipmentSource.slice(offset, offset + 4);
      slides.push({
        slideNumber: slides.length + 1,
        kind: 'equipment_gallery',
        title:
          offset === 0
            ? '건설기계 사용전 점검 사진 · 경영진 보고 갤러리'
            : `건설기계 사용전 점검 사진 갤러리 (계속 ${Math.floor(offset / 4) + 1})`,
        subtitle: `본사 검토 완료 및 경영진 보고 편입 ${chunk.length}건 (${offset + 1}~${offset + chunk.length} / 총 ${equipmentSource.length}건)`,
        photoCards: chunk.map(item => ({
          submissionId: item.submissionId,
          siteName: item.siteName,
          equipmentLabel: item.equipmentLabel,
          workActivity: item.workActivity,
          statusLabel: NEXUS_EQUIPMENT_PHOTO_STATUS_LABELS[item.status],
          reviewerLabel: item.hqReviewer || reporterLabel,
          photoDataUrl: item.photoDataUrl,
        })),
      });
    }
  }

  // Final Slide: Stop-Work Directives, Investigation Approvals & 12-Language Training Feedback
  const actionBullets: string[] = [];
  if (stopWorkCases.length > 0) {
    for (const c of stopWorkCases.slice(0, 3)) {
      actionBullets.push(
        `[작업중지] ${c.locationLabel} — ${c.actionTitle}${c.hqDirectiveNote ? ` (본사지시: ${c.hqDirectiveNote})` : ''}`,
      );
    }
  } else {
    actionBullets.push('[작업중지] 금일 발령 중인 작업중지 구역 없음 — Open 미결 조치 중심 추적 관리');
  }
  const directiveCases = openCases.filter(c => Boolean(c.hqDirectiveNote)).slice(0, 2);
  for (const c of directiveCases) {
    if (!c.stopWorkFlag) {
      actionBullets.push(`[본사 긴급 지시] ${c.locationLabel}: ${c.hqDirectiveNote}`);
    }
  }
  for (const inv of input.investigations.slice(0, 2)) {
    actionBullets.push(
      `[05 사고조사] ${inv.siteName} · ${inv.incidentTitle.slice(0, 42)} (${inv.status === 'hq_approved_propagated' ? '본사 승인 · 전 현장 전파' : inv.status === 'revision_requested' ? '현장 보완 중' : '본사 승인 대기'})`,
    );
  }
  for (const camp of input.trainingCampaigns.slice(0, 2)) {
    actionBullets.push(
      `[04 다국어 교육] ${camp.matchedCaseCode} · 서명 ${camp.confirmedSignatures}/${camp.targetWorkers}명 (${camp.completionRatePct ?? 0}%, ${camp.participatingNationalities}개국)`,
    );
  }

  slides.push({
    slideNumber: slides.length + 1,
    kind: 'action_training',
    title: '작업중지 · 본사 지시 · 사고조사 재발방지 및 12개국어 교육 환류',
    subtitle: '중대재해처벌법 이행 증빙 연동 요약',
    bullets: actionBullets,
  });

  const compactDate = input.asOfDate.replace(/-/g, '');
  return {
    deckId: `CEO-PPTX-${compactDate}`,
    asOfDate: input.asOfDate,
    reporterLabel,
    fileName: buildPsiExportFileName({
      tokens: ['PSI_CEO_안전브리핑', input.asOfDate],
      extension: 'pptx',
    }),
    totalSlides: slides.length,
    slides,
  };
};

const convertSvgDataUrlToPngDataUrl = async (dataUrl: string): Promise<string | null> => {
  if (!dataUrl) return null;
  if (!dataUrl.startsWith('data:image/svg+xml')) {
    return dataUrl.startsWith('data:image/') ? dataUrl : null;
  }
  if (typeof window === 'undefined' || typeof Image === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('SVG 디코딩 실패'));
      el.src = dataUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 380;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#0b1724';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png', 0.92);
  } catch {
    return null;
  }
};

export const exportExecutiveBriefingPptx = async (
  input: BuildExecutiveBriefingDeckInput,
): Promise<NexusExecutiveBriefingDeckSpec> => {
  const spec = buildExecutiveBriefingDeckSpec(input);
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'PSI Safety Nexus';
  pptx.subject = '대표이사·경영진 일일 안전 브리핑';
  pptx.title = `${spec.deckId} 대표이사 안전 브리핑`;

  for (const slideSpec of spec.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: '08111F' };

    // Top gold header stripe & metadata
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.08,
      fill: { color: 'E5B55A' },
      line: { color: 'E5B55A', width: 0 },
    });
    slide.addText(`PSI SAFETY NEXUS · SLIDE ${slideSpec.slideNumber} / ${spec.totalSlides}`, {
      x: 0.6,
      y: 0.25,
      w: 8.5,
      h: 0.25,
      fontSize: 9,
      bold: true,
      color: 'E5B55A',
      fontFace: 'Malgun Gothic',
    });
    slide.addText(slideSpec.title, {
      x: 0.6,
      y: 0.52,
      w: 12.1,
      h: 0.45,
      fontSize: 20,
      bold: true,
      color: 'F7F3E9',
      fontFace: 'Malgun Gothic',
    });
    slide.addText(slideSpec.subtitle, {
      x: 0.6,
      y: 0.98,
      w: 12.1,
      h: 0.3,
      fontSize: 11,
      color: '9AB4CC',
      fontFace: 'Malgun Gothic',
    });

    if (slideSpec.kind === 'cover_kpi' && slideSpec.kpiCards) {
      slideSpec.kpiCards.forEach((kpi, idx) => {
        const x = 0.6 + idx * 3.08;
        slide.addShape(pptx.ShapeType.roundRect, {
          x,
          y: 1.65,
          w: 2.88,
          h: 2.25,
          fill: { color: '0F1D32' },
          line: { color: '284363', width: 1 },
        });
        slide.addText(kpi.label, {
          x: x + 0.18,
          y: 1.85,
          w: 2.52,
          h: 0.32,
          fontSize: 11,
          bold: true,
          color: '8DE4EC',
          fontFace: 'Malgun Gothic',
        });
        slide.addText(kpi.value, {
          x: x + 0.18,
          y: 2.28,
          w: 2.52,
          h: 0.65,
          fontSize: 28,
          bold: true,
          color: 'F6C786',
          fontFace: 'Malgun Gothic',
        });
        slide.addText(kpi.sub, {
          x: x + 0.18,
          y: 3.12,
          w: 2.52,
          h: 0.55,
          fontSize: 10,
          color: 'BFD1E4',
          fontFace: 'Malgun Gothic',
        });
      });
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.6,
        y: 4.25,
        w: 12.13,
        h: 2.65,
        fill: { color: '0D1A2B' },
        line: { color: '3B4E68', width: 1 },
      });
      slide.addText('경영진 지휘 요약 · 골조·지하 RC 전 현장 폐루프 운영 현황', {
        x: 0.85,
        y: 4.45,
        w: 11.6,
        h: 0.35,
        fontSize: 13,
        bold: true,
        color: 'FFE2B0',
        fontFace: 'Malgun Gothic',
      });
      slide.addText(
        `• 본 보고서는 현장 단일 격리(Field) 환경에서 수집된 건설기계 사용전 점검 사진·작업중지·사고조사 승인 및 12개국어 교육 이수율 실데이터를 본사 CSO 책임으로 취합한 경영진 보고 자료입니다.\n• 보고 책임자: ${spec.reporterLabel} / 작성 기준일: ${spec.asOfDate} / 포함 슬라이드: ${spec.totalSlides}장`,
        {
          x: 0.85,
          y: 4.92,
          w: 11.6,
          h: 1.65,
          fontSize: 11.5,
          color: 'D6E2EE',
          fontFace: 'Malgun Gothic',
          valign: 'top',
        },
      );
    }

    if (slideSpec.kind === 'site_matrix' && slideSpec.tableHeaders && slideSpec.tableRows) {
      const rows = [
        slideSpec.tableHeaders.map(h => ({
          text: h,
          options: { bold: true, fill: { color: '1B2E48' }, color: 'F6C786', align: 'center' as const },
        })),
        ...slideSpec.tableRows.map(r =>
          r.map((cell, ci) => ({
            text: cell,
            options: {
              fill: { color: '0F1D32' },
              color: 'ECF2F8',
              align: (ci === 0 ? 'left' : 'center') as 'left' | 'center',
            },
          })),
        ),
      ];
      slide.addTable(rows, {
        x: 0.6,
        y: 1.55,
        w: 12.13,
        colW: [3.23, 1.8, 1.2, 1.2, 1.2, 1.7, 1.8],
        fontSize: 11,
        fontFace: 'Malgun Gothic',
        border: { type: 'solid', color: '2B4463', pt: 0.75 },
        margin: [0.08, 0.08, 0.08, 0.08],
      });
    }

    if (slideSpec.kind === 'equipment_gallery') {
      const cards = slideSpec.photoCards ?? [];
      if (cards.length === 0) {
        slide.addText(slideSpec.bullets?.join('\n') || '접수된 사진이 없습니다.', {
          x: 0.6,
          y: 2.0,
          w: 12.13,
          h: 1.2,
          fontSize: 13,
          color: 'CBD7E6',
          fontFace: 'Malgun Gothic',
        });
      } else {
        for (let idx = 0; idx < cards.length; idx++) {
          const card = cards[idx];
          const col = idx % 2;
          const row = Math.floor(idx / 2);
          const x = 0.6 + col * 6.18;
          const y = 1.48 + row * 2.86;
          slide.addShape(pptx.ShapeType.roundRect, {
            x,
            y,
            w: 5.95,
            h: 2.68,
            fill: { color: '0F1D32' },
            line: { color: '2F4C6E', width: 1 },
          });
          const pngData = await convertSvgDataUrlToPngDataUrl(card.photoDataUrl);
          if (pngData) {
            slide.addImage({
              data: pngData,
              x: x + 0.16,
              y: y + 0.16,
              w: 2.55,
              h: 1.72,
            });
          } else {
            slide.addShape(pptx.ShapeType.rect, {
              x: x + 0.16,
              y: y + 0.16,
              w: 2.55,
              h: 1.72,
              fill: { color: '182B44' },
              line: { color: '3A5575', width: 0.75 },
            });
            slide.addText(card.equipmentLabel, {
              x: x + 0.24,
              y: y + 0.8,
              w: 2.38,
              h: 0.4,
              fontSize: 10,
              color: 'F6C786',
              align: 'center',
              fontFace: 'Malgun Gothic',
            });
          }
          slide.addText(`${card.siteName}\n${card.equipmentLabel}`, {
            x: x + 2.85,
            y: y + 0.2,
            w: 2.95,
            h: 0.56,
            fontSize: 11,
            bold: true,
            color: '8DE4EC',
            fontFace: 'Malgun Gothic',
          });
          slide.addText(card.workActivity, {
            x: x + 2.85,
            y: y + 0.82,
            w: 2.95,
            h: 0.82,
            fontSize: 10,
            color: 'F2F6FA',
            fontFace: 'Malgun Gothic',
            valign: 'top',
          });
          slide.addText(`${card.statusLabel} · 검토: ${card.reviewerLabel}`, {
            x: x + 0.18,
            y: y + 2.02,
            w: 5.6,
            h: 0.45,
            fontSize: 9.5,
            color: 'FFE1B0',
            fontFace: 'Malgun Gothic',
          });
        }
      }
    }

    if (slideSpec.kind === 'action_training' && slideSpec.bullets) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.6,
        y: 1.5,
        w: 12.13,
        h: 5.45,
        fill: { color: '0F1D32' },
        line: { color: '2F4C6E', width: 1 },
      });
      slide.addText(
        slideSpec.bullets.map(b => `• ${b}`).join('\n\n'),
        {
          x: 0.9,
          y: 1.75,
          w: 11.5,
          h: 4.95,
          fontSize: 12,
          color: 'EAF1F8',
          fontFace: 'Malgun Gothic',
          valign: 'top',
        },
      );
    }
  }

  await pptx.writeFile({ fileName: spec.fileName });
  return spec;
};

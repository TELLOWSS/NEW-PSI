import {
  SAPA_ERP_STATUS_LABELS,
  type SapaDefenseHydratedCard,
  type SapaDefensePortfolioSummary,
  type SapaGovernanceMode,
} from './sapaDefenseLedger';

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const openPrintSheetWindow = (title: string, bodyHtml: string) => {
  if (typeof window === 'undefined') return;
  const popup = window.open('', '_blank', 'width=980,height=840');
  if (!popup) return;
  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Malgun Gothic", "Pretendard", system-ui, sans-serif; color: #0f172a; margin: 26px 32px; line-height: 1.5; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 6px; color: #0f172a; letter-spacing: -.02em; }
  h2 { font-size: 14px; margin: 20px 0 8px; padding-bottom: 5px; border-bottom: 1.5px solid #1e293b; color: #0f172a; }
  .meta-bar { display: flex; flex-wrap: wrap; gap: 14px; padding: 10px 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 16px; font-size: 11.5px; }
  .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .kpi-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #ffffff; }
  .kpi-box small { display: block; color: #475569; font-size: 11px; }
  .kpi-box strong { display: block; font-size: 18px; margin-top: 3px; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 700; color: #1e293b; }
  .badge { display: inline-block; padding: 2px 7px; border-radius: 999px; font-weight: 700; font-size: 10px; }
  .sig-green { background: #dcfce7; color: #166534; }
  .sig-purple { background: #ede9fe; color: #5b21b6; }
  .sig-yellow { background: #fef3c7; color: #92400e; }
  .sig-red { background: #fee2e2; color: #991b1b; }
  .hash-cell { font-family: ui-monospace, Menlo, monospace; font-size: 10px; color: #334155; word-break: break-all; }
  .sign-box { margin-top: 18px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .sign-cell { border: 1px solid #94a3b8; border-radius: 6px; padding: 10px 12px; min-height: 74px; }
  .sign-cell small { display: block; color: #475569; margin-bottom: 24px; }
  @media print { body { margin: 12mm; } .no-print { display: none; } }
</style>
</head>
<body>
${bodyHtml}
<div class="no-print" style="margin-top:20px; text-align:right;">
  <button type="button" onclick="window.print()" style="padding:8px 16px;font-weight:700;cursor:pointer;">인쇄 / PDF 저장</button>
</div>
</body>
</html>`);
  popup.document.close();
  popup.focus();
};

export const openSapaDefenseSummaryPrint = (params: {
  siteScopeLabel: string;
  asOfDate: string;
  mode: SapaGovernanceMode;
  summary: SapaDefensePortfolioSummary;
  cards: readonly SapaDefenseHydratedCard[];
}) => {
  const sealedCards = params.cards.filter(c => c.ceoDirectiveNote || c.sealHash);
  const rowsHtml = params.cards
    .map(
      c => `<tr>
        <td><b>${escapeHtml(c.siteName)}</b></td>
        <td><b>${escapeHtml(c.spec.code)}. ${escapeHtml(c.spec.shortTitle)}</b><br/><span style="color:#475569;">${escapeHtml(c.spec.legalBasis)}</span></td>
        <td>${escapeHtml(c.spec.cycleLabel)}<br/>(${escapeHtml(c.dDayLabel)})</td>
        <td><span class="badge sig-${c.signal}">${escapeHtml(c.signalLabel)}</span></td>
        <td>${c.erpBridge.erpDocNo ? `${escapeHtml(c.erpBridge.erpDocNo)} (${escapeHtml(SAPA_ERP_STATUS_LABELS[c.erpBridge.erpApprovalStatus])})` : '미연결'}</td>
        <td>${escapeHtml(c.ceoDirectiveNote || c.summaryMemo || '-')}</td>
        <td class="hash-cell">${escapeHtml(c.sealHash ? `${c.sealHash.slice(0, 16)}…` : '-')}</td>
      </tr>`,
    )
    .join('');

  const directiveHtml =
    sealedCards.length === 0
      ? '<p style="color:#475569;">아직 기록된 경영책임자 보고·지시 내역이 없습니다.</p>'
      : `<table>
          <thead><tr><th>일시</th><th>현장</th><th>방어 조항</th><th>경영책임자 확인·지시 내용</th><th>무결성 해시</th></tr></thead>
          <tbody>
            ${sealedCards
              .map(
                c => `<tr>
                  <td>${escapeHtml((c.sealedAt || c.updatedAt).slice(0, 16).replace('T', ' '))}</td>
                  <td>${escapeHtml(c.siteName)}</td>
                  <td>${escapeHtml(c.spec.title)}</td>
                  <td>${escapeHtml(c.ceoDirectiveNote || c.summaryMemo)}</td>
                  <td class="hash-cell">${escapeHtml(c.sealHash || '-')}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>`;

  const body = `
    <h1>중대재해처벌법 안전·보건 확보의무 이행 방어 요약서</h1>
    <div class="meta-bar">
      <span><b>대상 범위:</b> ${escapeHtml(params.siteScopeLabel)}</span>
      <span><b>기준일:</b> ${escapeHtml(params.asOfDate)}</span>
      <span><b>운영 체계:</b> ${params.mode === 'erp_bridge' ? 'Stage 1 (ERP 연계·공존)' : 'Stage 2 (PSI 단독 안전결재)'}</span>
      <span><b>제출 용도:</b> 경영책임자 보고본 · 노동부 감독 · 사법 방어 참고</span>
    </div>
    <div class="kpi-row">
      <div class="kpi-box"><small>방어 준비율</small><strong>${params.summary.defenseReadinessPct}%</strong></div>
      <div class="kpi-box"><small>이행·봉인 완료</small><strong>${params.summary.greenCount} / ${params.summary.totalCells}건</strong></div>
      <div class="kpi-box"><small>ERP 문서 연계</small><strong>${params.summary.erpConnectedCount}건</strong></div>
      <div class="kpi-box"><small>취약·누락 경보</small><strong>${params.summary.redCount + params.summary.yellowCount}건</strong></div>
    </div>
    <h2>1. 시행령 제4조 제1호~제9호 현장별 방어 카드 현황</h2>
    <table>
      <thead>
        <tr><th>현장명</th><th>방어 카드 (법적 근거)</th><th>루틴 주기</th><th>방어 상태</th><th>ERP 결재 연계</th><th>요약 / 대표이사 지시</th><th>SHA-256 봉인</th></tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <h2>2. 경영책임자(대표이사·CSO) 보고확인 및 개선·예산 지시 연표</h2>
    ${directiveHtml}
    <div class="sign-box">
      <div class="sign-cell"><small>기안 · 현장 안전담당 / 현장소장</small><b>서명:</b> ___________________</div>
      <div class="sign-cell"><small>검토 · 본사 안전보건실장 / CSO</small><b>서명:</b> ___________________</div>
      <div class="sign-cell"><small>최종 확인 · 경영책임자 (대표이사)</small><b>서명:</b> ___________________</div>
    </div>`;

  openPrintSheetWindow(`PSI_중대재해방어요약서_${params.asOfDate}`, body);
};

export const openErpAttachmentSummaryPrint = (card: SapaDefenseHydratedCard, asOfDate: string) => {
  const customRows =
    card.erpBridge.erpCustomFields.length > 0
      ? card.erpBridge.erpCustomFields
          .map(
            f => `<tr><th>${escapeHtml(f.label || f.key)}</th><td>${escapeHtml(f.value || '-')}</td></tr>`,
          )
          .join('')
      : '';

  const body = `
    <h1>[ERP 기안 첨부용] PSI 현장 안전보건 방어 증빙 요약지</h1>
    <div class="meta-bar">
      <span><b>현장명:</b> ${escapeHtml(card.siteName)}</span>
      <span><b>해당 조항:</b> ${escapeHtml(card.spec.legalBasis)} (${escapeHtml(card.spec.title)})</span>
      <span><b>기준 월/일:</b> ${escapeHtml(card.periodKey)} (${escapeHtml(asOfDate)})</span>
    </div>
    <h2>1. ERP 연계 기준 항목</h2>
    <table>
      <tbody>
        <tr><th style="width:28%;">ERP 현장코드</th><td>${escapeHtml(card.erpBridge.erpSiteCode || card.siteId)}</td></tr>
        <tr><th>ERP 예산 / 원가센터</th><td>${escapeHtml(card.erpBridge.erpBudgetCode || '-')} / ${escapeHtml(card.erpBridge.erpCostCenter || '-')}</td></tr>
        <tr><th>ERP 품의(문서)번호</th><td>${escapeHtml(card.erpBridge.erpDocNo || '기안 전 (본 요약지 첨부 후 번호 입력)')}</td></tr>
        <tr><th>집행 금액 (원)</th><td>${card.erpBridge.erpAmountKrw ? `${card.erpBridge.erpAmountKrw.toLocaleString('ko-KR')} 원` : '-'}</td></tr>
        <tr><th>협력업체 / 수급인 코드</th><td>${escapeHtml(card.erpBridge.erpVendorCode || '-')}</td></tr>
        ${customRows}
      </tbody>
    </table>
    <h2>2. PSI 자동 집계 현장 원천 증빙</h2>
    <table>
      <tbody>
        <tr><th style="width:28%;">자필 위험성평가 OCR</th><td>${card.autoEvidence.ocrRiskRecordCount}건</td></tr>
        <tr><th>골조 시정조치 파이프라인</th><td>총 ${card.autoEvidence.pipelineCaseCount}건 (작업중지 ${card.autoEvidence.stopWorkCount}건 포함)</td></tr>
        <tr><th>건설기계 점검 사진</th><td>${card.autoEvidence.equipmentPhotoCount}건</td></tr>
        <tr><th>12개국어 교육 서명 / 순회점검</th><td>서명 ${card.autoEvidence.trainingSignatureCount}건 / 순회 ${card.autoEvidence.hqVisitCount}건</td></tr>
        <tr><th>현장 실무 요약 메모</th><td>${escapeHtml(card.summaryMemo || '특이사항 없음')}</td></tr>
      </tbody>
    </table>
    <h2>3. 동적 결재라인 진행 현황 (${escapeHtml(card.presetId)})</h2>
    <table>
      <thead><tr><th>단계</th><th>결재 직책</th><th>상태</th><th>결재자</th><th>결재 일시</th><th>검토 의견</th></tr></thead>
      <tbody>
        ${card.approvalSteps
          .map(
            s => `<tr>
              <td>${s.stepOrder}차</td>
              <td>${escapeHtml(s.roleLabel)}</td>
              <td>${s.status === 'approved' ? '승인 완료' : s.status === 'revision_requested' ? '보완 요청' : '대기'}</td>
              <td>${escapeHtml(s.actorName || '-')}</td>
              <td>${escapeHtml(s.actedAt ? s.actedAt.slice(0, 16).replace('T', ' ') : '-')}</td>
              <td>${escapeHtml(s.note || '-')}</td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;

  openPrintSheetWindow(`ERP첨부_${card.siteId}_${card.cardId}`, body);
};

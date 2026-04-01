import type { WorkerRecord } from '../types';
import { ensureJsPdfConstructor } from './externalScripts';
import { getWindowProp } from './windowUtils';

const A4_CANVAS_WIDTH = 1240;
const A4_CANVAS_HEIGHT = 1754;
const CANVAS_MARGIN = 72;

export function exportEvidencePackageCsv(record: WorkerRecord) {
    const escapeCsv = (value: unknown) => {
        const str = String(value ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const header = ['stage', 'timestamp', 'actor', 'note'];
    const rows = (record.auditTrail || []).map((entry) => [entry.stage, entry.timestamp, entry.actor, entry.note || '']);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PSI_EvidenceTrail_${record.name}_${record.date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

type EvidenceLine = {
    text: string;
    kind: 'title' | 'section' | 'body';
};

const pushWrappedLines = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    out: string[]
) => {
    const source = String(text ?? '').trim();
    if (!source) {
        out.push('-');
        return;
    }

    const words = source.split(/\s+/);
    let current = '';

    const appendCurrent = () => {
        if (current.trim().length > 0) {
            out.push(current.trim());
        }
        current = '';
    };

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
            current = candidate;
            continue;
        }

        if (current) {
            appendCurrent();
        }

        if (ctx.measureText(word).width <= maxWidth) {
            current = word;
            continue;
        }

        let chunk = '';
        for (const char of word) {
            const charCandidate = chunk + char;
            if (ctx.measureText(charCandidate).width <= maxWidth) {
                chunk = charCandidate;
            } else {
                if (chunk) out.push(chunk);
                chunk = char;
            }
        }
        if (chunk) {
            current = chunk;
        }
    }

    appendCurrent();
};

const buildEvidenceLines = (record: WorkerRecord): EvidenceLine[] => {
    const lines: EvidenceLine[] = [];

    lines.push({ text: 'PSI 사건 체인 증빙 패키지', kind: 'title' });
    lines.push({ text: `근로자: ${record.name}  |  사번: ${record.employeeId || '-'}  |  공종: ${record.jobField}`, kind: 'body' });
    lines.push({ text: `등급: ${record.safetyLevel} (${record.safetyScore}점)  |  OCR 신뢰도: ${typeof record.ocrConfidence === 'number' ? (record.ocrConfidence * 100).toFixed(0) + '%' : '-'}`, kind: 'body' });
    lines.push({ text: `무결성: ${typeof record.integrityScore === 'number' ? record.integrityScore : '-'}  |  증빙해시: ${record.evidenceHash || '-'}`, kind: 'body' });

    lines.push({ text: '1) OCR 결과 요약', kind: 'section' });
    lines.push({ text: `요약 인사이트: ${record.aiInsights || '-'}`, kind: 'body' });
    lines.push({ text: `취약영역: ${(record.weakAreas || []).join(', ') || '-'}`, kind: 'body' });

    lines.push({ text: '2) 정정 이력', kind: 'section' });
    if ((record.correctionHistory || []).length === 0) {
        lines.push({ text: '- 정정 이력 없음', kind: 'body' });
    } else {
        for (const item of record.correctionHistory || []) {
            lines.push({ text: `- ${new Date(item.timestamp).toLocaleString()} | ${item.actor} | ${item.changedFields.join(', ')} | ${item.reason}`, kind: 'body' });
            if (item.previousValues && item.nextValues) {
                const details = item.changedFields
                    .slice(0, 5)
                    .map((field) => {
                        const before = JSON.stringify(item.previousValues?.[field] ?? null);
                        const after = JSON.stringify(item.nextValues?.[field] ?? null);
                        return `${field}: ${before} -> ${after}`;
                    })
                    .join(' | ');
                lines.push({ text: `  · 변경 상세: ${details}`, kind: 'body' });
            }
        }
    }

    lines.push({ text: '2-1) 점수 조정 무결성 이력', kind: 'section' });
    if ((record.scoreAdjustmentHistory || []).length === 0) {
        lines.push({ text: '- 점수 조정 이력 없음', kind: 'body' });
    } else {
        for (const item of record.scoreAdjustmentHistory || []) {
            lines.push({
                text: `- ${new Date(item.timestamp).toLocaleString()} | ${item.actor} | ${item.previousScore}→${item.nextScore} | ${item.reasonCode} | ${item.reasonDetail} | 증빙: ${item.evidenceSummary}`,
                kind: 'body',
            });
        }
    }

    lines.push({ text: '3) 조치/교육 이력', kind: 'section' });
    if ((record.actionHistory || []).length === 0) {
        lines.push({ text: '- 조치 이력 없음', kind: 'body' });
    } else {
        for (const item of record.actionHistory || []) {
            lines.push({ text: `- ${new Date(item.timestamp).toLocaleString()} | ${item.actor} | ${item.actionType} | ${item.detail}`, kind: 'body' });
        }
    }

    lines.push({ text: '4) 승인/검토 이력', kind: 'section' });
    if ((record.approvalHistory || []).length === 0) {
        lines.push({ text: '- 승인 이력 없음', kind: 'body' });
    } else {
        for (const item of record.approvalHistory || []) {
            lines.push({ text: `- ${new Date(item.timestamp).toLocaleString()} | ${item.actor} | ${item.status} | ${item.comment || '-'}`, kind: 'body' });
        }
    }

    lines.push({ text: '5) 감사 트레일 (최근)', kind: 'section' });
    const audit = (record.auditTrail || []).slice(-20);
    if (audit.length === 0) {
        lines.push({ text: '- 감사 이력 없음', kind: 'body' });
    } else {
        for (const item of audit) {
            lines.push({ text: `- ${new Date(item.timestamp).toLocaleString()} | [${item.stage}] ${item.actor} | ${item.note || '-'}`, kind: 'body' });
        }
    }

    return lines;
};

const createCanvasPage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = A4_CANVAS_WIDTH;
    canvas.height = A4_CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#0f172a';
    return { canvas, ctx };
};

const renderEvidenceToCanvases = (record: WorkerRecord): HTMLCanvasElement[] => {
    const pages: HTMLCanvasElement[] = [];
    const firstPage = createCanvasPage();
    if (!firstPage) return pages;

    let pageCanvas = firstPage.canvas;
    let ctx = firstPage.ctx;
    let y = CANVAS_MARGIN;
    const maxWidth = A4_CANVAS_WIDTH - CANVAS_MARGIN * 2;
    const bottomLimit = A4_CANVAS_HEIGHT - CANVAS_MARGIN;

    const startNewPage = () => {
        pages.push(pageCanvas);
        const next = createCanvasPage();
        if (!next) return false;
        pageCanvas = next.canvas;
        ctx = next.ctx;
        y = CANVAS_MARGIN;
        return true;
    };

    const ensureSpace = (heightNeeded: number) => {
        if (y + heightNeeded <= bottomLimit) return true;
        return startNewPage();
    };

    const drawLineBlock = (content: string, kind: EvidenceLine['kind']) => {
        const fontSize = kind === 'title' ? 44 : kind === 'section' ? 30 : 22;
        const weight = kind === 'title' ? 800 : kind === 'section' ? 700 : 400;
        const lineHeight = kind === 'title' ? 58 : kind === 'section' ? 42 : 34;
        const spacingAfter = kind === 'title' ? 20 : kind === 'section' ? 10 : 6;

        ctx.font = `${weight} ${fontSize}px "Noto Sans KR", "Pretendard", sans-serif`;
        const wrapped: string[] = [];
        pushWrappedLines(ctx, content, maxWidth, wrapped);

        const blockHeight = wrapped.length * lineHeight + spacingAfter;
        if (!ensureSpace(blockHeight)) return;

        for (const line of wrapped) {
            ctx.fillText(line, CANVAS_MARGIN, y);
            y += lineHeight;
        }
        y += spacingAfter;
    };

    const lines = buildEvidenceLines(record);
    for (const item of lines) {
        drawLineBlock(item.text, item.kind);
    }

    pages.push(pageCanvas);
    return pages;
}

export async function createEvidencePackagePdfBlob(record: WorkerRecord): Promise<Blob | null> {
    const JsPDF = await ensureJsPdfConstructor().catch(() => null);

    if (!JsPDF) {
        return null;
    }

    const doc = new JsPDF('p', 'mm', 'a4');
    const canvases = renderEvidenceToCanvases(record);
    if (canvases.length === 0) {
        return null;
    }

    canvases.forEach((canvas, index) => {
        if (index > 0) doc.addPage();
        const imageData = canvas.toDataURL('image/png');
        doc.addImage(imageData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
    });

    const blob = doc.output('blob');
    return blob;
}

export async function exportEvidencePackagePdf(record: WorkerRecord): Promise<boolean> {
    const blob = await createEvidencePackagePdfBlob(record);
    if (!blob) {
        alert('PDF 출력 라이브러리(jsPDF)가 로드되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요.');
        return false;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PSI_EvidencePackage_${record.name}_${record.date}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
}

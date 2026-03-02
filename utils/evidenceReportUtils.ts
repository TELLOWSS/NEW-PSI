import type { WorkerRecord } from '../types';
import { getWindowProp } from './windowUtils';

const line = (doc: any, text: string, x: number, y: number, maxWidth = 180) => {
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return y + (lines.length * 6);
};

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

function renderEvidenceToDoc(doc: any, record: WorkerRecord) {
    let y = 15;

    doc.setFontSize(15);
    doc.text('PSI 사건 체인 증빙 패키지', 15, y);
    y += 8;

    doc.setFontSize(10);
    y = line(doc, `근로자: ${record.name}  |  사번: ${record.employeeId || '-'}  |  공종: ${record.jobField}`, 15, y);
    y = line(doc, `등급: ${record.safetyLevel} (${record.safetyScore}점)  |  OCR 신뢰도: ${typeof record.ocrConfidence === 'number' ? (record.ocrConfidence * 100).toFixed(0) + '%' : '-'}`, 15, y);
    y = line(doc, `무결성: ${typeof record.integrityScore === 'number' ? record.integrityScore : '-'}  |  증빙해시: ${record.evidenceHash || '-'}`, 15, y);
    y += 3;

    doc.setFontSize(12);
    doc.text('1) OCR 결과 요약', 15, y);
    y += 6;
    doc.setFontSize(10);
    y = line(doc, `요약 인사이트: ${record.aiInsights || '-'}`, 15, y);
    y = line(doc, `취약영역: ${(record.weakAreas || []).join(', ') || '-'}`, 15, y);
    y += 3;

    doc.setFontSize(12);
    doc.text('2) 정정 이력', 15, y);
    y += 6;
    doc.setFontSize(10);
    if ((record.correctionHistory || []).length === 0) {
        y = line(doc, '- 정정 이력 없음', 15, y);
    } else {
        for (const item of record.correctionHistory || []) {
            y = line(doc, `- ${new Date(item.timestamp).toLocaleString()} | ${item.actor} | ${item.changedFields.join(', ')} | ${item.reason}`, 15, y);
            if (item.previousValues && item.nextValues) {
                const details = item.changedFields
                    .slice(0, 5)
                    .map((field) => {
                        const before = JSON.stringify(item.previousValues?.[field] ?? null);
                        const after = JSON.stringify(item.nextValues?.[field] ?? null);
                        return `${field}: ${before} -> ${after}`;
                    })
                    .join(' | ');
                y = line(doc, `  · 변경 상세: ${details}`, 15, y);
            }
            if (y > 270) {
                doc.addPage();
                y = 15;
            }
        }
    }
    y += 3;

    doc.setFontSize(12);
    doc.text('3) 조치/교육 이력', 15, y);
    y += 6;
    doc.setFontSize(10);
    if ((record.actionHistory || []).length === 0) {
        y = line(doc, '- 조치 이력 없음', 15, y);
    } else {
        for (const item of record.actionHistory || []) {
            y = line(doc, `- ${new Date(item.timestamp).toLocaleString()} | ${item.actor} | ${item.actionType} | ${item.detail}`, 15, y);
            if (y > 270) {
                doc.addPage();
                y = 15;
            }
        }
    }
    y += 3;

    doc.setFontSize(12);
    doc.text('4) 승인/검토 이력', 15, y);
    y += 6;
    doc.setFontSize(10);
    if ((record.approvalHistory || []).length === 0) {
        y = line(doc, '- 승인 이력 없음', 15, y);
    } else {
        for (const item of record.approvalHistory || []) {
            y = line(doc, `- ${new Date(item.timestamp).toLocaleString()} | ${item.actor} | ${item.status} | ${item.comment || '-'}`, 15, y);
            if (y > 270) {
                doc.addPage();
                y = 15;
            }
        }
    }

    y += 3;
    doc.setFontSize(12);
    doc.text('5) 감사 트레일 (최근)', 15, y);
    y += 6;
    doc.setFontSize(10);
    const audit = (record.auditTrail || []).slice(-20);
    if (audit.length === 0) {
        y = line(doc, '- 감사 이력 없음', 15, y);
    } else {
        for (const item of audit) {
            y = line(doc, `- ${new Date(item.timestamp).toLocaleString()} | [${item.stage}] ${item.actor} | ${item.note || '-'}`, 15, y);
            if (y > 270) {
                doc.addPage();
                y = 15;
            }
        }
    }
}

export async function createEvidencePackagePdfBlob(record: WorkerRecord): Promise<Blob | null> {
    const jspdf = getWindowProp<any>('jspdf');
    const JsPDF = jspdf?.jsPDF || jspdf;

    if (!JsPDF) {
        return null;
    }

    const doc = new JsPDF('p', 'mm', 'a4');
    renderEvidenceToDoc(doc, record);
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

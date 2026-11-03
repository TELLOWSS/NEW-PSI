/**
 * Local, image-only A4 PDF writer for NEW-PSI education pages.
 * No network, paid API, jsPDF runtime, fonts or external script required.
 * Source canvases must already have passed the A4 overflow and language gate.
 * JPEG is embedded as DCTDecode, not re-encoded into new visual content.
 */
export interface EducationPdfPage {
    jpeg: Uint8Array;
    pixelWidth: number;
    pixelHeight: number;
    placement: { width: number; height: number; offsetX: number; offsetY: number };
}

const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const PT_PER_MM = 72 / 25.4;
const MAX_PAGE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const encoder = new TextEncoder();
const encode = (value: string): Uint8Array<ArrayBuffer> => encoder.encode(value);
const formatted = (number: number) => Number(number.toFixed(5)).toString();

export const buildEducationA4Pdf = (pages: readonly EducationPdfPage[]): Blob => {
    if (pages.length === 0 || pages.length > 20) throw new Error('A4 PDF는 1~20장까지 생성할 수 있습니다.');

    let inputBytes = 0;
    for (const p of pages) {
        if (!(p.jpeg instanceof Uint8Array) || p.jpeg.byteLength < 4 || p.jpeg.byteLength > MAX_PAGE_BYTES
            || p.jpeg[0] !== 0xff || p.jpeg[1] !== 0xd8
            || p.jpeg[p.jpeg.length - 2] !== 0xff || p.jpeg[p.jpeg.length - 1] !== 0xd9) {
            throw new Error('JPEG 형식이나 파일 크기를 확인할 수 없습니다.');
        }
        if (![p.pixelWidth, p.pixelHeight].every(value => Number.isSafeInteger(value) && value > 0 && value <= 16000)) {
            throw new Error('교육자료 이미지 해상도가 올바르지 않습니다.');
        }
        const { width, height, offsetX, offsetY } = p.placement;
        if (![width, height, offsetX, offsetY].every(Number.isFinite)
            || width <= 0 || height <= 0 || offsetX < 0 || offsetY < 0
            || width + offsetX > PAGE_W_MM + 0.01 || height + offsetY > PAGE_H_MM + 0.01) {
            throw new Error('교육자료 A4 배치가 유효하지 않습니다.');
        }
        inputBytes += p.jpeg.byteLength;
        if (inputBytes > MAX_TOTAL_BYTES) throw new Error('다국어 PDF가 100MB를 초과합니다. 언어를 나눠 저장하세요.');
    }

    const parts: BlobPart[] = [];
    const objectOffsets: number[] = [0];
    let position = 0;
    const push = (value: string | Uint8Array) => {
        const bytes = typeof value === 'string' ? encode(value) : value;
        parts.push(bytes);
        position += bytes.byteLength;
    };
    const object = (id: number, body: string) => {
        objectOffsets[id] = position;
        push(`${id} 0 obj\n${body}\nendobj\n`);
    };
    push('%PDF-1.4\n');
    // PDF binary marker avoids accidental text-only transport conversions.
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
    object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

    for (const [i, page] of pages.entries()) {
        const pageId = 3 + 3 * i;
        const contentsId = pageId + 1;
        const imageId = pageId + 2;
        object(pageId, [
            '<< /Type /Page /Parent 2 0 R',
            `/MediaBox [0 0 ${formatted(PAGE_W_MM * PT_PER_MM)} ${formatted(PAGE_H_MM * PT_PER_MM)}]`,
            `/Resources << /XObject << /Im0 ${imageId} 0 R >> >>`,
            `/Contents ${contentsId} 0 R >>`,
        ].join(' '));
        const p = page.placement;
        const bottom = PAGE_H_MM - p.offsetY - p.height;
        const draw = `q\n${formatted(p.width * PT_PER_MM)} 0 0 ${formatted(p.height * PT_PER_MM)} ${formatted(p.offsetX * PT_PER_MM)} ${formatted(bottom * PT_PER_MM)} cm\n/Im0 Do\nQ\n`;
        object(contentsId, `<< /Length ${encode(draw).length} >>\nstream\n${draw}endstream`);
        objectOffsets[imageId] = position;
        push(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.byteLength} >>\nstream\n`);
        push(page.jpeg);
        push('\nendstream\nendobj\n');
    }

    const xref = position;
    const count = pages.length * 3 + 3;
    push(`xref\n0 ${count}\n0000000000 65535 f \n`);
    for (let id = 1; id < count; id++) {
        const offset = objectOffsets[id];
        if (!Number.isSafeInteger(offset) || offset > 9999999999) throw new Error('PDF 내부 오프셋을 확인할 수 없습니다.');
        push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    }
    push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
};

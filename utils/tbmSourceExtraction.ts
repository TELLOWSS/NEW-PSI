import type { TbmEvidenceSource } from './tbmEducationStudio';

const SOURCE_FILE_LIMIT_BYTES = 20 * 1024 * 1024;
const EXTRACTED_TEXT_LIMIT_CHARS = 250_000;
const PPTX_ENTRY_LIMIT_BYTES = 2 * 1024 * 1024;
const PPTX_TOTAL_UNCOMPRESSED_LIMIT_BYTES = 8 * 1024 * 1024;

const assertExtractedTextLimit = (length: number): void => {
    if (length > EXTRACTED_TEXT_LIMIT_CHARS) {
        throw new Error('추출된 글자가 너무 많습니다. 필요한 페이지만 남기거나 자료를 나누어 다시 등록해 주세요.');
    }
};

const normalizeText = (value: string): string =>
    value
        .replace(/\u0000/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

const createSource = (file: File, text: string): TbmEvidenceSource => ({
    id: `document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'document',
    title: file.name.replace(/\.[^.]+$/, ''),
    fileName: file.name,
    text: normalizeText(text),
    createdAt: new Date().toISOString(),
});

const extractPdfText = async (file: File): Promise<string> => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const workerUrl = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
    const loadingTask = pdfjs.getDocument({
        data: await file.arrayBuffer(),
        stopAtErrors: true,
        maxImageSize: 16_000_000,
        enableXfa: false,
    });
    let document: Awaited<typeof loadingTask.promise> | null = null;
    try {
        document = await loadingTask.promise;
        const pages: string[] = [];
        let extractedChars = 0;
        const pageLimit = Math.min(document.numPages, 30);

        for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
            const page = await document.getPage(pageNumber);
            const content = await page.getTextContent();
            const textParts: string[] = [];
            for (const item of content.items) {
                const value = 'str' in item ? item.str : '';
                if (!value) continue;
                extractedChars += value.length + 1;
                assertExtractedTextLimit(extractedChars);
                textParts.push(value);
            }
            const pageText = textParts.join(' ').trim();
            if (pageText) pages.push(`--- page ${pageNumber} ---\n${pageText}`);
        }
        return pages.join('\n\n');
    } finally {
        await loadingTask.destroy();
    }
};

const extractPptxText = async (file: File): Promise<string> => {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slideNames = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const slides: string[] = [];
    let totalUncompressedBytes = 0;
    let extractedChars = 0;

    for (const slideName of slideNames.slice(0, 40)) {
        const entry = zip.file(slideName);
        const entrySize = Number((entry as unknown as { _data?: { uncompressedSize?: number } } | null)?._data?.uncompressedSize || 0);
        if (entrySize > PPTX_ENTRY_LIMIT_BYTES) {
            throw new Error('PPTX의 한 슬라이드 용량이 비정상적으로 큽니다. 필요한 슬라이드만 남겨 다시 등록해 주세요.');
        }
        totalUncompressedBytes += entrySize;
        if (totalUncompressedBytes > PPTX_TOTAL_UNCOMPRESSED_LIMIT_BYTES) {
            throw new Error('PPTX 압축 해제 용량이 안전 한도를 넘습니다. 자료를 나누어 다시 등록해 주세요.');
        }
        const xml = await entry?.async('text');
        if (!xml) continue;
        if (entrySize === 0 && xml.length > PPTX_ENTRY_LIMIT_BYTES) {
            throw new Error('PPTX의 한 슬라이드 용량이 비정상적으로 큽니다. 필요한 슬라이드만 남겨 다시 등록해 주세요.');
        }
        const document = new DOMParser().parseFromString(xml, 'application/xml');
        const text = [...document.getElementsByTagName('a:t')].map((node) => node.textContent || '').join(' ');
        const trimmedText = text.trim();
        if (trimmedText) {
            extractedChars += trimmedText.length;
            assertExtractedTextLimit(extractedChars);
            slides.push(`--- slide ${slides.length + 1} ---\n${trimmedText}`);
        }
    }
    return slides.join('\n\n');
};

export const extractTbmSourceFromFile = async (file: File): Promise<TbmEvidenceSource> => {
    if (file.size > SOURCE_FILE_LIMIT_BYTES) {
        throw new Error('20MB 이하의 근거자료만 사용할 수 있습니다. 파일을 나누거나 용량을 줄여 다시 등록해 주세요.');
    }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'pdf') {
        const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
        if (signature !== '%PDF-') throw new Error('파일 확장자는 PDF이지만 실제 PDF 형식이 아닙니다. 원본 파일을 다시 확인해 주세요.');
        const text = await extractPdfText(file);
        if (!text) throw new Error('PDF에서 선택 가능한 글자를 찾지 못했습니다. 스캔 PDF는 내용을 직접 붙여넣어 주세요.');
        return createSource(file, text);
    }
    if (extension === 'pptx') {
        const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        const isZip = header[0] === 0x50 && header[1] === 0x4b && (
            (header[2] === 0x03 && header[3] === 0x04)
            || (header[2] === 0x05 && header[3] === 0x06)
            || (header[2] === 0x07 && header[3] === 0x08)
        );
        if (!isZip) throw new Error('파일 확장자는 PPTX이지만 실제 프레젠테이션 형식이 아닙니다. 원본 파일을 다시 확인해 주세요.');
        const text = await extractPptxText(file);
        if (!text) throw new Error('PPTX에서 글자를 찾지 못했습니다.');
        return createSource(file, text);
    }
    if (extension === 'txt' || extension === 'md') {
        const text = await file.text();
        assertExtractedTextLimit(text.length);
        return createSource(file, text);
    }
    throw new Error('PDF, PPTX, TXT, MD 파일만 사용할 수 있습니다.');
};

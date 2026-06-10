import type { TbmEvidenceSource } from './tbmEducationStudio';

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
    const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    const pageLimit = Math.min(document.numPages, 30);

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    return pages.join('\n\n');
};

const extractPptxText = async (file: File): Promise<string> => {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slideNames = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const slides: string[] = [];

    for (const slideName of slideNames.slice(0, 40)) {
        const xml = await zip.file(slideName)?.async('text');
        if (!xml) continue;
        const document = new DOMParser().parseFromString(xml, 'application/xml');
        const text = [...document.getElementsByTagName('a:t')].map((node) => node.textContent || '').join(' ');
        if (text.trim()) slides.push(text);
    }
    return slides.join('\n\n');
};

export const extractTbmSourceFromFile = async (file: File): Promise<TbmEvidenceSource> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'pdf') {
        const text = await extractPdfText(file);
        if (!text) throw new Error('PDF에서 선택 가능한 글자를 찾지 못했습니다. 스캔 PDF는 내용을 직접 붙여넣어 주세요.');
        return createSource(file, text);
    }
    if (extension === 'pptx') {
        const text = await extractPptxText(file);
        if (!text) throw new Error('PPTX에서 글자를 찾지 못했습니다.');
        return createSource(file, text);
    }
    if (extension === 'txt' || extension === 'md') {
        return createSource(file, await file.text());
    }
    throw new Error('PDF, PPTX, TXT, MD 파일만 사용할 수 있습니다.');
};


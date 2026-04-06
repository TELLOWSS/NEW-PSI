const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

export interface CanvasPlacement {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
}

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const waitForImages = async (root: HTMLElement) => {
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(async (img) => {
        if (img.complete) return;
        if (typeof img.decode === 'function') {
            try {
                await img.decode();
                return;
            } catch {
                // decode 실패 시 load 이벤트 대기
            }
        }

        await new Promise<void>((resolve) => {
            const handleDone = () => {
                img.removeEventListener('load', handleDone);
                img.removeEventListener('error', handleDone);
                resolve();
            };

            img.addEventListener('load', handleDone, { once: true });
            img.addEventListener('error', handleDone, { once: true });
        });
    }));
};

const waitForFonts = async () => {
    if (!('fonts' in document) || !document.fonts) return;

    try {
        await document.fonts.ready;
    } catch {
        // noop
    }
};

const waitForStableLayout = async (root: HTMLElement) => {
    await waitForFonts();
    await waitForImages(root);
    await wait(80);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

const ensureCloneStyle = (doc: Document) => {
    if (doc.getElementById('psi-pdf-capture-style')) return;

    const style = doc.createElement('style');
    style.id = 'psi-pdf-capture-style';
    style.textContent = `
        [data-report-template-root="true"] {
            box-shadow: none !important;
            margin: 0 !important;
            transform: none !important;
            overflow: visible !important;
        }
        [data-report-page="true"] {
            width: 210mm !important;
            min-height: 297mm !important;
            height: 297mm !important;
            max-height: 297mm !important;
            box-shadow: none !important;
            overflow: hidden !important;
        }
        [data-report-template-root="true"],
        [data-report-template-root="true"] * {
            animation: none !important;
            transition: none !important;
            caret-color: transparent !important;
        }
        [data-report-template-root="true"] canvas {
            display: block !important;
            max-width: none !important;
        }
        [data-report-template-root="true"] [data-report-chart-box="true"] {
            overflow: visible !important;
        }
        [data-report-template-root="true"] svg {
            shape-rendering: geometricPrecision;
            text-rendering: geometricPrecision;
        }
    `;
    doc.head.appendChild(style);
};

type Html2Canvas = (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;

type JsPdfConstructor = new (orientation: string, unit: string, format: string) => {
    addImage: (...args: unknown[]) => void;
    save: (filename: string) => void;
    output?: (type: string) => Blob;
    addPage?: () => void;
};

interface CaptureReportCanvasOptions {
    scale?: number;
}

interface ElementLayoutSize {
    width: number;
    height: number;
}

const getReportCaptureTargets = (element: HTMLElement): HTMLElement[] => {
    const pageNodes = Array.from(element.querySelectorAll(':scope > [data-report-page="true"]')) as HTMLElement[];
    return pageNodes.length > 0 ? pageNodes : [element];
};

let htmlToImagePromise: Promise<typeof import('html-to-image')> | null = null;
const loadHtmlToImage = () => {
    if (!htmlToImagePromise) {
        htmlToImagePromise = import('html-to-image');
    }
    return htmlToImagePromise;
};

const getElementLayoutSize = (target: HTMLElement): ElementLayoutSize => {
    const rect = target.getBoundingClientRect();
    const width = Math.max(
        1,
        Math.ceil(target.scrollWidth || 0),
        Math.ceil(target.offsetWidth || 0),
        Math.ceil(target.clientWidth || 0),
        Math.ceil(rect.width || 0),
    );
    const height = Math.max(
        1,
        Math.ceil(target.scrollHeight || 0),
        Math.ceil(target.offsetHeight || 0),
        Math.ceil(target.clientHeight || 0),
        Math.ceil(rect.height || 0),
    );

    return { width, height };
};

export const captureReportCanvas = async (
    element: HTMLElement,
    html2canvas: Html2Canvas,
    options: CaptureReportCanvasOptions = {}
): Promise<HTMLCanvasElement> => {
    const [firstCanvas] = await captureReportCanvases(element, html2canvas, options);
    return firstCanvas;
};

export const captureReportCanvases = async (
    element: HTMLElement,
    html2canvas: Html2Canvas,
    options: CaptureReportCanvasOptions = {}
): Promise<HTMLCanvasElement[]> => {
    await waitForStableLayout(element);
    const scale = options.scale ?? Math.max(2, Math.min(3, window.devicePixelRatio || 1));

    const captureSingleCanvas = async (target: HTMLElement): Promise<HTMLCanvasElement> => {
        const { width, height } = getElementLayoutSize(target);

        try {
            return await html2canvas(target, {
                scale,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                foreignObjectRendering: false,
                removeContainer: true,
                width,
                height,
                windowWidth: width,
                windowHeight: height,
                scrollX: 0,
                scrollY: -window.scrollY,
                onclone: (clonedDocument: Document) => {
                    ensureCloneStyle(clonedDocument);
                    const clonedRoot = clonedDocument.querySelector('[data-report-template-root="true"]') as HTMLElement | null;
                    if (clonedRoot) {
                        clonedRoot.style.boxShadow = 'none';
                        clonedRoot.style.margin = '0';
                        clonedRoot.style.transform = 'none';
                    }
                },
            });
        } catch {
            // html2canvas 실패 시 html-to-image로 폴백
        }

        try {
            const { toCanvas } = await loadHtmlToImage();
            return await toCanvas(target, {
                cacheBust: true,
                pixelRatio: scale,
                backgroundColor: '#ffffff',
                width,
                height,
                canvasWidth: Math.round(width * scale),
                canvasHeight: Math.round(height * scale),
                style: {
                    margin: '0',
                    transform: 'none',
                    boxShadow: 'none',
                },
            });
        } catch (error) {
            throw error instanceof Error ? error : new Error('리포트 캡처에 실패했습니다.');
        }
    };

    const targets = getReportCaptureTargets(element);
    return Promise.all(targets.map((target) => captureSingleCanvas(target)));
};

export const saveCanvasAsA4Pdf = (
    canvas: HTMLCanvasElement,
    JsPDF: JsPdfConstructor,
    filename: string,
    imageType: 'PNG' | 'JPEG' = 'PNG',
    quality: number = 1
) => {
    saveCanvasesAsA4Pdf([canvas], JsPDF, filename, imageType, quality);
};

export const saveCanvasesAsA4Pdf = (
    canvases: HTMLCanvasElement[],
    JsPDF: JsPdfConstructor,
    filename: string,
    imageType: 'PNG' | 'JPEG' = 'PNG',
    quality: number = 1
) => {
    const targetCanvases = canvases.filter((canvas) => canvas.width > 0 && canvas.height > 0);
    if (targetCanvases.length === 0) {
        throw new Error('PDF로 저장할 캔버스가 없습니다.');
    }

    const pdf = new JsPDF('p', 'mm', 'a4');

    targetCanvases.forEach((canvas, index) => {
        if (index > 0 && typeof pdf.addPage === 'function') {
            pdf.addPage();
        }

        const mimeType = imageType === 'PNG' ? 'image/png' : 'image/jpeg';
        const imageData = canvas.toDataURL(mimeType, quality);
        const pageWidth = A4_WIDTH_MM;
        const pageHeight = A4_HEIGHT_MM;
        const imageWidth = pageWidth;
        const imageHeight = (canvas.height * imageWidth) / Math.max(1, canvas.width);

        if (imageHeight <= pageHeight || typeof pdf.addPage !== 'function') {
            const placement = getCanvasPlacementOnA4(canvas);
            pdf.addImage(imageData, imageType, placement.offsetX, placement.offsetY, placement.width, placement.height, undefined, 'FAST');
            return;
        }

        let remainingHeight = imageHeight;
        let currentY = 0;

        pdf.addImage(imageData, imageType, 0, currentY, imageWidth, imageHeight, undefined, 'FAST');
        remainingHeight -= pageHeight;

        while (remainingHeight > 0 && typeof pdf.addPage === 'function') {
            pdf.addPage();
            currentY = remainingHeight - imageHeight;
            pdf.addImage(imageData, imageType, 0, currentY, imageWidth, imageHeight, undefined, 'FAST');
            remainingHeight -= pageHeight;
        }
    });

    pdf.save(filename);
};

export const buildPdfBlobFromCanvases = (
    canvases: HTMLCanvasElement[],
    JsPDF: JsPdfConstructor,
    imageType: 'PNG' | 'JPEG' = 'PNG',
    quality: number = 1
): Blob => {
    const targetCanvases = canvases.filter((canvas) => canvas.width > 0 && canvas.height > 0);
    if (targetCanvases.length === 0) {
        throw new Error('PDF로 변환할 캔버스가 없습니다.');
    }

    const pdf = new JsPDF('p', 'mm', 'a4');

    targetCanvases.forEach((canvas, index) => {
        if (index > 0 && typeof pdf.addPage === 'function') {
            pdf.addPage();
        }

        const imageData = getCanvasImageData(canvas, imageType, quality);
        const placement = getCanvasPlacementOnA4(canvas);
        pdf.addImage(imageData, imageType, placement.offsetX, placement.offsetY, placement.width, placement.height, undefined, 'FAST');
    });

    if (typeof pdf.output !== 'function') {
        throw new Error('PDF Blob 출력을 지원하지 않습니다.');
    }

    return pdf.output('blob');
};

export const canvasToBlob = async (
    canvas: HTMLCanvasElement,
    mimeType: string,
    quality?: number,
    timeoutMs: number = 10000
): Promise<Blob> => {
    const blob = await Promise.race([
        new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, quality)),
        new Promise<Blob | null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (!blob) {
        throw new Error('캔버스 Blob 변환에 실패했습니다.');
    }

    return blob;
};

export const getCanvasPlacementOnA4 = (canvas: HTMLCanvasElement): CanvasPlacement => {
    const canvasWidth = canvas.width || 1;
    const canvasHeight = canvas.height || 1;
    const canvasRatio = canvasWidth / canvasHeight;
    const pageRatio = A4_WIDTH_MM / A4_HEIGHT_MM;

    let width = A4_WIDTH_MM;
    let height = A4_HEIGHT_MM;

    if (canvasRatio > pageRatio) {
        height = width / canvasRatio;
    } else {
        width = height * canvasRatio;
    }

    return {
        width,
        height,
        offsetX: (A4_WIDTH_MM - width) / 2,
        offsetY: (A4_HEIGHT_MM - height) / 2,
    };
};

export const getCanvasImageData = (
    canvas: HTMLCanvasElement,
    imageType: 'PNG' | 'JPEG' = 'PNG',
    quality: number = 1
) => {
    const mimeType = imageType === 'PNG' ? 'image/png' : 'image/jpeg';
    return canvas.toDataURL(mimeType, quality);
};

import { toCanvas } from 'html-to-image';

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
            overflow: hidden !important;
        }
        [data-report-template-root="true"],
        [data-report-template-root="true"] * {
            animation: none !important;
            transition: none !important;
            caret-color: transparent !important;
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

export const captureReportCanvas = async (
    element: HTMLElement,
    html2canvas: Html2Canvas,
    options: CaptureReportCanvasOptions = {}
): Promise<HTMLCanvasElement> => {
    await waitForStableLayout(element);

    const bounds = element.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(bounds.width));
    const height = Math.max(1, Math.ceil(bounds.height));
    const scale = options.scale ?? Math.max(2, Math.min(3, window.devicePixelRatio || 1));

    try {
        return await toCanvas(element, {
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
    } catch {
        // html-to-image 실패 시 html2canvas로 폴백
    }

    return html2canvas(element, {
        scale,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        foreignObjectRendering: true,
        removeContainer: true,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
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
};

export const saveCanvasAsA4Pdf = (
    canvas: HTMLCanvasElement,
    JsPDF: JsPdfConstructor,
    filename: string,
    imageType: 'PNG' | 'JPEG' = 'PNG',
    quality: number = 1
) => {
    const pdf = new JsPDF('p', 'mm', 'a4');
    const placement = getCanvasPlacementOnA4(canvas);
    const mimeType = imageType === 'PNG' ? 'image/png' : 'image/jpeg';
    const imageData = canvas.toDataURL(mimeType, quality);

    pdf.addImage(imageData, imageType, placement.offsetX, placement.offsetY, placement.width, placement.height, undefined, 'FAST');
    pdf.save(filename);
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

type WindowWithExternalScripts = Window & typeof globalThis & {
    Chart?: unknown;
    html2canvas?: unknown;
    jspdf?: unknown;
    JSZip?: unknown;
    saveAs?: unknown;
    QRCode?: unknown;
};

const SCRIPT_URLS = {
    chartjs: 'https://cdn.jsdelivr.net/npm/chart.js',
    html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    qrcodejs: 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    fileSaver: 'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js',
} as const;

const scriptPromises = new Map<string, Promise<void>>();

const loadScriptOnce = (key: string, src: string, globalName: keyof WindowWithExternalScripts) => {
    const win = window as WindowWithExternalScripts;
    if (win[globalName]) {
        return Promise.resolve();
    }

    const existing = scriptPromises.get(key);
    if (existing) {
        return existing;
    }

    const promise = new Promise<void>((resolve, reject) => {
        const existingScript = document.querySelector(`script[data-external-script="${key}"]`) as HTMLScriptElement | null;
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve(), { once: true });
            existingScript.addEventListener('error', () => reject(new Error(`${key} 로드 실패`)), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.dataset.externalScript = key;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`${key} 로드 실패`));
        document.head.appendChild(script);
    }).then(() => {
        if (!win[globalName]) {
            throw new Error(`${key} 전역 객체를 찾을 수 없습니다.`);
        }
    });

    scriptPromises.set(key, promise);
    return promise;
};

export const ensureHtml2Canvas = async () => {
    await loadScriptOnce('html2canvas', SCRIPT_URLS.html2canvas, 'html2canvas');
    return (window as WindowWithExternalScripts).html2canvas as ((element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>);
};

export const ensureChartJs = async () => {
    await loadScriptOnce('chartjs', SCRIPT_URLS.chartjs, 'Chart');
    return (window as WindowWithExternalScripts).Chart as any;
};

export const ensureJsPdfConstructor = async () => {
    await loadScriptOnce('jspdf', SCRIPT_URLS.jspdf, 'jspdf');
    const jspdf = (window as WindowWithExternalScripts).jspdf as { jsPDF?: unknown } | undefined;
    return (jspdf?.jsPDF || jspdf || null) as (new (orientation: string, unit: string, format: string) => {
        addImage: (...args: unknown[]) => void;
        save: (filename: string) => void;
        output?: (type: string) => Blob;
        addPage?: () => void;
    }) | null;
};

export const ensureJsZip = async () => {
    await loadScriptOnce('jszip', SCRIPT_URLS.jszip, 'JSZip');
    return (window as WindowWithExternalScripts).JSZip as any;
};

export const ensureFileSaver = async () => {
    await loadScriptOnce('file-saver', SCRIPT_URLS.fileSaver, 'saveAs');
    return (window as WindowWithExternalScripts).saveAs as ((data: Blob, filename: string) => void) | null;
};

export const ensureQRCodeJs = async () => {
    await loadScriptOnce('qrcodejs', SCRIPT_URLS.qrcodejs, 'QRCode');
    return (window as WindowWithExternalScripts).QRCode as any;
};
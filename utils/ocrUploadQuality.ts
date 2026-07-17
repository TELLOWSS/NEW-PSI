export type OcrUploadIssueCode =
    | 'LOW_RESOLUTION'
    | 'EXTREME_ASPECT_RATIO'
    | 'TOO_DARK'
    | 'TOO_BRIGHT'
    | 'LOW_CONTRAST'
    | 'POSSIBLE_BLUR'
    | 'POSSIBLE_GLARE'
    | 'PREVIEW_UNAVAILABLE';

export type OcrUploadIssue = {
    code: OcrUploadIssueCode;
    severity: 'block' | 'warning';
    message: string;
};

export type OcrUploadPreflight = {
    key: string;
    fileName: string;
    status: 'ready' | 'warning' | 'blocked';
    width?: number;
    height?: number;
    issues: OcrUploadIssue[];
};

type PixelQualityMetrics = {
    meanLuminance: number;
    contrast: number;
    brightPixelRatio: number;
    laplacianVariance: number;
};

export const getOcrFileKey = (file: Pick<File, 'name' | 'size' | 'lastModified'>): string => (
    `${file.name}:${file.size}:${file.lastModified}`
);

export const mergeUniqueOcrFiles = (existing: File[], incoming: File[]) => {
    const known = new Set(existing.map(getOcrFileKey));
    const added: File[] = [];
    let duplicateCount = 0;

    incoming.forEach((file) => {
        const key = getOcrFileKey(file);
        if (known.has(key)) {
            duplicateCount += 1;
            return;
        }
        known.add(key);
        added.push(file);
    });

    return { files: [...existing, ...added], addedCount: added.length, duplicateCount };
};

export const calculatePixelQualityMetrics = (
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
): PixelQualityMetrics => {
    const luminance = new Float32Array(width * height);
    let sum = 0;
    let brightPixels = 0;

    for (let index = 0, pixelIndex = 0; index < pixels.length; index += 4, pixelIndex += 1) {
        const value = (pixels[index] * 0.2126) + (pixels[index + 1] * 0.7152) + (pixels[index + 2] * 0.0722);
        luminance[pixelIndex] = value;
        sum += value;
        if (value >= 250) brightPixels += 1;
    }

    const meanLuminance = luminance.length > 0 ? sum / luminance.length : 0;
    let squaredDiff = 0;
    luminance.forEach((value) => {
        const diff = value - meanLuminance;
        squaredDiff += diff * diff;
    });
    const contrast = luminance.length > 0 ? Math.sqrt(squaredDiff / luminance.length) : 0;

    let laplacianSum = 0;
    let laplacianSquaredSum = 0;
    let laplacianCount = 0;
    for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
            const center = luminance[(y * width) + x];
            const laplacian = (
                luminance[((y - 1) * width) + x]
                + luminance[((y + 1) * width) + x]
                + luminance[(y * width) + x - 1]
                + luminance[(y * width) + x + 1]
                - (4 * center)
            );
            laplacianSum += laplacian;
            laplacianSquaredSum += laplacian * laplacian;
            laplacianCount += 1;
        }
    }
    const laplacianMean = laplacianCount > 0 ? laplacianSum / laplacianCount : 0;
    const laplacianVariance = laplacianCount > 0
        ? Math.max(0, (laplacianSquaredSum / laplacianCount) - (laplacianMean * laplacianMean))
        : 0;

    return {
        meanLuminance,
        contrast,
        brightPixelRatio: luminance.length > 0 ? brightPixels / luminance.length : 0,
        laplacianVariance,
    };
};

const buildIssues = (
    width: number,
    height: number,
    metrics: PixelQualityMetrics,
): OcrUploadIssue[] => {
    const issues: OcrUploadIssue[] = [];
    const shortSide = Math.min(width, height);
    const aspectRatio = width / Math.max(1, height);

    if (shortSide < 640) {
        issues.push({
            code: 'LOW_RESOLUTION',
            severity: 'block',
            message: '해상도가 너무 낮습니다. 문서의 짧은 면이 640px 이상이 되도록 다시 촬영해 주세요.',
        });
    } else if (shortSide < 1000) {
        issues.push({
            code: 'LOW_RESOLUTION',
            severity: 'warning',
            message: '작은 글씨가 누락될 수 있습니다. 가능하면 더 가까이에서 다시 촬영해 주세요.',
        });
    }

    if (aspectRatio < 0.45 || aspectRatio > 2.2) {
        issues.push({
            code: 'EXTREME_ASPECT_RATIO',
            severity: 'block',
            message: '문서가 잘렸거나 지나치게 기울어진 것으로 보입니다. 종이 네 모서리가 모두 보이게 다시 촬영해 주세요.',
        });
    }
    if (metrics.meanLuminance < 45) {
        issues.push({ code: 'TOO_DARK', severity: 'block', message: '사진이 너무 어둡습니다. 밝은 곳에서 다시 촬영해 주세요.' });
    } else if (metrics.meanLuminance > 238) {
        issues.push({ code: 'TOO_BRIGHT', severity: 'warning', message: '사진이 너무 밝아 연필 글씨가 사라질 수 있습니다.' });
    }
    if (metrics.contrast < 22) {
        issues.push({ code: 'LOW_CONTRAST', severity: 'warning', message: '글자와 배경의 대비가 낮습니다. 그림자 없이 선명하게 다시 촬영해 주세요.' });
    }
    if (metrics.laplacianVariance < 18) {
        issues.push({ code: 'POSSIBLE_BLUR', severity: 'block', message: '사진이 흔들리거나 초점이 맞지 않은 것으로 보입니다.' });
    } else if (metrics.laplacianVariance < 38) {
        issues.push({ code: 'POSSIBLE_BLUR', severity: 'warning', message: '일부 글씨가 흐릴 수 있습니다. 원본 확대 확인이 필요합니다.' });
    }
    if (metrics.brightPixelRatio > 0.2) {
        issues.push({ code: 'POSSIBLE_GLARE', severity: 'warning', message: '빛 반사가 넓게 감지되었습니다. 조명 각도를 바꿔 다시 촬영하는 것을 권장합니다.' });
    }

    return issues;
};

const loadImage = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(file);
    }

    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('preview unavailable'));
        };
        image.src = url;
    });
};

export const assessOcrUploadFile = async (file: File): Promise<OcrUploadPreflight> => {
    const key = getOcrFileKey(file);
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        return { key, fileName: file.name, status: 'ready', issues: [] };
    }

    try {
        const image = await loadImage(file);
        const sourceWidth = 'naturalWidth' in image ? image.naturalWidth : image.width;
        const sourceHeight = 'naturalHeight' in image ? image.naturalHeight : image.height;
        const scale = Math.min(1, 256 / Math.max(sourceWidth, sourceHeight));
        const width = Math.max(8, Math.round(sourceWidth * scale));
        const height = Math.max(8, Math.round(sourceHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('canvas unavailable');
        context.drawImage(image, 0, 0, width, height);
        if ('close' in image && typeof image.close === 'function') image.close();
        const pixels = context.getImageData(0, 0, width, height).data;
        const metrics = calculatePixelQualityMetrics(pixels, width, height);
        const issues = buildIssues(sourceWidth, sourceHeight, metrics);
        return {
            key,
            fileName: file.name,
            width: sourceWidth,
            height: sourceHeight,
            status: issues.some((issue) => issue.severity === 'block')
                ? 'blocked'
                : issues.length > 0 ? 'warning' : 'ready',
            issues,
        };
    } catch {
        return {
            key,
            fileName: file.name,
            status: 'warning',
            issues: [{
                code: 'PREVIEW_UNAVAILABLE',
                severity: 'warning',
                message: '이 형식은 브라우저에서 미리 점검할 수 없습니다. 분석 후 원본 대조가 필요합니다.',
            }],
        };
    }
};

export const assessOcrUploadBatch = (files: File[]) => Promise.all(files.map(assessOcrUploadFile));

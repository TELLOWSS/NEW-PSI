const MAX_DIMENSION = 1280;
const OUTPUT_QUALITY = 0.7;

const loadImageElement = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };

        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('이미지를 불러올 수 없습니다.'));
        };

        image.src = objectUrl;
    });
};

const resizeByMaxDimension = (width: number, height: number) => {
    if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
        return { width, height };
    }

    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    return {
        width: Math.round(width * ratio),
        height: Math.round(height * ratio)
    };
};

export async function compressImage(file: File): Promise<string> {
    if (!file.type.startsWith('image/')) {
        throw new Error('이미지 파일만 압축할 수 있습니다.');
    }

    const image = await loadImageElement(file);
    const { width, height } = resizeByMaxDimension(image.width, image.height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas 컨텍스트를 생성할 수 없습니다.');
    }

    context.drawImage(image, 0, 0, width, height);

    const compressedDataUrl = canvas.toDataURL('image/jpeg', OUTPUT_QUALITY);
    const base64Data = compressedDataUrl.split(',')[1];

    if (!base64Data) {
        throw new Error('이미지 압축 결과를 생성하지 못했습니다.');
    }

    return base64Data;
}

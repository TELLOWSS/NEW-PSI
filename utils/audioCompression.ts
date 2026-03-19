import * as lamejs from 'lamejs/lame.all.js';

type CompressionOptions = {
    targetBitrateKbps?: number;
};

const MP3_FRAME_SAMPLE_COUNT = 1152;
const DEFAULT_BITRATE_KBPS = 64;

type BrowserAudioContextConstructor = {
    new (): AudioContext;
};

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (result instanceof ArrayBuffer) {
                resolve(result);
                return;
            }
            reject(new Error('오디오 파일을 ArrayBuffer로 읽지 못했습니다.'));
        };
        reader.onerror = () => reject(reader.error || new Error('오디오 파일 읽기 실패'));
        reader.readAsArrayBuffer(file);
    });
};

const createAudioContext = (): AudioContext => {
    const contextConstructor = (window.AudioContext || (window as Window & { webkitAudioContext?: BrowserAudioContextConstructor }).webkitAudioContext);
    if (!contextConstructor) {
        throw new Error('이 브라우저는 오디오 디코딩을 지원하지 않습니다.');
    }

    return new contextConstructor();
};

const decodeAudioBuffer = async (audioContext: AudioContext, inputBuffer: ArrayBuffer): Promise<AudioBuffer> => {
    return new Promise((resolve, reject) => {
        const copiedBuffer = inputBuffer.slice(0);
        audioContext.decodeAudioData(
            copiedBuffer,
            (decoded) => resolve(decoded),
            (error) => reject(error || new Error('오디오 디코딩 실패'))
        );
    });
};

const clampFloat = (value: number): number => {
    if (value > 1) return 1;
    if (value < -1) return -1;
    return value;
};

const extractFirstChannelMono = (audioBuffer: AudioBuffer): Float32Array => {
    const firstChannel = audioBuffer.getChannelData(0);
    return new Float32Array(firstChannel);
};

const floatToInt16 = (source: Float32Array): Int16Array => {
    const target = new Int16Array(source.length);
    for (let index = 0; index < source.length; index += 1) {
        const sample = clampFloat(source[index]);
        target[index] = sample < 0
            ? Math.round(sample * 32768)
            : Math.round(sample * 32767);
    }
    return target;
};

const normalizeFileName = (fileName: string): string => {
    return fileName
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 80) || 'audio';
};

export async function compressAudioToMp3(file: File, options: CompressionOptions = {}): Promise<File> {
    const targetBitrateKbps = Math.min(64, Math.max(64, options.targetBitrateKbps || DEFAULT_BITRATE_KBPS));
    const inputBuffer = await readFileAsArrayBuffer(file);
    const audioContext = createAudioContext();

    try {
        const audioBuffer = await decodeAudioBuffer(audioContext, inputBuffer);
        const monoFloat32 = extractFirstChannelMono(audioBuffer);
        const pcm = floatToInt16(monoFloat32);
        const sampleRate = Math.round(audioBuffer.sampleRate);

        const lameNamespace = lamejs as any;
        const Mp3Encoder = lameNamespace?.Mp3Encoder || lameNamespace?.default?.Mp3Encoder;
        if (typeof Mp3Encoder !== 'function') {
            throw new Error('lamejs Mp3Encoder를 초기화할 수 없습니다.');
        }
        const encoder = new Mp3Encoder(1, sampleRate, targetBitrateKbps);
        const mp3Data: Int8Array[] = [];

        for (let offset = 0; offset < pcm.length; offset += MP3_FRAME_SAMPLE_COUNT) {
            const chunk = pcm.subarray(offset, Math.min(offset + MP3_FRAME_SAMPLE_COUNT, pcm.length));
            const encoded = encoder.encodeBuffer(chunk);
            if (encoded.length > 0) {
                mp3Data.push(encoded);
            }
        }

        const flushed = encoder.flush();
        if (flushed.length > 0) {
            mp3Data.push(flushed);
        }

        const outputBlob = new Blob(mp3Data, { type: 'audio/mp3' });
        const outputName = `${normalizeFileName(file.name)}-compressed.mp3`;

        return new File([outputBlob], outputName, {
            type: 'audio/mp3',
            lastModified: Date.now(),
        });
    } finally {
        await audioContext.close();
    }
}

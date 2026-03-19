import * as lamejs from 'lamejs';

type CompressionOptions = {
    targetBitrateKbps?: number;
    targetSampleRate?: number;
};

const DEFAULT_BITRATE_KBPS = 48;
const DEFAULT_SAMPLE_RATE = 22050;
const MP3_FRAME_SAMPLE_COUNT = 1152;

const clampFloat = (value: number): number => {
    if (value > 1) return 1;
    if (value < -1) return -1;
    return value;
};

const mixToMono = (audioBuffer: AudioBuffer): Float32Array => {
    const channelCount = audioBuffer.numberOfChannels;
    const frameCount = audioBuffer.length;
    const mono = new Float32Array(frameCount);

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        const channelData = audioBuffer.getChannelData(channelIndex);
        for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
            mono[frameIndex] += channelData[frameIndex] / channelCount;
        }
    }

    return mono;
};

const resampleMono = (source: Float32Array, sourceRate: number, targetRate: number): Float32Array => {
    if (sourceRate === targetRate) {
        return source;
    }

    const ratio = sourceRate / targetRate;
    const targetLength = Math.max(1, Math.round(source.length / ratio));
    const target = new Float32Array(targetLength);

    for (let targetIndex = 0; targetIndex < targetLength; targetIndex += 1) {
        const sourceIndex = targetIndex * ratio;
        const leftIndex = Math.floor(sourceIndex);
        const rightIndex = Math.min(leftIndex + 1, source.length - 1);
        const weight = sourceIndex - leftIndex;
        target[targetIndex] = source[leftIndex] * (1 - weight) + source[rightIndex] * weight;
    }

    return target;
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
    const targetBitrateKbps = Math.min(64, Math.max(24, options.targetBitrateKbps || DEFAULT_BITRATE_KBPS));
    const targetSampleRate = options.targetSampleRate || DEFAULT_SAMPLE_RATE;

    const inputBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext();

    try {
        const decoded = await audioContext.decodeAudioData(inputBuffer.slice(0));
        const mono = mixToMono(decoded);
        const resampled = resampleMono(mono, decoded.sampleRate, targetSampleRate);
        const pcm = floatToInt16(resampled);

        const Mp3Encoder = (lamejs as any).Mp3Encoder;
        const encoder = new Mp3Encoder(1, targetSampleRate, targetBitrateKbps);
        const chunks: Uint8Array[] = [];

        for (let offset = 0; offset < pcm.length; offset += MP3_FRAME_SAMPLE_COUNT) {
            const frame = pcm.subarray(offset, Math.min(offset + MP3_FRAME_SAMPLE_COUNT, pcm.length));
            const encoded = encoder.encodeBuffer(frame);
            if (encoded.length > 0) {
                chunks.push(new Uint8Array(encoded));
            }
        }

        const flushed = encoder.flush();
        if (flushed.length > 0) {
            chunks.push(new Uint8Array(flushed));
        }

        const outputBlob = new Blob(chunks, { type: 'audio/mpeg' });
        const outputName = `${normalizeFileName(file.name)}-compressed.mp3`;

        return new File([outputBlob], outputName, {
            type: 'audio/mpeg',
            lastModified: Date.now(),
        });
    } finally {
        await audioContext.close();
    }
}

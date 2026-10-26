import { createEducationSceneManifest } from './educationVisualExports';
import type { TbmEducationDraft } from './tbmEducationStudio';

export const EDUCATION_PREVIEW_SECONDS = 30;

/**
 * Compresses the timeline of a reviewed 300-second education draft into a
 * local, text-only 30-second visual preview. This does NOT render video.
 */
export interface EducationPreviewScene {
    order: number;
    title: string;
    narration: string;
    visualGuide: string;
    originalStart: number;
    originalDuration: number;
    previewStart: number;
    previewDuration: number;
}

export const buildEducationPreview30 = (draft: TbmEducationDraft): EducationPreviewScene[] => {
    const manifest = createEducationSceneManifest(draft);
    return manifest.scenes.map((scene) => ({
        order: scene.order,
        title: scene.title,
        narration: scene.narration,
        visualGuide: scene.visualGuide,
        originalStart: scene.startSeconds,
        originalDuration: scene.durationSeconds,
        previewStart: scene.startSeconds / 10,
        previewDuration: scene.durationSeconds / 10,
    }));
};

/** Clamps user/runtime input and never synthesizes new accidents or risks. */
export const selectEducationPreviewScene = (scenes: EducationPreviewScene[], elapsed: number): EducationPreviewScene | null => {
    if (!scenes.length) return null;
    const safe = Number.isFinite(elapsed) ? Math.min(EDUCATION_PREVIEW_SECONDS, Math.max(0, elapsed)) : 0;
    const originalSecond = Math.min(299.999, safe * 10);
    return scenes.find((scene) => originalSecond >= scene.originalStart && originalSecond < scene.originalStart + scene.originalDuration)
        || scenes[scenes.length - 1];
};

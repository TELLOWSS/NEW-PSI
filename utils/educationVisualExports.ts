import {
    getFiveMinuteVideoDuration,
    getHighGradeRiskShareItems,
    type TbmEducationDraft,
} from './tbmEducationStudio';

/**
 * Development-stage, local-only education export.
 * No external video model/renderer, subscription, CDN, or worker data transfer.
 */
const tidy = (value: unknown): string =>
    String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

const shorten = (value: unknown, limit = 84): string => {
    const characters = Array.from(tidy(value));
    return characters.length > limit ? `${characters.slice(0, limit - 1).join('')}…` : characters.join('');
};

const escapeSvg = (value: unknown): string =>
    tidy(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export interface EducationSceneManifest {
    schema: 'psi.education.video-scenes.v1';
    source: 'PSI 관리자 검토용 로컬 초안';
    month: string;
    workType: string;
    title: string;
    durationSeconds: 300;
    humanReviewRequired: true;
    externalUploadRequiresPrivacyReview: true;
    scenes: Array<{
        order: number;
        startSeconds: number;
        durationSeconds: number;
        title: string;
        narration: string;
        visualGuide: string;
    }>;
}

export const createEducationSceneManifest = (draft: TbmEducationDraft): EducationSceneManifest => {
    if (!draft.videoScenes.length || getFiveMinuteVideoDuration(draft) !== 300) {
        throw new Error('영상 장면의 합계가 정확히 5분(300초)일 때만 제작용 장면표를 저장할 수 있습니다.');
    }
    let position = 0;
    const scenes = draft.videoScenes.map((scene, index) => {
        if (!Number.isInteger(scene.seconds) || scene.seconds < 5
            || !tidy(scene.title) || !tidy(scene.narration) || !tidy(scene.visualGuide)) {
            throw new Error(`장면 ${index + 1}의 시간(5초 이상)·제목·내레이션·화면 지시를 확인해 주세요.`);
        }
        const output = {
            order: index + 1,
            startSeconds: position,
            durationSeconds: scene.seconds,
            title: tidy(scene.title),
            narration: tidy(scene.narration),
            visualGuide: tidy(scene.visualGuide),
        };
        position += scene.seconds;
        return output;
    });
    return {
        schema: 'psi.education.video-scenes.v1',
        source: 'PSI 관리자 검토용 로컬 초안',
        month: tidy(draft.month),
        workType: tidy(draft.workType),
        title: tidy(draft.title),
        durationSeconds: 300,
        humanReviewRequired: true,
        externalUploadRequiresPrivacyReview: true,
        scenes,
    };
};

/**
 * Standalone, offline SVG: no external CSS/images/fonts/scripts.
 * Risk items are taken only from explicit high-grade source markings.
 */
export const createEducationWorkflowSvg = (draft: TbmEducationDraft): string => {
    const highGrade = getHighGradeRiskShareItems(draft.risks);
    const riskLine = highGrade.length
        ? highGrade.slice(0, 2).map((risk) =>
            `${shorten(risk.risk, 22)} (${risk.managerConfirmed ? '확인' : '관리자 확인 필요'})`).join(' / ')
        : '상등급 근거 미확인 · 임의 위험 자동 추가 없음';
    const stages = [
        ['01', '5분 안전 영상', `${draft.videoScenes.length}개 장면 · ${getFiveMinuteVideoDuration(draft)}초 · 화면 지시 검토`],
        ['02', '최근 재해사례', draft.accidentCases.length
            ? shorten(draft.accidentCases[0].title, 62)
            : '사례 미선정 · 현장 기록 우선'],
        ['03', '상등급 위험 공유', riskLine],
        ['04', '현장 중점관리', draft.focusPoints.length
            ? shorten(draft.focusPoints[0], 67)
            : '현장 점검 후 구체적 관리내용 작성'],
        ['05', '공지 및 이해 확인', `${draft.notices.length}개 공지 · ${draft.confirmationQuestions.length}개 확인질문 · 행동 약속`],
    ] as const;
    const blocks = stages.map(([number, title, detail], i) => {
        const y = 172 + i * 122;
        const connector = i < stages.length - 1
            ? `<path d="M 80 ${y + 86} v 27" stroke="#94a3b8" stroke-width="3" stroke-dasharray="5 6"/>`
            : '';
        return `<g>
            <rect x="42" y="${y}" width="1016" height="91" rx="17" fill="#ffffff" stroke="#dbe5ef" stroke-width="2"/>
            <rect x="59" y="${y + 14}" width="64" height="63" rx="13" fill="#dbeafe"/>
            <text x="91" y="${y + 53}" font-size="24" fill="#1d4ed8" font-weight="800" text-anchor="middle">${number}</text>
            <text x="145" y="${y + 34}" font-size="22" font-weight="800" fill="#0f172a">${escapeSvg(title)}</text>
            <text x="145" y="${y + 64}" font-size="17" fill="#475569">${escapeSvg(shorten(detail, 72))}</text>
            ${connector}
        </g>`;
    }).join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 895" width="1100" height="895" role="img" aria-label="PSI 5단계 안전교육 흐름도">
        <rect width="1100" height="895" fill="#f1f5f9"/>
        <rect width="1100" height="126" fill="#10284d"/>
        <text x="43" y="49" font-family="sans-serif" fill="#93c5fd" font-size="17" font-weight="700">PSI · SAFETY EDUCATION WORKFLOW</text>
        <text x="43" y="93" font-family="sans-serif" fill="#ffffff" font-size="34" font-weight="900">위험성평가 5단계 교육 흐름</text>
        <text x="43" y="151" font-family="sans-serif" fill="#334155" font-size="18">${escapeSvg(shorten(draft.month, 16))} · ${escapeSvg(shorten(draft.workType, 26))} · 관리자 검토용</text>
        <g font-family="sans-serif">${blocks}</g>
        <text x="43" y="808" font-family="sans-serif" fill="#0f172a" font-size="17" font-weight="700">실제 교육 전 원문·위험등급·조치내용·다국어 번역을 관리자가 확인해야 합니다.</text>
        <text x="43" y="843" font-family="sans-serif" fill="#64748b" font-size="15">로컬 SVG · 외부 전송 없음 · 자동 교육승인 또는 위험성평가 법적 확정 아님</text>
    </svg>`;
};

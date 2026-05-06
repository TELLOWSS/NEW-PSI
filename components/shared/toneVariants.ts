import { BRAND_TONE } from '../../utils/brandToneTokens';
import { MOBILE_CARD_BASE_CLASS } from './cardTokens';

export type NoticeToneVariant = 'white' | 'slate' | 'amber' | 'indigo' | 'sky' | 'emerald' | 'rose' | 'glassDark';

export type EmptyStateToneVariant = 'slate' | 'white' | 'emerald';

export type SectionPanelToneVariant = 'slate' | 'whiteSoft' | 'amber' | 'emerald' | 'roseGradient' | 'indigo' | 'sky' | 'indigoSoft' | 'cyanSoft' | 'fuchsiaSoft' | 'skySoft' | 'roseDarkSoft' | 'emeraldDarkSoft' | 'glassDark' | 'indigoGradientSoft';

export type OperationalPreviewToneVariant = 'whiteElevated' | 'whiteCompact' | 'amberElevated' | 'interactiveSlate' | 'roseSoft' | 'slateSoft' | 'emeraldSoftCompact' | 'roseSoftCompact';

export const NOTICE_CALLOUT_TONE_STYLES: Record<NoticeToneVariant, {
    container: string;
    eyebrow: string;
    title: string;
    description: string;
    actionWrapper: string;
}> = {
    white: {
        container: `${BRAND_TONE.white} text-slate-700`,
        eyebrow: 'text-slate-500',
        title: 'text-slate-900',
        description: 'text-slate-600',
        actionWrapper: 'shrink-0',
    },
    slate: {
        container: `${BRAND_TONE.slate} text-slate-600`,
        eyebrow: 'text-slate-500',
        title: 'text-slate-700',
        description: 'text-slate-500',
        actionWrapper: 'shrink-0',
    },
    amber: {
        container: `${BRAND_TONE.amber} text-amber-800`,
        eyebrow: 'text-amber-700',
        title: 'text-amber-800',
        description: 'text-amber-700',
        actionWrapper: 'shrink-0',
    },
    indigo: {
        container: `${BRAND_TONE.indigo} text-indigo-800`,
        eyebrow: 'text-indigo-700',
        title: 'text-indigo-900',
        description: 'text-indigo-700',
        actionWrapper: 'shrink-0',
    },
    sky: {
        container: `${BRAND_TONE.sky} text-sky-800`,
        eyebrow: 'text-sky-700',
        title: 'text-sky-900',
        description: 'text-sky-700',
        actionWrapper: 'shrink-0',
    },
    emerald: {
        container: `${BRAND_TONE.emerald} text-emerald-800`,
        eyebrow: 'text-emerald-700',
        title: 'text-emerald-900',
        description: 'text-emerald-700',
        actionWrapper: 'shrink-0',
    },
    rose: {
        container: `${BRAND_TONE.rose} text-rose-700`,
        eyebrow: 'text-rose-700',
        title: 'text-rose-700',
        description: 'text-rose-600',
        actionWrapper: 'shrink-0',
    },
    glassDark: {
        container: `${BRAND_TONE.darkIndigo} text-white`,
        eyebrow: 'text-slate-300',
        title: 'text-white',
        description: 'text-slate-100',
        actionWrapper: 'shrink-0',
    },
};

export const EMPTY_STATE_TONE_STYLES: Record<EmptyStateToneVariant, {
    container: string;
    title: string;
    description: string;
}> = {
    slate: {
        container: `rounded-2xl border border-dashed ${BRAND_TONE.slate} text-center`,
        title: 'text-xs font-bold text-slate-500',
        description: 'mt-1 text-[11px] font-bold text-slate-400',
    },
    white: {
        container: `rounded-2xl border border-dashed border-slate-200 bg-white text-center`,
        title: 'text-xs font-bold text-slate-500',
        description: 'mt-1 text-[11px] font-bold text-slate-400',
    },
    emerald: {
        container: `rounded-2xl border border-dashed ${BRAND_TONE.emerald} bg-emerald-50/60 text-center`,
        title: 'text-[11px] font-bold text-emerald-700',
        description: 'mt-1 text-[11px] font-bold text-emerald-600',
    },
};

export const SECTION_PANEL_TONE_STYLES: Record<SectionPanelToneVariant, {
    container: string;
}> = {
    slate: {
        container: `${MOBILE_CARD_BASE_CLASS} ${BRAND_TONE.slate} px-4 py-4`,
    },
    whiteSoft: {
        container: `${MOBILE_CARD_BASE_CLASS} border-white bg-white/80 px-4 py-4`,
    },
    amber: {
        container: `${MOBILE_CARD_BASE_CLASS} border-amber-200 bg-amber-50/60 px-4 py-4`,
    },
    emerald: {
        container: `${MOBILE_CARD_BASE_CLASS} ${BRAND_TONE.emerald} bg-emerald-50/70 p-4`,
    },
    roseGradient: {
        container: `${MOBILE_CARD_BASE_CLASS} border-rose-200 bg-gradient-to-r from-rose-50 via-amber-50 to-white px-4 py-4`,
    },
    indigo: {
        container: `${MOBILE_CARD_BASE_CLASS} ${BRAND_TONE.indigo} px-4 py-4`,
    },
    sky: {
        container: `${MOBILE_CARD_BASE_CLASS} ${BRAND_TONE.sky} px-4 py-4`,
    },
    indigoSoft: {
        container: `${MOBILE_CARD_BASE_CLASS} border-indigo-100 bg-white/80 p-4`,
    },
    cyanSoft: {
        container: `${MOBILE_CARD_BASE_CLASS} border-cyan-100 bg-white/80 p-4`,
    },
    fuchsiaSoft: {
        container: `${MOBILE_CARD_BASE_CLASS} border-fuchsia-100 bg-white/80 p-4`,
    },
    skySoft: {
        container: `${MOBILE_CARD_BASE_CLASS} border-sky-100 bg-white/80 p-4`,
    },
    roseDarkSoft: {
        container: `${MOBILE_CARD_BASE_CLASS} ${BRAND_TONE.darkRose} p-4`,
    },
    emeraldDarkSoft: {
        container: `${MOBILE_CARD_BASE_CLASS} border-emerald-400/15 bg-black/10 p-4`,
    },
    glassDark: {
        container: `rounded-3xl ${BRAND_TONE.glassSoft} p-4 backdrop-blur-sm sm:p-5`,
    },
    indigoGradientSoft: {
        container: `rounded-[24px] ${BRAND_TONE.indigoSoft} bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-4 sm:p-5`,
    },
};

export const OPERATIONAL_PREVIEW_TONE_STYLES: Record<OperationalPreviewToneVariant, {
    container: string;
}> = {
    whiteElevated: {
        container: `${MOBILE_CARD_BASE_CLASS} ${BRAND_TONE.white} px-4 py-4`,
    },
    whiteCompact: {
        container: `${MOBILE_CARD_BASE_CLASS} border-slate-200 bg-white px-3 py-3`,
    },
    amberElevated: {
        container: `${MOBILE_CARD_BASE_CLASS} border-amber-200 bg-white px-4 py-4`,
    },
    interactiveSlate: {
        container: `${MOBILE_CARD_BASE_CLASS} ${BRAND_TONE.slate} px-4 py-4 transition-colors hover:border-indigo-300 hover:bg-indigo-50`,
    },
    roseSoft: {
        container: `${MOBILE_CARD_BASE_CLASS} border-rose-100 bg-rose-50/50 p-4`,
    },
    slateSoft: {
        container: `${MOBILE_CARD_BASE_CLASS} ${BRAND_TONE.slate} px-3 py-3`,
    },
    emeraldSoftCompact: {
        container: `${MOBILE_CARD_BASE_CLASS} ${BRAND_TONE.emerald} px-3 py-3`,
    },
    roseSoftCompact: {
        container: `${MOBILE_CARD_BASE_CLASS} ${BRAND_TONE.rose} px-3 py-3`,
    },
};
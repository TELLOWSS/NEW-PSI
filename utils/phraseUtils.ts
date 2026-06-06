import type { UiAudienceMode } from '../config/routeMeta';
import { phraseDictionary, type PhraseKey } from '../config/phraseDictionary';

export const getPhrase = (key: PhraseKey, uiMode: UiAudienceMode): string => {
    const entry = phraseDictionary[key];
    if (!entry) return '';

    const override = entry.overrides?.[uiMode];
    if (typeof override === 'string' && override.trim().length > 0) {
        return override;
    }

    return entry.base;
};

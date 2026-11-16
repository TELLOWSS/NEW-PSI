import { describe, expect, it } from 'vitest';
import { resolveNexusFeatureFlags } from '../config/nexusFeatureFlags';

describe('Nexus presentation rollback', () => {
    it('preserves the optional released view when configuration is absent', () => {
        expect(resolveNexusFeatureFlags({})).toEqual({uiEnabled:true, threeDEnabled:true});
    });
    it('can disable rendering without removing the 2D evidence view', () => {
        expect(resolveNexusFeatureFlags({VITE_PSI_NEXUS_3D_ENABLED:'false'}))
            .toEqual({uiEnabled:true, threeDEnabled:false});
    });
    it('disabling the UI also disables its renderer', () => {
        expect(resolveNexusFeatureFlags({VITE_PSI_NEXUS_UI_ENABLED:'false', VITE_PSI_NEXUS_3D_ENABLED:'true'}))
            .toEqual({uiEnabled:false, threeDEnabled:false});
    });
    it.each(['TRUE', '1', '', ' false ', false, null])('does not enable malformed configured value %s', value => {
        expect(resolveNexusFeatureFlags({VITE_PSI_NEXUS_UI_ENABLED:value}).uiEnabled).toBe(false);
        expect(resolveNexusFeatureFlags({VITE_PSI_NEXUS_3D_ENABLED:value}).threeDEnabled).toBe(false);
    });
    it('has no connection to server data authorization', () => {
        expect(resolveNexusFeatureFlags({PSI_NEXUS_SITE_READ_ENABLED:'true', VITE_PSI_NEXUS_UI_ENABLED:'false'}))
            .toEqual({uiEnabled:false, threeDEnabled:false});
    });
});

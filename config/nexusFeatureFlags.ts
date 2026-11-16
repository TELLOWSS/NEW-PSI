/** Presentation rollback switches. These never authorize server data access. */
export interface NexusFeatureFlags {
    uiEnabled: boolean;
    threeDEnabled: boolean;
}

export const resolveNexusFeatureFlags = (environment: Record<string, unknown>): NexusFeatureFlags => {
    // Preserve the already released optional view when no switch is configured.
    // Reject malformed explicit values rather than silently enabling a feature.
    const enabled = (key: string) => environment[key] === undefined || environment[key] === 'true';
    const uiEnabled = enabled('VITE_PSI_NEXUS_UI_ENABLED');
    return {
        uiEnabled,
        threeDEnabled: uiEnabled && enabled('VITE_PSI_NEXUS_3D_ENABLED'),
    };
};

export const nexusFeatureFlags = resolveNexusFeatureFlags(import.meta.env);

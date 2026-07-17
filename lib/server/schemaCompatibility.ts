export const SCHEMA_COMPATIBILITY_SUNSET = '2026-10-30';

export const markSchemaCompatibilityFallback = (
    res: any,
    details: { area: string; reason: string },
): void => {
    res.setHeader('X-PSI-Schema-Compatibility', 'fallback');
    res.setHeader('X-PSI-Schema-Sunset', SCHEMA_COMPATIBILITY_SUNSET);
    console.warn('[psi-schema-compat]', JSON.stringify({
        ...details,
        sunset: SCHEMA_COMPATIBILITY_SUNSET,
        observedAt: new Date().toISOString(),
    }));
};

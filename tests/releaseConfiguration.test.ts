import { describe, expect, it } from 'vitest';
import { releaseConfigurationErrors } from '../scripts/check-release-config.mjs';

describe('commercial deployment configuration', () => {
    it('rejects shared SaaS while legacy data paths remain unscoped', () => {
        expect(releaseConfigurationErrors({ PSI_DEPLOYMENT_MODEL: 'shared-saas' })).toHaveLength(1);
    });
    it('requires private credentials in production without exposing their values', () => {
        const errors = releaseConfigurationErrors({ VERCEL_ENV: 'production', VITE_PSI_ADMIN_SECRET: 'never-print-this-value' });
        expect(errors).toHaveLength(3);
        expect(errors.join(' ')).not.toContain('never-print-this-value');
    });
    it('accepts configured single-site production and local verification', () => {
        expect(releaseConfigurationErrors({})).toEqual([]);
        expect(releaseConfigurationErrors({ VERCEL_ENV: 'production', ADMIN_SESSION_SECRET: 'x'.repeat(32), ADMIN_LOGIN_PASSWORD: 'private' })).toEqual([]);
    });
    it('rejects misspelled deployment modes and production bypass', () => {
        expect(releaseConfigurationErrors({ PSI_DEPLOYMENT_MODEL: 'shared_saas' })).toHaveLength(1);
        expect(releaseConfigurationErrors({ VERCEL_ENV: 'production', ADMIN_SESSION_SECRET: 'x'.repeat(32), ADMIN_LOGIN_PASSWORD: 'private', VITE_ALLOW_ADMIN_BYPASS: 'true' })).toHaveLength(1);
    });
});

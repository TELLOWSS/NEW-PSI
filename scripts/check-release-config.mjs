import { pathToFileURL } from 'node:url';

export function releaseConfigurationErrors(env) {
    const errors = [];
    const mode = env.PSI_DEPLOYMENT_MODEL || 'single-site';
    if (!['single-site', 'shared-saas'].includes(mode)) errors.push('Unknown PSI_DEPLOYMENT_MODEL.');
    // This is deliberately a code gate, not an environment-variable attestation.
    // Legacy APIs, public worker links and browser caches are not tenant-scoped yet.
    if (mode === 'shared-saas') errors.push('Shared SaaS release blocked: legacy data paths must be migrated and isolation-tested first. See docs/SAAS_MIGRATION.md.');
    if (env.VERCEL_ENV === 'production') {
        if ((env.TRAINING_LINK_SECRET || '').trim().length < 32) errors.push('TRAINING_LINK_SECRET must contain at least 32 characters.');
        if ((env.ADMIN_SESSION_SECRET || '').trim().length < 32) errors.push('ADMIN_SESSION_SECRET must contain at least 32 characters.');
        if (!(env.ADMIN_LOGIN_PASSWORD || env.PSI_ADMIN_PASSWORD || '').trim()) errors.push('A private administrator login password is required.');
        if (env.VITE_PSI_ADMIN_SECRET) errors.push('Remove VITE_PSI_ADMIN_SECRET and rotate the exposed credential.');
        if (env.VITE_ALLOW_ADMIN_BYPASS === 'true') errors.push('Remove the production administrator bypass flag.');
    }
    return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const errors = releaseConfigurationErrors(process.env);
    if (errors.length) {
        console.error(errors.join('\n'));
        process.exitCode = 1;
    } else console.log('Release configuration checks passed.');
}

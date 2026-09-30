import { authenticateTenantUser, requireTenantContext, sendTenantError, TenantAccessError } from '../../lib/server/tenantAuth.js';
import tenantTrainingDrafts from '../../lib/server/tenantTrainingDrafts.js';
import tenantSafetyActions from '../../lib/server/tenantSafetyActions.js';

export default async function handler(req: any, res: any) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization, X-PSI-Tenant-ID');
    if (req.query?.resource === 'training-drafts') return tenantTrainingDrafts(req, res);
    if (req.query?.resource === 'actions') return tenantSafetyActions(req, res);
    if (req.query?.resource !== undefined) {
        return res.status(404).json({ ok: false, code: 'SAAS_RESOURCE_NOT_FOUND' });
    }
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' });
    }
    try {
        if (req.headers?.['x-psi-tenant-id']) {
            const { userId, tenantId, role } = await requireTenantContext(req);
            return res.status(200).json({ ok: true, userId, tenantId, role });
        }
        const { client, userId } = await authenticateTenantUser(req);
        const { data, error } = await client.from('psi_tenant_memberships')
            .select('tenant_id,role,psi_tenants(name)').eq('user_id', userId).eq('status', 'active')
            .order('tenant_id').limit(100);
        if (error) throw new TenantAccessError(503, 'MEMBERSHIP_UNAVAILABLE', '기업 소속을 확인할 수 없습니다.');
        return res.status(200).json({ ok: true, userId, memberships: data || [] });
    } catch (error) { return sendTenantError(res, error); }
}

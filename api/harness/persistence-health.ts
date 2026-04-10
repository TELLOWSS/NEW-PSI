import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';
import { fetchHarnessPersistenceHealth } from '../../lib/server/harness/persistence.js';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

    const health = await fetchHarnessPersistenceHealth();
    return res.status(200).json({ ok: true, data: health });
}
import auth from '../lib/server/admin/auth.js';
import archiveManifest from '../lib/server/admin/archive-manifest.js';
import predictivePlan from '../lib/server/admin/predictive-plan-status.js';
import recordMaster from '../lib/server/admin/record-master.js';
import safetyCases from '../lib/server/admin/safety-cases.js';
import safetyManagement from '../lib/server/admin/safety-management.js';
import reportMessage from '../lib/server/admin/send-report-message.js';
import surveyRiskBaselines from '../lib/server/admin/survey-risk-baselines.js';
import training from '../lib/server/admin/training.js';

const handlers = new Map<string, (req: any, res: any) => Promise<any>>([
    ['auth', auth],
    ['archive-manifest', archiveManifest],
    ['predictive-plan-status', predictivePlan],
    ['record-master', recordMaster],
    ['safety-cases', safetyCases],
    ['safety-management', safetyManagement],
    ['send-report-message', reportMessage],
    ['survey-risk-baselines', surveyRiskBaselines],
    ['training', training],
    ['update-training-targets', training],
]);

export default async function handler(req: any, res: any) {
    res.setHeader('Cache-Control', 'no-store');
    // Keep routing separate from each handler's existing body/query action contract.
    const endpoint = req.query?.endpoint;
    if (typeof endpoint !== 'string' || !handlers.has(endpoint)) {
        return res.status(404).json({ ok: false, code: 'ADMIN_ENDPOINT_NOT_FOUND', message: '요청한 기능을 찾을 수 없습니다.' });
    }
    if (endpoint === 'update-training-targets') {
        req.query = { ...req.query, legacyAction: 'update-targets' };
        res.setHeader('Deprecation', 'true');
        res.setHeader('Link', '</api/admin/training>; rel="successor-version"');
    }
    return handlers.get(endpoint)!(req, res);
}

import trainingHandler from './training.js';

export default async function handler(req: any, res: any) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', 'Fri, 30 Oct 2026 00:00:00 GMT');
    res.setHeader('Link', '</api/admin/training>; rel="successor-version"');
    req.body = {
        ...(req.body || {}),
        action: 'update-targets',
    };
    return trainingHandler(req, res);
}

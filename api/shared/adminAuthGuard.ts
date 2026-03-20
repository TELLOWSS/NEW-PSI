const resolveExpectedAdminAuthToken = () => {
    return (
        process.env.ADMIN_API_AUTH_TOKEN ||
        process.env.NEXT_PUBLIC_ADMIN_PASSWORD ||
        'psi1234'
    ).trim();
};

export const isValidAdminAuthRequest = (req: any): boolean => {
    const headerToken = String(req?.headers?.['x-admin-auth'] || '').trim();
    const expectedToken = resolveExpectedAdminAuthToken();

    if (!headerToken || !expectedToken) {
        return false;
    }

    return headerToken === expectedToken;
};

export const sendUnauthorizedAdminResponse = (res: any) => {
    return res.status(401).json({
        ok: false,
        error: 'Unauthorized',
        message: 'Unauthorized',
    });
};

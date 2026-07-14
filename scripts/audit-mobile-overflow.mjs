import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = process.cwd();
const host = process.env.PSI_MOBILE_OVERFLOW_HOST || '127.0.0.1';
const port = Number(process.env.PSI_MOBILE_OVERFLOW_PORT || 4193);
const baseUrl = `http://${host}:${port}`;
const runId = process.env.PSI_MOBILE_OVERFLOW_RUN_ID || new Date().toISOString().slice(0, 10);
const outputDir = path.join(root, 'artifacts', 'mobile-overflow', runId);
const viewportHeight = Number(process.env.PSI_MOBILE_OVERFLOW_HEIGHT || 844);
const viewports = (process.env.PSI_MOBILE_OVERFLOW_WIDTHS || '320,360,375,390,430')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

const pages = [
    'dashboard',
    'education-return',
    'ocr-analysis',
    'a4-education-material',
    'monthly-guidance-report',
    'reports',
    'worker-management',
    'predictive-analysis',
    'performance-analysis',
    'survey-intelligence',
    'safety-checks',
    'site-issue-management',
    'settings',
    'introduction',
    'admin-training',
    'worker-training',
    'field-context-input',
    'intervention-coaching',
    'judgment-tagging-input',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestUrl = (url) => new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode || 0);
    });
    req.on('error', reject);
    req.setTimeout(2500, () => req.destroy(new Error('timeout')));
});

const isServerAvailable = async (url) => {
    try {
        const status = await requestUrl(url);
        return status >= 200 && status < 500;
    } catch {
        return false;
    }
};

const waitForServer = async (url, timeoutMs = 60000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (await isServerAvailable(url)) return;
        await sleep(500);
    }
    throw new Error(`dev server did not become ready: ${url}`);
};

const startDevServer = () => {
    const args = ['run', 'dev', '--', '--host', host, '--port', String(port), '--strictPort'];
    const child = process.platform === 'win32'
        ? spawn('cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], {
            cwd: root,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        })
        : spawn('npm', args, {
            cwd: root,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    child.stdout.on('data', (chunk) => process.stdout.write(`[dev] ${chunk}`));
    child.stderr.on('data', (chunk) => process.stderr.write(`[dev] ${chunk}`));
    return child;
};

const stopProcess = async (child) => {
    if (!child || child.killed) return;
    if (process.platform === 'win32' && child.pid) {
        await new Promise((resolve) => {
            const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
                stdio: 'ignore',
                windowsHide: true,
            });
            killer.once('exit', resolve);
            killer.once('error', resolve);
        });
        return;
    }
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(2500)]);
    if (!child.killed) child.kill('SIGKILL');
};

const cssPath = (element) => {
    if (!(element instanceof Element)) return '';
    const segments = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && segments.length < 5) {
        const tag = current.tagName.toLowerCase();
        const id = current.id ? `#${current.id}` : '';
        const className = String(current.className || '')
            .split(/\s+/u)
            .filter(Boolean)
            .slice(0, 3)
            .map((name) => `.${CSS.escape(name)}`)
            .join('');
        segments.unshift(`${tag}${id}${className}`);
        current = current.parentElement;
    }
    return segments.join(' > ');
};

const auditPageInBrowser = async (page, pageId, width) => {
    await page.evaluate(async (targetPage) => {
        window.sessionStorage.setItem('isAdminAuthenticated', 'true');
        window.localStorage.setItem('psi_admin_bypass_ui', 'true');
        window.localStorage.setItem('psi_operational_mode_v1', 'immediate');
        window.localStorage.setItem('psi_user_role_preset_v1', 'manager');
        window.dispatchEvent(new CustomEvent('psi:operationalModeChanged'));
        window.dispatchEvent(new CustomEvent('psi:userRolePresetChanged'));
        if (typeof window.__setCurrentPage === 'function') {
            window.__setCurrentPage(targetPage);
        }
    }, pageId);
    await page.waitForTimeout(900);

    const result = await page.evaluate(({ pageId: currentPageId, width: viewportWidth }) => {
        const allowedScrollableSelector = [
            '[data-mobile-overflow-allow="true"]',
            '[data-report-page]',
            '[data-report-template-root]',
            '.overflow-x-auto',
            '.overflow-auto',
            '.no-scrollbar',
            'canvas',
            'svg',
        ].join(',');

        const isElementVisible = (element) => {
            if (!(element instanceof Element)) return false;
            const rect = element.getBoundingClientRect();
            if (rect.width <= 1 || rect.height <= 1) return false;
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
            if (element.closest('[aria-hidden="true"], [hidden]')) return false;
            return true;
        };

        const isInsideAllowedHorizontalScroll = (element) => {
            if (!(element instanceof Element)) return false;
            if (element.closest(allowedScrollableSelector)) return true;
            let current = element.parentElement;
            while (current) {
                const style = window.getComputedStyle(current);
                const overflowX = style.overflowX;
                const className = String(current.className || '');
                if (
                    (overflowX === 'auto' || overflowX === 'scroll') &&
                    current.scrollWidth > current.clientWidth + 3
                ) {
                    return true;
                }
                if (className.includes('overflow-x-auto') || className.includes('overflow-auto')) return true;
                current = current.parentElement;
            }
            return false;
        };

        const hasDirectReadableText = (element) => Array.from(element.childNodes).some((node) => (
            node.nodeType === Node.TEXT_NODE && String(node.textContent || '').replace(/\s+/gu, '').length >= 2
        ));

        const isTextElement = (element) => element.matches('p,h1,h2,h3,h4,h5,h6,span,b,strong,small,button,a,label,li,td,th,dd,dt');

        const getSnippet = (element) => String(element.textContent || '')
            .replace(/\s+/gu, ' ')
            .trim()
            .slice(0, 90);

        const makeRow = (element, rect, extra = {}) => ({
            selector: window.__mobileOverflowCssPath?.(element) || element.tagName.toLowerCase(),
            tag: element.tagName.toLowerCase(),
            className: String(element.className || '').slice(0, 180),
            text: getSnippet(element),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            top: Math.round(rect.top),
            overflowPx: Math.max(0, Math.round(rect.right - viewportWidth), Math.round(0 - rect.left)),
            ...extra,
        });

        window.__mobileOverflowCssPath = window.__mobileOverflowCssPath || ((element) => {
            const segments = [];
            let current = element;
            while (current && current.nodeType === Node.ELEMENT_NODE && segments.length < 5) {
                const tag = current.tagName.toLowerCase();
                const id = current.id ? `#${current.id}` : '';
                const className = String(current.className || '')
                    .split(/\s+/u)
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((name) => `.${name.replace(/[^a-zA-Z0-9_-]/gu, '_')}`)
                    .join('');
                segments.unshift(`${tag}${id}${className}`);
                current = current.parentElement;
            }
            return segments.join(' > ');
        });

        const elements = Array.from(document.querySelectorAll('body *')).filter(isElementVisible);
        const horizontalOffenders = elements
            .map((element) => ({ element, rect: element.getBoundingClientRect() }))
            .filter(({ element, rect }) => (
                (rect.left < -3 || rect.right > viewportWidth + 3) &&
                !isInsideAllowedHorizontalScroll(element) &&
                !(getSnippet(element).length === 0 && window.getComputedStyle(element).position === 'absolute')
            ))
            .map(({ element, rect }) => makeRow(element, rect))
            .sort((left, right) => right.overflowPx - left.overflowPx)
            .slice(0, 25);

        const clippedText = elements
            .filter((element) => {
                const text = getSnippet(element);
                if (text.length < 8) return false;
                if (!hasDirectReadableText(element) && !isTextElement(element)) return false;
                if (element.matches('input, textarea, select, option, canvas, svg, path')) return false;
                if (element.closest('[data-report-page], [data-report-template-root]')) return false;
                const style = window.getComputedStyle(element);
                const hasHiddenOverflow = ['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflowY);
                if (!hasHiddenOverflow) return false;
                const clippedX = element.scrollWidth > element.clientWidth + 4;
                const clippedY = element.scrollHeight > element.clientHeight + 4;
                return clippedX || clippedY;
            })
            .map((element) => {
                const rect = element.getBoundingClientRect();
                return makeRow(element, rect, {
                    clientWidth: element.clientWidth,
                    scrollWidth: element.scrollWidth,
                    clientHeight: element.clientHeight,
                    scrollHeight: element.scrollHeight,
                });
            })
            .slice(0, 25);

        const documentElement = document.documentElement;
        const scrollingElement = document.scrollingElement || documentElement;
        return {
            pageId: currentPageId,
            viewportWidth,
            viewportHeight: window.innerHeight,
            documentScrollWidth: scrollingElement.scrollWidth,
            bodyScrollWidth: document.body.scrollWidth,
            hasPageHorizontalOverflow: scrollingElement.scrollWidth > viewportWidth + 3 || document.body.scrollWidth > viewportWidth + 3,
            horizontalOffenders,
            clippedText,
        };
    }, { pageId, width });

    return result;
};

const writeMarkdown = async (summary, rows) => {
    const lines = [
        '# 모바일 넘침/잘림 자동 감사',
        '',
        `- 생성시각: ${summary.generatedAt}`,
        `- 기준 URL: ${summary.baseUrl}`,
        `- 검사 폭: ${summary.viewports.join(', ')}px`,
        `- 검사 화면: ${summary.pages.length}`,
        `- 좌우 넘침 감지: ${summary.horizontalOverflowCount}`,
        `- 요소 넘침 후보: ${summary.offenderCount}`,
        `- 글자 잘림 후보: ${summary.clippedTextCount}`,
        '',
        '## 화면별 요약',
        '',
        '| 폭 | 화면 | 페이지 좌우넘침 | 요소 후보 | 글자 잘림 후보 |',
        '|---:|---|---:|---:|---:|',
        ...rows.map((row) => `| ${row.viewportWidth} | ${row.pageId} | ${row.hasPageHorizontalOverflow ? 'YES' : 'NO'} | ${row.horizontalOffenders.length} | ${row.clippedText.length} |`),
        '',
        '## 우선 확인 대상',
        '',
    ];

    const flaggedRows = rows.filter((row) => row.hasPageHorizontalOverflow || row.horizontalOffenders.length > 0 || row.clippedText.length > 0);
    if (flaggedRows.length === 0) {
        lines.push('- 감지된 넘침/잘림 후보가 없습니다.');
    } else {
        for (const row of flaggedRows.slice(0, 80)) {
            lines.push(`### ${row.viewportWidth}px · ${row.pageId}`);
            lines.push(`- 페이지 폭: document=${row.documentScrollWidth}px, body=${row.bodyScrollWidth}px`);
            for (const item of row.horizontalOffenders.slice(0, 5)) {
                lines.push(`- 좌우 넘침 ${item.overflowPx}px · ${item.selector} · "${item.text}"`);
            }
            for (const item of row.clippedText.slice(0, 5)) {
                lines.push(`- 글자 잘림 후보 · ${item.selector} · ${item.clientWidth}→${item.scrollWidth}px / ${item.clientHeight}→${item.scrollHeight}px · "${item.text}"`);
            }
            if (row.screenshot) lines.push(`- 스크린샷: ${row.screenshot}`);
            lines.push('');
        }
    }

    await writeFile(path.join(outputDir, 'mobile-overflow-audit.md'), `${lines.join('\n')}\n`, 'utf8');
};

const main = async () => {
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });
    const hadServer = await isServerAvailable(baseUrl);
    const server = hadServer ? null : startDevServer();
    let browser;
    try {
        await waitForServer(baseUrl);
        browser = await chromium.launch({ headless: true });
        const rows = [];

        for (const width of viewports) {
            const context = await browser.newContext({
                viewport: { width, height: viewportHeight },
                deviceScaleFactor: 2,
                isMobile: true,
                hasTouch: true,
            });
            const page = await context.newPage();
            await page.route('**/api/admin/auth', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, authenticated: true }),
                });
            });
            await page.addInitScript(() => {
                window.sessionStorage.setItem('isAdminAuthenticated', 'true');
                window.localStorage.setItem('psi_admin_bypass_ui', 'true');
                window.localStorage.setItem('psi_operational_mode_v1', 'immediate');
                window.localStorage.setItem('psi_user_role_preset_v1', 'manager');
            });
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForFunction(() => typeof window.__setCurrentPage === 'function', null, { timeout: 30000 });

            for (const pageId of pages) {
                const result = await auditPageInBrowser(page, pageId, width);
                if (result.hasPageHorizontalOverflow || result.horizontalOffenders.length > 0 || result.clippedText.length > 0) {
                    const screenshotName = `${width}-${pageId}.png`;
                    await page.screenshot({
                        path: path.join(outputDir, screenshotName),
                        fullPage: false,
                    });
                    result.screenshot = screenshotName;
                }
                rows.push(result);
                console.log(`[mobile-overflow] ${width}px ${pageId}: page=${result.hasPageHorizontalOverflow ? 'OVERFLOW' : 'ok'}, offenders=${result.horizontalOffenders.length}, clipped=${result.clippedText.length}`);
            }
            await context.close();
        }

        const summary = {
            generatedAt: new Date().toISOString(),
            baseUrl,
            viewports,
            pages,
            horizontalOverflowCount: rows.filter((row) => row.hasPageHorizontalOverflow).length,
            offenderCount: rows.reduce((sum, row) => sum + row.horizontalOffenders.length, 0),
            clippedTextCount: rows.reduce((sum, row) => sum + row.clippedText.length, 0),
        };

        await writeFile(path.join(outputDir, 'mobile-overflow-audit.json'), `${JSON.stringify({ ...summary, rows }, null, 2)}\n`, 'utf8');
        await writeMarkdown(summary, rows);
        console.log(`[mobile-overflow] output=${outputDir}`);
        if (summary.horizontalOverflowCount > 0 || summary.offenderCount > 0) {
            process.exitCode = 1;
        }
    } finally {
        if (browser) await browser.close();
        await stopProcess(server);
    }
};

main().catch((error) => {
    console.error('[mobile-overflow] failed:', error?.stack || error?.message || error);
    process.exitCode = 1;
});

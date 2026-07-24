import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('styles.css', 'utf8');
const darkTheme = css.match(/html\.dark\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';

const readHexToken = (name: string): string => {
    const match = darkTheme.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
    if (!match) throw new Error(`Missing dark theme token: ${name}`);
    return match[1];
};

const luminance = (hex: string): number => {
    const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const linear = channels.map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrast = (foreground: string, background: string): number => {
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
};

describe('dark mode contrast tokens', () => {
    it.each([
        ['primary text', '--psi-text', '--psi-surface'],
        ['muted text', '--psi-text-muted', '--psi-surface'],
        ['subtle text', '--psi-text-subtle', '--psi-surface'],
        ['disabled control text', '--psi-disabled-text', '--psi-disabled-bg'],
        ['chart axis text', '--psi-chart-axis', '--psi-canvas'],
    ])('%s stays at WCAG AA body-text contrast', (_label, foregroundToken, backgroundToken) => {
        const ratio = contrast(readHexToken(foregroundToken), readHexToken(backgroundToken));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
});

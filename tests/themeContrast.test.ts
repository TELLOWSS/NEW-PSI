import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Rgb = [number, number, number];

const styles = fs.readFileSync(path.resolve(process.cwd(), 'styles.css'), 'utf8');

const readThemeBlock = (selector: ':root' | 'html.dark'): Record<string, string> => {
    const escapedSelector = selector.replace('.', '\\.');
    const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
    if (!match) throw new Error(`Missing theme block: ${selector}`);

    return Object.fromEntries(
        [...match[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((entry) => [entry[1], entry[2]]),
    );
};

const hexToRgb = (hex: string): Rgb => {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const luminance = ([red, green, blue]: Rgb): number => {
    const channels = [red, green, blue].map((value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastRatio = (foreground: string, background: string): number => {
    const foregroundLuminance = luminance(hexToRgb(foreground));
    const backgroundLuminance = luminance(hexToRgb(background));
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
};

describe('theme contrast tokens', () => {
    const themes = [
        ['light', readThemeBlock(':root')],
        ['dark', readThemeBlock('html.dark')],
    ] as const;

    it.each(themes)('%s theme keeps body and supporting copy readable', (_name, tokens) => {
        expect(contrastRatio(tokens['psi-text'], tokens['psi-surface'])).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(tokens['psi-text-muted'], tokens['psi-surface'])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tokens['psi-text-subtle'], tokens['psi-surface'])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tokens['psi-text-muted'], tokens['psi-surface-muted'])).toBeGreaterThanOrEqual(4.5);
    });
});

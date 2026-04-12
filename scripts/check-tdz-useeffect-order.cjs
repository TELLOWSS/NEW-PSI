const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET_EXT = /\.(ts|tsx)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', '.git']);

function walk(dirPath, output = []) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        if (SKIP_DIR.has(entry.name)) continue;

        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, output);
            continue;
        }

        if (TARGET_EXT.test(entry.name)) {
            output.push(fullPath);
        }
    }

    return output;
}

function collectConstDeclarationLines(lines) {
    const declarationLineMap = new Map();

    lines.forEach((line, index) => {
        const matched = line.match(/^\s*const\s+([A-Za-z_$][\w$]*)\s*=/);
        if (!matched) return;

        const symbol = matched[1];
        if (!declarationLineMap.has(symbol)) {
            declarationLineMap.set(symbol, index + 1);
        }
    });

    return declarationLineMap;
}

function normalizeDependencyToken(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';

    return trimmed
        .replace(/\?\./g, '.')
        .replace(/\.[A-Za-z_$][\w$]*/g, '')
        .replace(/\s+/g, '');
}

function scanFile(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    const declarationLineMap = collectConstDeclarationLines(lines);
    const issues = [];

    for (let effectStart = 0; effectStart < lines.length; effectStart += 1) {
        if (!lines[effectStart].includes('useEffect(')) continue;

        for (let cursor = effectStart; cursor < Math.min(lines.length, effectStart + 100); cursor += 1) {
            const depMatch = lines[cursor].match(/\},\s*\[([^\]]*)\]\s*\)\s*;?/);
            if (!depMatch) continue;

            const deps = depMatch[1]
                .split(',')
                .map(normalizeDependencyToken)
                .filter((token) => /^[A-Za-z_$][\w$]*$/.test(token));

            for (const dep of deps) {
                if (!declarationLineMap.has(dep)) continue;

                const declarationLine = declarationLineMap.get(dep);
                if (declarationLine > effectStart + 1) {
                    issues.push({
                        effectLine: effectStart + 1,
                        dependency: dep,
                        declarationLine,
                    });
                }
            }

            break;
        }
    }

    return issues;
}

function main() {
    const files = walk(ROOT);
    const findings = [];

    for (const file of files) {
        const issues = scanFile(file);
        if (issues.length > 0) {
            findings.push({
                file: path.relative(ROOT, file).replace(/\\/g, '/'),
                issues,
            });
        }
    }

    if (findings.length === 0) {
        console.log('[check-tdz] OK: no useEffect TDZ dependency ordering issues found.');
        process.exit(0);
    }

    console.error('[check-tdz] FAIL: detected useEffect dependencies declared after effect definition.');
    for (const finding of findings) {
        console.error(`- ${finding.file}`);
        for (const issue of finding.issues) {
            console.error(
                `  effect@L${issue.effectLine} depends on '${issue.dependency}' declared@L${issue.declarationLine}`,
            );
        }
    }

    process.exit(1);
}

main();

import fs from 'fs';
import path from 'path';

const searchDirs = [
    'components',
    'pages'
];

const patterns = [
    /text-slate-(950|900|800|700|600|500)/,
    /bg-(white|slate-50|slate-100)/,
    /border-slate-(100|200|300)/
];

const results = [];

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
        // Skip comment lines
        if (line.trim().startsWith('*') || line.trim().startsWith('//')) return;

        patterns.forEach(pattern => {
            if (pattern.test(line)) {
                // If it contains the pattern but does NOT have a corresponding dark: class for it, and does NOT use CSS variables
                const matches = line.match(pattern);
                if (matches) {
                    const matchStr = matches[0];
                    // Basic heuristic: check if dark:matchStr or dark:bg-... or dark:text-... is present in the line
                    const prefix = matchStr.split('-')[0]; // 'text' or 'bg' or 'border'
                    const hasDarkCounterpart = line.includes('dark:') || line.includes('var(--psi-') || line.includes('className="psi-') || line.includes('className={`psi-');
                    
                    // Specific exclusions for well-handled elements
                    if (!hasDarkCounterpart) {
                        results.push({
                            file: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
                            line: index + 1,
                            code: line.trim(),
                            issue: `Hardcoded ${matchStr} without theme variables or dark mode counterpart`
                        });
                    }
                }
            }
        });
    });
}

function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walkDir(fullPath);
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            scanFile(fullPath);
        }
    });
}

console.log("Starting theme readability audit...");
searchDirs.forEach(dir => walkDir(path.join(process.cwd(), dir)));

console.log(`\nScan complete. Found ${results.length} potential anomalies:\n`);
results.slice(0, 150).forEach(res => {
    console.log(`[${res.file}:${res.line}] ${res.code}\n   -> ${res.issue}`);
});

if (results.length > 150) {
    console.log(`... and ${results.length - 150} more issues.`);
}

// Group by file
const grouped = results.reduce((acc, curr) => {
    acc[curr.file] = acc[curr.file] || [];
    acc[curr.file].push(curr);
    return acc;
}, {});

console.log("\nSummary by File:");
Object.entries(grouped).forEach(([file, items]) => {
    console.log(`- ${file}: ${items.length} issues`);
});

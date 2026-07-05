const fs = require('fs');
const path = require('path');

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const sourceExtensions = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
const runtimeImportExtensions = new Set(['.js', '.json', '.node']);
const missing = [];
const visited = new Set();

const toRel = (filePath) => path.relative(root, filePath).replace(/\\/g, '/');

const walk = (dirPath) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    return [entryPath];
  });
};

const apiEntryFiles = walk(path.join(root, 'api')).filter((filePath) => (
  filePath.endsWith('.ts')
  && !filePath.endsWith('.d.ts')
  && !filePath.includes(`${path.sep}__tests__${path.sep}`)
  && !filePath.endsWith('.test.ts')
));

const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const isTypeOnlyNamedImport = (clause) => {
  const trimmed = clause.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;
  return trimmed
    .slice(1, -1)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) => part.startsWith('type '));
};

const readRuntimeImports = (source) => {
  const body = stripComments(source);
  const imports = [];
  const fromImportRe = /(?:^|\n)\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  const sideEffectImportRe = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
  const exportFromRe = /(?:^|\n)\s*export\s+(type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;

  for (const match of body.matchAll(fromImportRe)) {
    const [, typeKeyword, clause, specifier] = match;
    if (typeKeyword || isTypeOnlyNamedImport(clause)) continue;
    imports.push(specifier);
  }

  for (const match of body.matchAll(sideEffectImportRe)) {
    imports.push(match[1]);
  }

  for (const match of body.matchAll(exportFromRe)) {
    const [, typeKeyword, specifier] = match;
    if (typeKeyword) continue;
    imports.push(specifier);
  }

  return imports;
};

const resolveSourceFile = (fromFile, specifier) => {
  if (!specifier.startsWith('.')) return null;

  const fromDir = path.dirname(fromFile);
  const specifierExt = path.posix.extname(specifier);
  const basePath = path.resolve(fromDir, specifier);
  const candidates = [];

  if (specifierExt === '.js') {
    const withoutJs = basePath.slice(0, -3);
    candidates.push(...sourceExtensions.map((ext) => `${withoutJs}${ext}`));
  } else if (specifierExt) {
    candidates.push(basePath);
  } else {
    candidates.push(...sourceExtensions.map((ext) => `${basePath}${ext}`));
    candidates.push(...sourceExtensions.map((ext) => path.join(basePath, `index${ext}`)));
  }

  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
};

const checkFile = (filePath) => {
  const normalizedPath = path.resolve(filePath);
  if (visited.has(normalizedPath)) return;
  visited.add(normalizedPath);

  const source = fs.readFileSync(normalizedPath, 'utf8');
  for (const specifier of readRuntimeImports(source)) {
    if (!specifier.startsWith('.')) continue;

    const ext = path.posix.extname(specifier);
    if (!runtimeImportExtensions.has(ext)) {
      missing.push(`${toRel(normalizedPath)} imports "${specifier}" without a runtime extension`);
    }

    const resolved = resolveSourceFile(normalizedPath, specifier);
    if (resolved) checkFile(resolved);
  }
};

apiEntryFiles.forEach(checkFile);

const scriptValue = packageJson.scripts?.['check:server-esm-imports'];
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!scriptValue || !scriptValue.includes('check-server-esm-imports.cjs')) {
  missing.push('package.json script check:server-esm-imports');
}

if (!verifyFast.includes('check:server-esm-imports')) {
  missing.push('verify:fast includes check:server-esm-imports');
}

if (missing.length > 0) {
  console.error('[check-server-esm-imports] FAIL');
  missing.forEach((marker) => console.error(`- ${marker}`));
  process.exit(1);
}

console.log('[check-server-esm-imports] PASS');
console.log(`- Checked ${visited.size} server runtime files reachable from ${apiEntryFiles.length} API entry files.`);
console.log('- Relative server runtime imports keep explicit .js extensions.');

// Offline adapter for the same archive writer used by the browser. Never uploads evidence.
import { openAsBlob, createReadStream } from 'node:fs';
import { mkdir, stat, writeFile, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { rolldown } from 'rolldown';
import assert from 'node:assert/strict';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [input, destination] = process.argv.slice(2);
assert(input && destination, 'Usage: source.json NEW-private-folder');
const source = await realpath(input);
const folder = resolve(await realpath(dirname(resolve(destination))), resolve(destination).split(/[\\/]/).at(-1));
const rel = relative(await realpath(repo), folder);
assert(rel.startsWith('..') || isAbsolute(rel), 'Private data must be outside repository');
await mkdir(folder); // exclusive: no overwrite or deletion
const missing = error => { if (error.code === 'ENOENT') throw new DOMException('Missing', 'NotFoundError'); throw error; };
const adapter = path => ({
    async getDirectoryHandle(name, options) {
        assert(!/[\\/]/.test(name)); const target = resolve(path, name);
        if (options?.create) await mkdir(target, { recursive: true });
        else await stat(target).catch(missing);
        return adapter(target);
    },
    async getFileHandle(name, options) {
        assert(!/[\\/]/.test(name)); const target = resolve(path, name);
        if (!options?.create) await stat(target).catch(missing);
        return {
            getFile: () => openAsBlob(target),
            createWritable: async () => {
                let pending;
                return { write: async data => { pending = data; }, close: async () => { await writeFile(target, pending, { flag: 'wx' }); pending = undefined; }, abort: async () => { pending = undefined; } };
            },
        };
    },
});
const hashFile = async path => { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); };
const before = await stat(source);
const sourceHash = await hashFile(source);
const bundle = await rolldown({ input: resolve(repo, 'utils/localBackupArchive.ts'), platform: 'node' });
const generated = await bundle.generate({ format: 'esm', codeSplitting: false });
await bundle.close();
const { createLocalArchive, openLocalArchive, readArchivedRecord } = await import(`data:text/javascript;base64,${Buffer.from(generated.output.find(item => item.type === 'chunk').code).toString('base64')}`);
const started = Date.now();
const target = adapter(folder);
const index = await createLocalArchive(await openAsBlob(source), target, undefined, count => { if (count % 20 === 0) console.log(JSON.stringify({ saved: count })); });
const reopened = await openLocalArchive(target);
assert.equal(reopened.records, index.records);
for (const entry of reopened.entries) await readArchivedRecord(target, entry);
assert.equal(await hashFile(source), sourceHash);
const after = await stat(source);
assert.equal(before.mtimeMs, after.mtimeMs); assert.equal(before.size, after.size);
const report = { passed: true, records: index.records, sourceBytes: before.size, sourceSha256: sourceHash, sourceUnchanged: true, allArchivedRecordsReopenedAndHashVerified: true, seconds: Math.round((Date.now() - started) / 1000), peakNodeRssMiB: Math.round(process.resourceUsage().maxRSS / 1024), paidCalls: 0, operationalImports: 0, scope: 'Node filesystem adapter of browser writer; not actual low-end browser hardware certification' };
await writeFile(resolve(folder, '검증결과.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify(report));

import {createServer} from 'vite';
import {createHash} from 'node:crypto';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpathSync} from 'node:fs';
import {MAX_CATALOG_BYTES,sourceContentJson,validateSourceCatalog} from '../lib/inspector/sourceCatalogValidation.js';

export async function sourceFacts(){
    const loader=await createServer({server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]}});
    try{
        const {LEGAL_CARDS}=await loader.ssrLoadModule('/lib/inspector/legal.ts');
        const {INSPECTION_CASES}=await loader.ssrLoadModule('/lib/inspector/inspectionCases.ts');
        const {SAFETY_TRENDS}=await loader.ssrLoadModule('/lib/inspector/safetyTrends.ts');
        const sources=[['legal',LEGAL_CARDS],['case',INSPECTION_CASES],['trend',SAFETY_TRENDS]].flatMap(([kind,items])=>items.map(item=>({key:`${kind}:${item.id}`,digest:createHash('sha256').update(sourceContentJson(item)).digest('hex'),urls:kind==='legal'?[...new Set([...item.duties,...item.sanctions].map(x=>x.url))]:[item.url]})));
        return {digests:Object.fromEntries(sources.map(s=>[s.key,s.digest])),urls:Object.fromEntries(sources.map(s=>[s.key,s.urls]))};
    }finally{await loader.close();}
}
export async function manageSources(args){
    const file=resolve('data/inspector/sourceReviews.json');
    const current=JSON.parse(await readFile(file,'utf8'));
    if(!['check','export','preview','apply','digests'].includes(args[0]))throw new Error('Usage: npm run sources:manage -- check|export <file>|preview <candidate>|apply <candidate>|digests. apply changes only the repository review catalog; PR/release gates still apply.');
    const facts=await sourceFacts(),digests=facts.digests;
    if(args[0]==='digests'){console.log(JSON.stringify(digests,null,2));return;}
    if(args[0]==='export'){
        if(!args[1]||resolve(args[1])===file)throw new Error('별도 내보내기 경로를 지정하세요.');
        await writeFile(resolve(args[1]),JSON.stringify(current,null,2)+'\n',{flag:'wx'});console.log('Exported review catalog; production unchanged.');return;
    }
    let value=current;
    if(args[0]!=='check'){
        if(!args[1]||resolve(args[1])===file)throw new Error('별도 갱신 후보 파일을 지정하세요.');
        const candidate=resolve(args[1]);if((await stat(candidate)).size>MAX_CATALOG_BYTES)throw new Error('후보 파일은 192KiB 이하여야 합니다.');
        value=JSON.parse(await readFile(candidate,'utf8'));
    }
    const errors=validateSourceCatalog(value,{expectedDigests:digests,expectedUrls:facts.urls,...(args[0]==='check'?{}:{baseline:current})});
    if(errors.length)throw new Error(errors.join('\n'));
    if(args[0]==='apply'){
        // A concurrent local edit must not be overwritten by an earlier preview.
        if(JSON.stringify(JSON.parse(await readFile(file,'utf8')))!==JSON.stringify(current))throw new Error('현재 검토파일이 바뀌었습니다. 갱신 후보를 다시 대조하세요.');
        await writeFile(file,JSON.stringify(value,null,2)+'\n');
    }
    console.log(`PASS: catalog v${value.version}, ${value.records.length} sources; ${args[0]==='apply'?'local repository updated, PR/release required':'no writes or external requests'}.`);
}
if(process.argv[1]&&realpathSync(fileURLToPath(import.meta.url))===realpathSync(process.argv[1]))manageSources(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});

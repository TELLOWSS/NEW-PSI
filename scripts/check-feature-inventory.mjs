import {readFileSync,existsSync} from 'node:fs';import path from 'node:path';
const read=(p)=>readFileSync(path.join(process.cwd(),p),'utf8');
const inv=JSON.parse(read('config/psi-function-inventory.json')),bounds=JSON.parse(read('config/psi-product-boundaries.json'));
const errors=[],ids=new Set();
for(const x of inv.items){if(ids.has(x.id))errors.push('duplicate '+x.id);ids.add(x.id);
 if(!existsSync(path.join(process.cwd(),x.source)))errors.push('missing '+x.source);
 if(!['keep','improved','review','external'].includes(x.status))errors.push('invalid status '+x.id);
}
if(inv.deletedFeatures.length)errors.push('Do not delete without separate compatibility validation.');
if(!read('components/IntegratedWorkBoard.tsx').includes('getWeakestWorkTrade(workerRecords)'))errors.push('single score rule missing');
if(!read('pages/SiteIssueManagement.tsx').includes('persistSiteIssueList'))errors.push('safe issue storage missing');
if(bounds.rules['partner-safety-expense'].autoMergeAllowed!==false)errors.push('contractor expense boundary violation');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('[PSI feature inventory] 17 units: source verified; no deletion, score and storage guards present.');

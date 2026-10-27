import raw from '../../data/inspector/sourceReviews.json' with {type:'json'};
import type {SourceCatalog,SourceReview} from './sourceReview.js';
const freeze=(value:any):any=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const sourceCatalog:SourceCatalog=freeze(raw as unknown as SourceCatalog);
/** Copy metadata into a new reference. Never look up live metadata for an old report. */
export function reviewForSource(kind:'legal'|'case'|'trend',id:string):SourceReview|undefined{
    const record=sourceCatalog.records.find(r=>r.key===`${kind}:${id}`);
    return record?structuredClone(record.revisions[record.revisions.length-1]):undefined;
}

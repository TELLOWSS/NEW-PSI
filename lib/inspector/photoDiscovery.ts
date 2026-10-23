import {legalForFinding,type LegalReference} from './legal.js';
import type {VisionImport} from './types.js';

/** Current catalog, selected finding only. Prior keyword candidates cannot veto its actual topic. */
export function findingLegalReference(analysis:VisionImport,reference:LegalReference,index:number):LegalReference {
    return {...legalForFinding(analysis,index),dateStatus:reference.dateStatus};
}
export function findingLegalTopic(analysis:VisionImport,reference:LegalReference,index:number):string {
    return findingLegalReference(analysis,reference,index).cards[0]?.id||'';
}

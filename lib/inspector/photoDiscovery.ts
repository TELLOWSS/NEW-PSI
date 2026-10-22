import {legalForText,type LegalReference} from './legal.js';
import type {VisionImport} from './types.js';

/** Use this finding's linked observation, never an unrelated hint or the prior selection. */
export function findingLegalTopic(analysis:VisionImport,reference:LegalReference,index:number):string {
    const finding=analysis.risk_findings?.[index],fact=finding&&analysis.observed_facts[Number(finding.observation_index)];
    if(!finding||!fact)return '';
    return legalForText([fact.text,finding.problem].join(' ')).cards.find(c=>reference.cards.some(r=>r.id===c.id))?.id||'';
}

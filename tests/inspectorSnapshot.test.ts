import {describe,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {serializeSnapshot} from '../lib/inspector/snapshot';
describe('inspector immutable snapshot hashing',()=>{
    const hash=(value:unknown)=>createHash('sha256').update(serializeSnapshot(value)).digest('hex');
    it('survives JSONB object-key reordering while preserving original evidence order',()=>{
        expect(hash({z:{b:2,a:'한글'},a:[1,2]})).toBe(hash({a:[1,2],z:{a:'한글',b:2}}));
        expect(hash({photos:['original','improvement']})).not.toBe(hash({photos:['improvement','original']}));
    });
    it('changes with the record revision and rejects values outside JSON',()=>{
        expect(hash({revision:1,note:'original'})).not.toBe(hash({revision:2,note:'original'}));
        expect(()=>serializeSnapshot({value:undefined})).toThrow();expect(()=>serializeSnapshot(NaN)).toThrow();
    });
});

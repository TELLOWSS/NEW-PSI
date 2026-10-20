import {describe,it,expect} from 'vitest';
import {fitPhoto} from '../lib/inspector/photoAssets';
import {validateOptimization} from '../lib/server/admin/inspectorAssets';
import {assertSafeEdit} from '../lib/inspector/validation';
import {newInspectionDocument} from '../lib/inspector/types';
import {createHash} from 'node:crypto';
describe('optimized assets and version binding',()=>{
 it('preserves aspect ratio without upscaling and allows high detail',()=>{expect(fitPhoto(4032,3024)).toEqual({width:2048,height:1536});expect(fitPhoto(800,600)).toEqual({width:800,height:600});expect(fitPhoto(3024,4032,3072)).toEqual({width:2304,height:3072});});
 it('checks real JPEG dimensions and rejects metadata and forged byte receipts',()=>{
 const bytes=Buffer.from('ffd8ffc0000808006400c800ffd9','hex');const hash=createHash('sha256').update(bytes).digest('hex');const receipt={version:'browser-jpeg-v2',source_kind:'optimized',source_bytes:1000,source_width:400,source_height:200,uploaded_bytes:bytes.length,uploaded_width:200,uploaded_height:100,quality:.82,uploaded_asset_sha256:hash,created_at:new Date().toISOString()};
 expect(validateOptimization(receipt,bytes,hash)).toEqual(receipt);for(const patch of [{uploaded_width:201},{uploaded_bytes:999},{uploaded_asset_sha256:'a'.repeat(64)},{source_width:199},{quality:.1}])expect(()=>validateOptimization({...receipt,...patch},bytes,hash)).toThrow();const meta=Buffer.concat([bytes.subarray(0,2),Buffer.from('ffe1000245786966','hex'),bytes.subarray(2)]);expect(()=>validateOptimization({...receipt,uploaded_bytes:meta.length},meta,hash)).toThrow();expect(validateOptimization(undefined,bytes,hash)).toBeNull();
 });
 it('invalidates review when photo notes are removed as well as changed',()=>{const old={...newInspectionDocument(),photoNotes:{p:'important hint'},analyses:{p:{} as any},reviews:{p:{decision:'accepted' as const,note:'reviewed photo'}}};expect(()=>assertSafeEdit({...old,photoNotes:{}},old)).toThrow();expect(()=>assertSafeEdit({...old,photoNotes:{},analyses:{},reviews:{}},old)).not.toThrow();});
});

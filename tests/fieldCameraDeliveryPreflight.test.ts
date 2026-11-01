import {afterEach,describe,expect,it,vi} from 'vitest';
import type {FieldPhoto} from '../lib/inspector/fieldPhotoStore';

vi.mock('../lib/inspector/fieldPhotoStore',()=>({getFieldPhoto:vi.fn()}));
import {getFieldPhoto} from '../lib/inspector/fieldPhotoStore';
import {assetHash} from '../lib/inspector/photoAssets';
import {FieldPhotoDeliveryError,verifyFieldPhotosForDelivery} from '../lib/inspector/fieldPhotoDelivery';

const read=vi.mocked(getFieldPhoto);
const make=async(id:string,bytes:string,addedAt=1730000000000):Promise<FieldPhoto>=>{
    const blob=new Blob([bytes],{type:'image/png'});
    return {id,blob,name:id+'.png',type:'image/png',addedAt,sha256:await assetHash(blob)};
};
afterEach(()=>read.mockReset());

describe('field camera F06 preflight before sharing and ZIP',()=>{
    it('reads and verifies all selected photos from IndexedDB, in requested order',async()=>{
        const a=await make('a','synthetic-image-A'),b=await make('b','synthetic-image-B');
        read.mockImplementation(async id=>id==='a'?a:id==='b'?b:undefined);
        const rows=await verifyFieldPhotosForDelivery([a,b],['b','a']);
        expect(rows).toEqual([b,a]);
        expect(read).toHaveBeenCalledTimes(2);
    });
    it('rejects a modified saved Blob with unchanged displayed metadata and hash',async()=>{
        const original=await make('a','synthetic-image-A');
        read.mockResolvedValue({...original,blob:new Blob(['synthetic-image-B'],{type:'image/png'})});
        await expect(verifyFieldPhotosForDelivery([original],['a']))
            .rejects.toMatchObject({reason:'changed',affectedIds:['a']});
    });
    it('rejects a swapped stored hash or timestamp and never uses stale previews',async()=>{
        const original=await make('a','synthetic-image-A');
        read.mockResolvedValue({...original,sha256:'b'.repeat(64)});
        await expect(verifyFieldPhotosForDelivery([original],['a']))
            .rejects.toMatchObject({reason:'changed'});
        read.mockResolvedValue({...original,addedAt:original.addedAt+1});
        await expect(verifyFieldPhotosForDelivery([original],['a']))
            .rejects.toMatchObject({reason:'changed'});
    });
    it('fails closed when SHA-256 was not recorded at save time',async()=>{
        const a={...await make('a','synthetic-image-A'),sha256:undefined};
        await expect(verifyFieldPhotosForDelivery([a],['a']))
            .rejects.toMatchObject({reason:'unverified',affectedIds:['a']});
        expect(read).not.toHaveBeenCalled();
    });
    it('blocks an unexpectedly removed storage record',async()=>{
        const a=await make('a','synthetic-image-A');read.mockResolvedValue(undefined);
        await expect(verifyFieldPhotosForDelivery([a],['a']))
            .rejects.toMatchObject({reason:'missing',affectedIds:['a']});
    });
    it('does not classify temporary storage access failures as tampering',async()=>{
        const a=await make('a','synthetic-image-A');read.mockRejectedValue(new Error('storage unavailable'));
        await expect(verifyFieldPhotosForDelivery([a],['a']))
            .rejects.toMatchObject({reason:'unavailable',affectedIds:[]});
    });
    it('blocks SHA-256 failures without sharing data',async()=>{
        const a=await make('a','synthetic-image-A');read.mockResolvedValue(a);
        const original=crypto.subtle.digest;
        const spy=vi.spyOn(crypto.subtle,'digest').mockRejectedValue(new Error('hash blocked'));
        try{
            await expect(verifyFieldPhotosForDelivery([a],['a']))
                .rejects.toMatchObject({reason:'unavailable',affectedIds:[]});
        }finally{spy.mockRestore();}
        expect(crypto.subtle.digest).toBe(original);
    });
    it('refuses duplicate IDs, unknown selections, and more than 100 items',async()=>{
        const a=await make('a','synthetic-image-A');
        await expect(verifyFieldPhotosForDelivery([a],['a','a']))
            .rejects.toBeInstanceOf(FieldPhotoDeliveryError);
        await expect(verifyFieldPhotosForDelivery([a],['unknown']))
            .rejects.toMatchObject({reason:'selection'});
        await expect(verifyFieldPhotosForDelivery([a],Array.from({length:101},(_,i)=>String(i))))
            .rejects.toMatchObject({reason:'selection'});
        expect(read).not.toHaveBeenCalled();
    });
});

import {assetHash} from './photoAssets';
import {getFieldPhoto,type FieldPhoto} from './fieldPhotoStore';

export type FieldPhotoDeliveryFailure='changed'|'missing'|'unverified'|'unavailable'|'selection';

/** Verification failure does not mean the photo should be deleted from IndexedDB. */
export class FieldPhotoDeliveryError extends Error {
    constructor(
        message:string,
        public readonly affectedIds:readonly string[],
        public readonly reason:FieldPhotoDeliveryFailure,
    ){super(message);this.name='FieldPhotoDeliveryError';}
}
const validHash=/^[a-f0-9]{64}$/;
const types=new Set(['image/jpeg','image/png','image/webp']);
const MAX_PHOTOS=100,MAX_TOTAL_BYTES=60*1024*1024;

/**
 * Read the actual IndexedDB version of every photo immediately before
 * sharing/export, not a potentially stale React preview.
 * No server access, no metadata mutation, no background AI or "approval".
 */
export const verifyFieldPhotosForDelivery=async(
    displayed:readonly FieldPhoto[],
    requestedIds:readonly string[],
):Promise<FieldPhoto[]>=>{
    if(!requestedIds.length||requestedIds.length>MAX_PHOTOS||
        new Set(requestedIds).size!==requestedIds.length)
        throw new FieldPhotoDeliveryError('공유할 사진을 1~100장 중복 없이 선택하세요.',[],'selection');
    const previews=new Map(displayed.map(row=>[row.id,row]));
    if(requestedIds.some(id=>!previews.has(id)))
        throw new FieldPhotoDeliveryError('선택한 사진이 현재 사진함 목록과 다릅니다. 사진함을 다시 여세요.',[],'selection');
    const checked:FieldPhoto[]=[];
    let total=0;
    for(const id of requestedIds){
        const preview=previews.get(id)!;
        if(!preview.sha256||!validHash.test(preview.sha256))
            throw new FieldPhotoDeliveryError('보관 시 해시가 없는 사진입니다. 해당 사진을 기기에 따로 저장하고 새로 촬영해 주세요.',[id],'unverified');
        let stored:FieldPhoto|undefined;
        try{stored=await getFieldPhoto(id);}
        catch{
            throw new FieldPhotoDeliveryError('기기 사진함을 읽지 못해 공유를 중단했습니다. 사진함을 다시 확인하세요.',[],'unavailable');
        }
        if(!stored)
            throw new FieldPhotoDeliveryError('선택한 사진이 기기 사진함에서 사라져 공유를 중단했습니다.',[id],'missing');
        if(stored.id!==preview.id||stored.name!==preview.name||
            stored.type!==preview.type||stored.addedAt!==preview.addedAt||
            stored.blob.size!==preview.blob.size||stored.sha256!==preview.sha256||
            !types.has(stored.type)||stored.blob.size<1||stored.blob.size>40*1024*1024)
            throw new FieldPhotoDeliveryError('보관된 사진 정보가 미리보기와 다릅니다. 해당 사진을 다시 확인하세요.',[id],'changed');
        let actualHash:string;
        try{actualHash=await assetHash(stored.blob);}
        catch{
            throw new FieldPhotoDeliveryError('SHA-256 계산을 할 수 없어 공유를 중단했습니다. HTTPS 연결을 확인하세요.',[],'unavailable');
        }
        if(actualHash!==preview.sha256)
            throw new FieldPhotoDeliveryError('기기 사진함의 실제 파일 해시가 달라 공유를 중단했습니다.',[id],'changed');
        total+=stored.blob.size;
        if(total>MAX_TOTAL_BYTES)
            throw new FieldPhotoDeliveryError('한 번에 전달할 사진은 합계 60MB 이하로 선택하세요.',[],'selection');
        checked.push(stored);
    }
    return checked;
};

/**
 * F08 single photo checkpoint is independent of the two-photo sequence.
 * This is not a trusted photo provenance certificate or permanent backup.
 */
export const SINGLE_PHOTO_DRAFT_KEY='psi-single-photo-draft-v1';
export const SINGLE_PHOTO_MAX_BYTES=20*1024*1024;
export function validSinglePhotoDraft(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const keys=['id','kind','revision','savedAt','photo','sha256','source','edit'];
 if(Object.keys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k)))return false;
 if(value.id!==SINGLE_PHOTO_DRAFT_KEY||value.kind!=='single-photo-draft')return false;
 if(typeof value.revision!=='string'||!/^[a-f0-9-]{36}$/i.test(value.revision)
 ||typeof value.savedAt!=='string'||!Number.isFinite(Date.parse(value.savedAt)))return false;
 const file=value.photo;
 if(typeof File==='undefined'||!(file instanceof File)||file.size<1||file.size>SINGLE_PHOTO_MAX_BYTES
 ||file.name.length>255||file.type.length>100)return false;
 if(typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256)
 ||!['camera-dialog','file-picker'].includes(value.source))return false;
 if(value.edit===null)return true;
 const e=value.edit;
 return e&&typeof e==='object'&&!Array.isArray(e)
  &&Object.keys(e).length===5
  &&['originalFile','originalSha256','derivedSha256','rotationDegrees','processedAt'].every(k=>Object.hasOwn(e,k))
  &&e.originalFile instanceof File&&e.originalFile.size>0&&e.originalFile.size<=SINGLE_PHOTO_MAX_BYTES
  &&typeof e.originalSha256==='string'&&/^[a-f0-9]{64}$/.test(e.originalSha256)
  &&e.derivedSha256===value.sha256
  &&[90,180,270].includes(e.rotationDegrees)
  &&typeof e.processedAt==='string'&&Number.isFinite(Date.parse(e.processedAt));
}
export function singlePhotoDraftCanReplace(latest,expected){
 if(!latest&&!expected)return true;
 return validSinglePhotoDraft(latest)&&validSinglePhotoDraft(expected)&&latest.revision===expected.revision;
}
export function singlePhotoDraftMetadataMatches(expected,found){
 return !!expected&&!!found&&expected.id===found.id&&expected.revision===found.revision
  &&expected.sha256===found.sha256&&expected.source===found.source
  &&expected.photo?.size===found.photo?.size
  &&expected.photo?.name===found.photo?.name
  &&expected.photo?.type===found.photo?.type;
}

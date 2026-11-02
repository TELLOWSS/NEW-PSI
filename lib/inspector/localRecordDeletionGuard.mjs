/**
 * F08 no-loss optimistic concurrency check for explicit destructive operations.
 * It compares the complete structured fields and image-file *metadata*
 * from a displayed IndexedDB record to the value loaded in the SAME
 * readwrite transaction as the destructive request. The comparison does
 * not recalculate photograph bytes, authenticate evidence or prove identity.
 * A false mismatch must block deletion rather than lose newer records.
 */
export function localRecordDeletionSnapshot(record){
  if(!record||typeof record!=='object'||Array.isArray(record))return null;
  try{
    return JSON.stringify(record,function(key,value){
      if(typeof Blob!=='undefined'&&value instanceof Blob){
        const file=value;
        return {
          __psi_blob_metadata_only__:true,
          name:typeof file.name==='string'?file.name:null,
          type:file.type,
          size:file.size,
          lastModified:Number.isFinite(file.lastModified)?file.lastModified:null,
        };
      }
      return value;
    });
  }catch{
    return null;
  }
}
export function localRecordMayDelete(displayed,latest){
  const expected=localRecordDeletionSnapshot(displayed);
  const actual=localRecordDeletionSnapshot(latest);
  return expected!==null&&actual!==null&&expected===actual;
}

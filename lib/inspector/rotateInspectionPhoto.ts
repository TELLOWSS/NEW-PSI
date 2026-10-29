/**
 * Local-only rotation of an unregistered inspection photograph.
 * The original File is retained by the caller for reset/recovery; this function
 * never modifies already persisted inspection evidence or annotations.
 */
export async function rotateInspectionPhoto(original:File,degrees:90|180|270):Promise<File>{
  const source=typeof createImageBitmap==='function'?await createImageBitmap(original):null;
  let fallback:HTMLImageElement|null=null,sourceUrl='';
  try{
    if(!source){
      sourceUrl=URL.createObjectURL(original);
      fallback=new Image();
      fallback.src=sourceUrl;
      await fallback.decode();
    }
    const width=source?source.width:fallback!.naturalWidth;
    const height=source?source.height:fallback!.naturalHeight;
    if(!width||!height)throw new Error('사진 화소를 확인할 수 없습니다.');
    // Source can be much larger than a mobile canvas budget; rotation output
    // is bounded to preserve app stability. The untouched original stays in memory.
    const scale=Math.min(1,Math.sqrt(24000000/(width*height)));
    const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
    const quarter=degrees===90||degrees===270;
    const canvas=document.createElement('canvas');
    canvas.width=quarter?h:w;
    canvas.height=quarter?w:h;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('사진 회전용 메모리를 확보하지 못했습니다.');
    if(degrees===90){ctx.translate(canvas.width,0);ctx.rotate(Math.PI/2);}
    else if(degrees===180){ctx.translate(canvas.width,canvas.height);ctx.rotate(Math.PI);}
    else{ctx.translate(0,canvas.height);ctx.rotate(3*Math.PI/2);}
    ctx.drawImage((source||fallback)!,0,0,w,h);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('회전 사진 저장 실패')),'image/jpeg',.94));
    canvas.width=0;canvas.height=0;
    const base=original.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9가-힣._-]/g,'_').slice(0,65)||'PSI-camera';
    return new File([blob],base+'-rotated-'+degrees+'.jpg',{type:'image/jpeg',lastModified:Date.now()});
  }finally{
    source?.close();
    if(sourceUrl)URL.revokeObjectURL(sourceUrl);
  }
}

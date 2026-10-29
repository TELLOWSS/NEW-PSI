/**
 * Rotate the capture REVIEW copy by quarter turns. The caller owns and keeps
 * the original File; no stored inspection, uploaded evidence, or EXIF record
 * is mutated. The returned JPEG is explicitly a derived/edited image.
 */
export async function rotateInspectionPhoto(original:File,turns:number):Promise<File>{
  const normalized=((Math.trunc(turns)%4)+4)%4;
  if(normalized===0)return original;
  let image:ImageBitmap|HTMLImageElement|null=null,objectUrl='';
  try{
    if(typeof createImageBitmap==='function')image=await createImageBitmap(original,{imageOrientation:'from-image'});
    else{
      objectUrl=URL.createObjectURL(original);
      image=await new Promise<HTMLImageElement>((resolve,reject)=>{
        const element=new Image();
        element.onload=()=>resolve(element);
        element.onerror=()=>reject(new Error('촬영 사진을 읽지 못했습니다.'));
        element.src=objectUrl;
      });
    }
    const width=image instanceof HTMLImageElement?image.naturalWidth:image.width;
    const height=image instanceof HTMLImageElement?image.naturalHeight:image.height;
    if(!width||!height||width*height>32000000)throw new Error('이미지 크기가 너무 큽니다. 기기 사진 편집으로 회전한 뒤 다시 선택해 주세요.');
    const canvas=document.createElement('canvas');
    canvas.width=normalized%2?height:width;
    canvas.height=normalized%2?width:height;
    const context=canvas.getContext('2d');
    if(!context)throw new Error('기기에서 사진 회전 기능을 사용할 수 없습니다.');
    context.translate(canvas.width/2,canvas.height/2);
    context.rotate(normalized*Math.PI/2);
    context.drawImage(image,-width/2,-height/2,width,height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('회전된 사진을 만들 수 없습니다.')),'image/jpeg',.94));
    canvas.width=0;canvas.height=0;
    return new File([blob],original.name.replace(/\.[a-z0-9]+$/i,'')+'-rotated-'+normalized*90+'.jpg',{type:'image/jpeg',lastModified:Date.now()});
  }finally{
    if(image&&'close' in image&&typeof image.close==='function')image.close();
    if(objectUrl)URL.revokeObjectURL(objectUrl);
  }
}

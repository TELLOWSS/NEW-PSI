/** Normalized regions bound to the fully oriented decoded image. */
export interface PsiPhotoMaskRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

type DisplayBounds = { left: number; top: number; width: number; height: number };

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Pointer positions are viewport-relative; return full-resolution fractions. */
export const psiMaskFromDrag = (
    start: {clientX: number;clientY: number},
    end: {clientX: number;clientY: number},
    bounds: DisplayBounds,
    minDisplayPixels = 8,
): PsiPhotoMaskRect | null => {
    if (![start.clientX,start.clientY,end.clientX,end.clientY,bounds.left,bounds.top,
        bounds.width,bounds.height].every(Number.isFinite)
        || bounds.width <= 0 || bounds.height <= 0) return null;
    const x1=clamp((start.clientX-bounds.left)/bounds.width);
    const x2=clamp((end.clientX-bounds.left)/bounds.width);
    const y1=clamp((start.clientY-bounds.top)/bounds.height);
    const y2=clamp((end.clientY-bounds.top)/bounds.height);
    const x=Math.min(x1,x2),y=Math.min(y1,y2);
    const width=Math.abs(x2-x1),height=Math.abs(y2-y1);
    if (width*bounds.width < minDisplayPixels || height*bounds.height < minDisplayPixels) return null;
    return {x,y,width,height};
};

export const validatePsiPhotoMasks = (
    masks: readonly PsiPhotoMaskRect[],
    width: number,
    height: number,
): Array<{x:number;y:number;width:number;height:number}> => {
    if (!Number.isSafeInteger(width)||!Number.isSafeInteger(height)
        ||width<=0||height<=0||width*height>20_000_000)
        throw new Error('이미지 크기가 올바르지 않거나 2천만 픽셀을 초과합니다.');
    if (!Array.isArray(masks)||masks.length<1||masks.length>40)
        throw new Error('실제 가릴 영역을 1~40개 지정하세요.');
    return masks.map(mask=>{
        if (!mask || ![mask.x,mask.y,mask.width,mask.height].every(Number.isFinite)
            ||mask.x<0||mask.y<0||mask.width<=0||mask.height<=0
            ||mask.x+mask.width>1+1e-8||mask.y+mask.height>1+1e-8) {
            throw new Error('가림 영역의 좌표가 이미지 밖으로 벗어났습니다.');
        }
        const left=Math.floor(mask.x*width),top=Math.floor(mask.y*height);
        const right=Math.min(width,Math.ceil((mask.x+mask.width)*width));
        const bottom=Math.min(height,Math.ceil((mask.y+mask.height)*height));
        if (right-left<2||bottom-top<2)
            throw new Error('가림 영역이 너무 작습니다. 영역을 다시 지정하세요.');
        return {x:left,y:top,width:right-left,height:bottom-top};
    });
};

/** All covered pixels are filled black, never blurred or translucently overlaid. */
export const applyOpaquePsiPhotoMasks = (
    ctx: Pick<CanvasRenderingContext2D,'fillStyle'|'fillRect'>,
    masks:readonly PsiPhotoMaskRect[],
    width:number,
    height:number,
):void => {
    const rectangles=validatePsiPhotoMasks(masks,width,height);
    ctx.fillStyle='#000000';
    for (const rect of rectangles) ctx.fillRect(rect.x,rect.y,rect.width,rect.height);
};

/**
 * Keep ONLY PNG essential chunks emitted by a freshly rendered canvas.
 * Remove eXIf/tEXt/iTXt/zTXt/iCCP/pHYs/time and other ancillary metadata.
 * The returned bytes are still a PNG, not original source bytes.
 */
export const stripPsiCanvasPngMetadata = (source:Uint8Array):Uint8Array => {
    const magic=[137,80,78,71,13,10,26,10];
    if(source.length<57 || magic.some((byte,index)=>source[index]!==byte))
        throw new Error('생성된 PNG 형식이 유효하지 않습니다.');
    const view=new DataView(source.buffer,source.byteOffset,source.byteLength);
    const retained:Uint8Array[]=[source.slice(0,8)];
    let offset=8,seenIHDR=false,seenIDAT=false,seenIEND=false;
    while(offset+12<=source.length){
        const size=view.getUint32(offset,false);
        if(size>source.length-offset-12)throw new Error('PNG 청크 범위가 올바르지 않습니다.');
        const name=String.fromCharCode(...source.subarray(offset+4,offset+8));
        const end=offset+12+size;
        if(!/^[A-Za-z]{4}$/.test(name))throw new Error('PNG 청크 이름 오류');
        if(!seenIHDR && (name!=='IHDR'||size!==13))
            throw new Error('PNG 헤더가 없습니다.');
        if(name==='IHDR'){
            if(seenIHDR||size!==13)throw new Error('중복 PNG 헤더');
            seenIHDR=true;
            const w=view.getUint32(offset+8,false),h=view.getUint32(offset+12,false);
            if(w<1||h<1||w*h>20_000_000)throw new Error('PNG 픽셀 크기 제한');
            // Reject palette or alpha-key formats whose ancillary transparency
            // information could be lost when metadata chunks are discarded.
            if(source[offset+16]!==8||![2,6].includes(source[offset+17]))
                throw new Error('캔버스 PNG 색상 형식이 지원되지 않습니다.');
        }
        if(name==='IDAT')seenIDAT=true;
        if(name==='IEND'){
            if(size!==0||!seenIDAT)throw new Error('PNG 종료 정보가 유효하지 않습니다.');
            seenIEND=true;
        }
        // PNG critical chunks include IHDR/PLTE/IDAT/IEND.
        // For canvas-produced PNG, colorType6/RGBA or RGB are expected.
        if(['IHDR','PLTE','IDAT','IEND'].includes(name)){
            retained.push(source.slice(offset,end));
        } else if (name.charCodeAt(0)>=65 && name.charCodeAt(0)<=90) {
            throw new Error('알 수 없는 필수 PNG 청크가 있어 저장을 중단합니다.');
        }
        offset=end;
        if(seenIEND)break;
    }
    if(!seenIHDR||!seenIDAT||!seenIEND||offset!==source.length)
        throw new Error('PNG가 불완전하여 가림 파일을 저장할 수 없습니다.');
    const result=new Uint8Array(retained.reduce((sum,part)=>sum+part.length,0));
    let pos=0;
    for(const part of retained){result.set(part,pos);pos+=part.length;}
    return result;
};

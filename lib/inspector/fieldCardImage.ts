import {FIELD_CARD_FOOTER,fieldCardLine,validateFieldCard,type FieldCardDraft} from './fieldCard';

/** Preserve all characters and the entire photo; never crop or silently clip a card. */
export function wrapCardText(text:string,maxWidth:number,measure:(value:string)=>number):string[]{
    const lines:string[]=[];let line='';
    for(const char of Array.from(fieldCardLine(text))){if(line&&measure(line+char)>maxWidth){lines.push(line.trimEnd());line=char.trimStart();}else line+=char;}
    if(line)lines.push(line);return lines;
}
export async function renderFieldCard(photo:Blob,draft:FieldCardDraft,basis:string,source:string,fontFamily='sans-serif'):Promise<File>{
    const invalid=validateFieldCard(draft);if(invalid)throw new Error(invalid);
    const url=URL.createObjectURL(photo),image=new Image(),canvas=document.createElement('canvas');
    try{
        await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('사진 준비 시간이 길어졌습니다. 다시 시도해 주세요.')),15000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error('사진을 카드로 불러오지 못했습니다.'));};image.src=url;});
        if(!image.naturalWidth||!image.naturalHeight)throw new Error('사진 크기를 확인하지 못했습니다.');
        if(document.fonts)await Promise.race([document.fonts.load(`600 30px ${fontFamily}`,'현장 전달 카드').catch(()=>[]),new Promise(resolve=>setTimeout(resolve,1500))]);
        canvas.width=1080;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('이미지 생성을 지원하지 않는 브라우저입니다. 문구 복사를 이용해 주세요.');
        const blocks=[{label:'확인할 문제',text:draft.problem,size:40,lineHeight:57,color:'#142c40'},...(draft.location.trim()?[{label:'사진 위치',text:draft.location,size:30,lineHeight:44,color:'#334e60'}]:[]),...(draft.evidence.trim()?[{label:'관찰 · 점검자 의견',text:draft.evidence,size:30,lineHeight:44,color:'#334e60'}]:[]),{label:'요청 조치',text:draft.action,size:36,lineHeight:52,color:'#075e59'}].map(block=>{ctx.font=`600 ${block.size}px ${fontFamily}`;return {...block,lines:wrapCardText(block.text,920,value=>ctx.measureText(value).width)};});
        const height=850+blocks.reduce((sum,block)=>sum+88+block.lines.length*block.lineHeight,0)+190;
        if(height>3600)throw new Error('카드가 너무 길어집니다. 문구를 줄여 다시 만들어 주세요.');
        canvas.height=height;ctx.fillStyle='#f1f5f5';ctx.fillRect(0,0,1080,height);
        ctx.fillStyle='#102f43';ctx.fillRect(0,0,1080,174);ctx.fillStyle='#a2e3d3';ctx.font=`700 24px ${fontFamily}`;ctx.fillText('PSI  /  FIELD NOTE',56,47);
        ctx.fillStyle='#ffffff';ctx.font=`700 44px ${fontFamily}`;ctx.fillText('현장 확인 · 조치 요청',56,111);ctx.font=`500 22px ${fontFamily}`;ctx.fillText(basis,56,150);
        ctx.fillStyle='#dfe7eb';ctx.fillRect(40,202,1000,540);
        const scale=Math.min(1000/image.naturalWidth,540/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;ctx.drawImage(image,40+(1000-w)/2,202+(540-h)/2,w,h);
        ctx.fillStyle='#4a6072';ctx.font=`500 24px ${fontFamily}`;ctx.fillText(source,56,790);
        let y=838;
        for(const block of blocks){const boxHeight=block.lines.length*block.lineHeight+64;ctx.fillStyle=block.label==='요청 조치'?'#dcefe9':'#ffffff';ctx.fillRect(40,y,1000,boxHeight);ctx.fillStyle='#52766f';ctx.font=`700 23px ${fontFamily}`;ctx.fillText(block.label,80,y+34);ctx.fillStyle=block.color;ctx.font=`600 ${block.size}px ${fontFamily}`;block.lines.forEach((line,n)=>ctx.fillText(line,80,y+76+n*block.lineHeight));y+=boxHeight+24;}
        ctx.fillStyle='#142c40';ctx.font=`600 26px ${fontFamily}`;ctx.fillText('조치 가능 여부와 현장 확인 결과를 회신해 주세요.',56,y+45);
        ctx.fillStyle='#526578';ctx.font=`500 20px ${fontFamily}`;ctx.fillText(FIELD_CARD_FOOTER,56,y+94);ctx.fillText('안전·위반·조치 완료를 확정하는 증명서가 아닙니다.',56,y+128);
        const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('카드를 만들지 못했습니다. 문구를 복사하거나 다시 시도해 주세요.')),'image/jpeg',.9));
        if(blob.size>3*1024*1024)throw new Error('카드가 3MB를 넘었습니다. 문구를 줄이거나 문구·사진 따로 보내기를 이용해 주세요.');
        return new File([blob],'PSI-현장전달카드.jpg',{type:'image/jpeg'});
    }finally{image.onload=null;image.onerror=null;image.src='';URL.revokeObjectURL(url);canvas.width=canvas.height=1;}
}

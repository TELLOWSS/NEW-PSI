export type PhotoMark={kind:'circle'|'arrow';x:number;y:number;endX:number;endY:number};
export const validMarks=(marks:PhotoMark[])=>marks.length<=8&&marks.every(m=>['circle','arrow'].includes(m.kind)&&[m.x,m.y,m.endX,m.endY].every(v=>Number.isFinite(v)&&v>=0&&v<=1));
export function drawPhotoMarks(ctx:CanvasRenderingContext2D,marks:PhotoMark[],left:number,top:number,width:number,height:number){
 if(!validMarks(marks))throw new Error('사진 위치 표시를 확인해 주세요.');
 ctx.save();ctx.strokeStyle='#ffdc48';ctx.lineWidth=Math.max(3,Math.min(width,height)*.009);ctx.lineCap='round';
 for(const m of marks){const x=left+m.x*width,y=top+m.y*height;ctx.beginPath();if(m.kind==='circle')ctx.arc(x,y,Math.min(width,height)*.06,0,Math.PI*2);else{const ex=left+m.endX*width,ey=top+m.endY*height,a=Math.atan2(ey-y,ex-x),l=Math.min(width,height)*.05;ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.moveTo(ex-l*Math.cos(a-.5),ey-l*Math.sin(a-.5));ctx.lineTo(ex,ey);ctx.lineTo(ex-l*Math.cos(a+.5),ey-l*Math.sin(a+.5));}ctx.stroke();}ctx.restore();
}

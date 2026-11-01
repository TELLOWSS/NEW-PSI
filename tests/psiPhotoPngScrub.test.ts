import {describe,it,expect} from 'vitest';
import {stripPsiCanvasPngMetadata} from '../utils/psiPhotoMaskGeometry';
const chunk=(type:string,data:number[])=>{
 const out=new Uint8Array(data.length+12);
 new DataView(out.buffer).setUint32(0,data.length);
 for(let i=0;i<4;i++)out[4+i]=type.charCodeAt(i);
 out.set(data,8);
 return out;
};
const join=(...arr:Uint8Array[])=>{
 const out=new Uint8Array(arr.reduce((n,x)=>n+x.length,0));
 let pos=0;for(const item of arr){out.set(item,pos);pos+=item.length;}
 return out;
};
const picture=()=>{
 const ihdr=new Array(13).fill(0);ihdr[3]=2;ihdr[7]=2;ihdr[8]=8;ihdr[9]=6;
 const sig=new Uint8Array([137,80,78,71,13,10,26,10]);
 return join(sig,chunk('IHDR',ihdr),
  chunk('eXIf',[70,73,76,69,1]),
  chunk('tEXt',[78,79,84,69,1]),
  chunk('IDAT',[1,2,3,4]),chunk('IEND',[]));
};
describe('PSI photo output metadata clearing',()=>{
 it('drops EXIF and text chunks but retains essential image chunks',()=>{
  const result=new TextDecoder().decode(stripPsiCanvasPngMetadata(picture()));
  expect(result).not.toContain('eXIf');
  expect(result).not.toContain('tEXt');
  expect(result).toContain('IHDR');
  expect(result).toContain('IDAT');
  expect(result).toContain('IEND');
 });
 it('rejects broken signature or chunk length and unknown critical chunks',()=>{
  expect(()=>stripPsiCanvasPngMetadata(new Uint8Array(80))).toThrow();
  const bad=picture();new DataView(bad.buffer).setUint32(8,0xffffffff);
  expect(()=>stripPsiCanvasPngMetadata(bad)).toThrow();
  const raw=picture();
  expect(()=>stripPsiCanvasPngMetadata(join(raw.subarray(0,33),chunk('ABCD',[1]),raw.subarray(33)))).toThrow();
 });
});

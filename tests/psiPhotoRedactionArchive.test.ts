import {afterEach,describe,expect,it,vi} from 'vitest';
import type {EvidencePackageVerification} from '../utils/psiEvidenceArchive';
class MockZip {
 private data=new Map<string,Uint8Array>();
 file(path:string,body?:Uint8Array|string):any{
  if(body===undefined){
   const bytes=this.data.get(path);
   return bytes?{async:async()=>bytes}:null;
  }
  this.data.set(path,typeof body==='string'?new TextEncoder().encode(body):body);
 }
 get files(){return Object.fromEntries([...this.data.keys()].map(x=>[x,{dir:false}]));}
 async generateAsync(){return new Blob([JSON.stringify([...this.data].map(([k,b])=>[k,[...b]]))]);}
 async loadAsync(blob:Blob){
  this.data=new Map((JSON.parse(await blob.text()) as Array<[string,number[]]>)
    .map(([k,b])=>[k,Uint8Array.from(b)]));return this;
 }
}
vi.mock('../utils/externalScripts',()=>({
 ensureJsZip:async()=>MockZip,ensureFileSaver:async()=>()=>{},
}));
const verifiedRef=vi.hoisted(()=>({value:null as any}));
vi.mock('../utils/psiEvidenceArchive',()=>({
 verifyPsiEvidenceArchive:vi.fn(async()=>verifiedRef.value),
}));
import {buildPsiMaskedPhotoReviewArchive,loadPsiVerifiedPhoto} from '../utils/psiPhotoRedactionArchive';

const sourcePath='assets/currently-stored-original-form.jpg';
const image=Uint8Array.from([255,216,255,...Array.from({length:80},(_,i)=>i%200)]);
const png=()=>{
 const part=(name:string,data:number[])=>{
  const a=new Uint8Array(data.length+12);new DataView(a.buffer).setUint32(0,data.length);
  for(let i=0;i<4;i++)a[4+i]=name.charCodeAt(i);a.set(data,8);return a;
 };
 const header=new Array(13).fill(0);header[3]=4;header[7]=4;header[8]=8;header[9]=6;
 const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),part('IHDR',header),
  part('tEXt',[80,73,73,1]),part('IDAT',[1,2,3]),part('IEND',[])];
 const result=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));
 let p=0;for(const c of chunks){result.set(c,p);p+=c.length;}return result;
};
const digest=async(b:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(b)))]
 .map(i=>i.toString(16).padStart(2,'0')).join('');
const source=async()=>{
 const zip=new MockZip();zip.file(sourcePath,image);const blob=await zip.generateAsync();
 const info:EvidencePackageVerification={
  verified:true,externallyAnchored:true,errors:[],recordId:'synthetic-photo',
  zipSha256:'a'.repeat(64),checkedFiles:2,description:'validated',
  fileInventory:[{path:sourcePath,bytes:image.length,sha256:await digest(image),mimeType:'image/jpeg'}],
 };
 verifiedRef.value=info;return {blob,info};
};
afterEach(()=>{vi.unstubAllGlobals();});
describe('PSI masked photo review packaging',()=>{
 it('checks source bytes and produces only a replacement PNG, no original JPEG or metadata',async()=>{
  const {blob,info}=await source();
  const painted:Array<{color:string;x:number;y:number;w:number;h:number}>=[];
  const context={
   fillStyle:'#fff',fillRect(x:number,y:number,w:number,h:number){
    painted.push({color:this.fillStyle,x,y,w,h});
   },
   drawImage:vi.fn(),
   getImageData:(_x:number,_y:number,w:number,h:number)=>{
    const data=new Uint8ClampedArray(w*h*4);
    for(let i=3;i<data.length;i+=4)data[i]=255;
    return {data};
   },
  };
  const canvas={width:0,height:0,getContext:()=>context,toBlob:(cb:(blob:Blob)=>void)=>
   cb(new Blob([png()],{type:'image/png'}))};
  vi.stubGlobal('document',{createElement:()=>canvas});
  vi.stubGlobal('createImageBitmap',async()=>({width:4,height:4,close:vi.fn()}));
  const masks=[{x:0.25,y:0.25,width:0.5,height:0.5}];
  const result=await buildPsiMaskedPhotoReviewArchive(blob,info,sourcePath,'synthetic-photo',masks);
  expect(painted).toContainEqual({color:'#000000',x:1,y:1,w:2,h:2});
  const output=await new MockZip().loadAsync(result.blob);
  expect(Object.keys(output.files)).toEqual(['MASKED_IMAGE.png','REVIEW_MANIFEST.json','SHA256SUMS.txt']);
  const exported=await output.file('MASKED_IMAGE.png').async() as Uint8Array;
  expect(new TextDecoder().decode(exported)).not.toContain('tEXt');
  expect(result.manifest.originalImageIncluded).toBe(false);
  expect(result.manifest.sourceMetadataCopied).toBe(false);
  expect(result.manifest.legalDisclosureApproved).toBe(false);
  expect(result.zipSha256).toMatch(/^[0-9a-f]{64}$/);
 });
 it('blocks wrong worker, modified bytes and unverified parent ZIP',async()=>{
  const {blob,info}=await source();
  await expect(loadPsiVerifiedPhoto(blob,info,sourcePath,'other')).rejects.toThrow();
  await expect(loadPsiVerifiedPhoto(blob,{...info,externallyAnchored:false},
   sourcePath,'synthetic-photo')).rejects.toThrow();
  const changed=new MockZip();changed.file(sourcePath,Uint8Array.from([255,216,255,...new Array(80).fill(0)]));
  await expect(loadPsiVerifiedPhoto(await changed.generateAsync(),info,
   sourcePath,'synthetic-photo')).rejects.toThrow('해시');
 });
});

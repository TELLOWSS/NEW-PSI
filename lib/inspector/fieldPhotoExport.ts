import type {FieldPhoto} from './fieldPhotoStore';

/** Stored ZIP: bytes are copied without modifying or recompressing photos. */
export async function exportFieldPhotos(rows:FieldPhoto[]):Promise<Blob>{
 if(!rows.length||rows.length>100||rows.reduce((n,row)=>n+row.blob.size,0)>60*1024*1024)throw new Error('한 번에 사진 100장, 합계 60MB까지 준비할 수 있습니다. 나누어 선택해 주세요.');
 const parts:BlobPart[]=[],central:BlobPart[]=[];let offset=0,centralSize=0;
 const header=(size:number)=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};};
 const crc=async(bytes:Uint8Array)=>{let value=0xffffffff;for(let i=0;i<bytes.length;i++){value^=bytes[i];for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);if(i>0&&i%1048576===0)await new Promise<void>(resolve=>setTimeout(resolve,0));}return (value^0xffffffff)>>>0;};
 for(let i=0;i<rows.length;i++){
  const row=rows[i],data=new Uint8Array(await row.blob.arrayBuffer()),ext=row.type==='image/png'?'png':row.type==='image/webp'?'webp':'jpg',name=new TextEncoder().encode(`photo-${String(i+1).padStart(3,'0')}.${ext}`),sum=await crc(data),local=header(30),v=local.view;
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,sum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);parts.push(local.bytes,name,data);
  const entry=header(46),c=entry.view;c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint32(16,sum,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.push(entry.bytes,name);centralSize+=46+name.length;offset+=30+name.length+data.length;
 }
 const end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,rows.length,true);end.view.setUint16(10,rows.length,true);end.view.setUint32(12,centralSize,true);end.view.setUint32(16,offset,true);return new Blob([...parts,...central,end.bytes],{type:'application/zip'});
}

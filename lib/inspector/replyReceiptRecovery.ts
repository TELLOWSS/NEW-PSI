/** Stores only an opaque receipt identifier, never names, notes, photos or the share token. */
export const RECEIPT_MARKER_TTL_MS=24*60*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type PendingReceiptMarker={requestId:string;startedAt:number};
export function encodePendingReceipt(value:PendingReceiptMarker):string{
 if(!UUID.test(value.requestId)||!Number.isFinite(value.startedAt))throw new Error('Invalid receipt marker');
 return JSON.stringify({requestId:value.requestId,startedAt:value.startedAt});
}
export function decodePendingReceipt(raw:string|null,now=Date.now()):PendingReceiptMarker|null{
 if(!raw)return null;
 try{
  const parsed:unknown=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
  const value=parsed as Record<string,unknown>;
  if(typeof value.requestId!=='string'||!UUID.test(value.requestId)||typeof value.startedAt!=='number'||!Number.isFinite(value.startedAt))return null;
  if(value.startedAt>now+60_000||now-value.startedAt>RECEIPT_MARKER_TTL_MS)return null;
  return {requestId:value.requestId,startedAt:value.startedAt};
 }catch{return null;}
}
export async function receiptMarkerKey(shareToken:string):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(shareToken));
 return 'psi.inspector.reply.receipt.v1.'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

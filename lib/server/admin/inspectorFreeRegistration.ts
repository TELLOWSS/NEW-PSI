import {createHmac,timingSafeEqual} from 'node:crypto';
type Config={provider:string;model:string;key:string};
const NAME='psi_inspector_free_profile',DAYS=30;
const secret=()=>process.env.ADMIN_SESSION_SECRET||'';
const mac=(value:string)=>createHmac('sha256',secret()).update(value).digest('base64url');
const binding=(c:Config)=>mac(JSON.stringify(['inspector-free-v1',c.provider,c.model,c.key]));
function issue(data:object){if(secret().length<32)throw new Error('서버 서명 설정이 필요합니다.');const body=Buffer.from(JSON.stringify(data)).toString('base64url');return body+'.'+mac(body);}
function verify(token:string,purpose:string,c:Config){try{if(secret().length<32||token.length>3000)return null;const [body,sig,...extra]=token.split('.'),expected=mac(body);if(extra.length||!sig||sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;const v=JSON.parse(Buffer.from(body,'base64url').toString());return v.purpose===purpose&&v.binding===binding(c)&&Number.isSafeInteger(v.exp)&&v.exp>Date.now()&&v.iat<=Date.now()&&v.exp-v.iat<=(purpose==='challenge'?600000:DAYS*86400000)?v:null;}catch{return null;}}
export function freeRegistrationChallenge(c:Config){if(secret().length<32||c.provider!=='gemini'||!c.key)return undefined;const now=Date.now();return issue({purpose:'challenge',binding:binding(c),iat:now,exp:now+600000});}
export function registerFreeProject(c:Config,challenge:unknown,project:unknown,confirmed:unknown){
 if(typeof challenge!=='string'||!verify(challenge,'challenge',c))throw new Error('설정이 바뀌었거나 확인 화면이 만료됐습니다. 무료 상태를 다시 조회하세요.');
 if(confirmed!==true||typeof project!=='string'||!/^[-a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project))throw new Error('Google 콘솔에서 확인한 프로젝트 ID와 확인 체크가 필요합니다.');
 const now=Date.now();return issue({purpose:'profile',binding:binding(c),project,iat:now,exp:now+DAYS*86400000});
}
export function readFreeProfile(c:Config,token?:string){return token?verify(token,'profile',c):null;}
export function freeProfileCookie(req:any){const value=String(req.headers?.cookie||'').split(';').find(v=>v.trim().startsWith(NAME+'='));return value?value.trim().slice(NAME.length+1):undefined;}
export function writeFreeProfileCookie(res:any,token=''){res.setHeader('Set-Cookie',`${NAME}=${token}; Path=/api/admin/inspector; HttpOnly; Secure; SameSite=Strict; Max-Age=${token?DAYS*86400:0}`);}

import {createHash} from 'node:crypto';
type Config={provider:string;model:string;key:string};
/** Non-secret verification metadata, restricted to this exact key/model and 30 days. */
export function serverFreeRegistration(c:Config){
 try{const v=JSON.parse(process.env.PSI_INSPECTOR_FREE_PROJECT_REGISTRATION||'null');if(!v||v.version!==1||v.provider!==c.provider||v.model!==c.model||!c.key||v.keySha256!==createHash('sha256').update(c.key).digest('hex')||typeof v.projectId!=='string'||!/^[-a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(v.projectId))return null;
 const iat=Date.parse(v.verifiedAt),exp=Date.parse(v.expiresAt),now=Date.now();if(!Number.isFinite(iat)||!Number.isFinite(exp)||iat>now||exp<=now||exp<=iat||exp-iat>30*86400000)return null;return {project:v.projectId,iat,exp};
 }catch{return null;}
}
export function inspectorKeyDiagnostics(c:Config){return {selectedKeySha256:c.key?createHash('sha256').update(c.key).digest('hex'):null,configuredGeminiKeys:['GEMINI_API_KEY_FREE','GEMINI_API_KEY'].flatMap(source=>{const key=process.env[source];return key?[{source,sha256:createHash('sha256').update(key).digest('hex')}]:[]})};}

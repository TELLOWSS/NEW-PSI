import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {generateInspectorValidator} from '../scripts/prepare-inspector-validator.mjs';
it('keeps the committed validator synchronized with the import schema',async()=>{
 expect(await readFile(new URL('../lib/inspector/visionValidator.generated.js',import.meta.url),'utf8')).toBe(await generateInspectorValidator());
});
it('imports and validates with JavaScript code generation disabled',async()=>{
 const {execFileSync}=await import('node:child_process');
 const result=execFileSync(process.execPath,['--disallow-code-generation-from-strings','--input-type=module','-e',`import validate from './lib/inspector/visionValidator.generated.js'; const valid={schema_version:'1.1',inspection_id:'i',photo_id:'p',source_photo_sha256:'a'.repeat(64),processing_mode:'CHATGPT_MANUAL',observed_facts:[{text:'가상🦺',visual_basis:'문구',confidence:'high'}],ai_hypotheses:[],requires_confirmation:[],recommended_controls:[],law_candidate_keywords:[],limitations:[]}; if(validate({}) || !validate(valid))process.exit(1); console.log('CSP-safe');`],{cwd:process.cwd(),encoding:'utf8'});
 expect(result.trim()).toBe('CSP-safe');
});

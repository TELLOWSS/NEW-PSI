import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const client=vi.hoisted(()=>vi.fn((..._args:any[])=>({server:true})));
vi.mock('@supabase/supabase-js',()=>({createClient:client}));
import {createSupabaseServerClient} from '../lib/server/supabaseServer';
const keys=['VITE_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SERVICE_KEY','SERVICE_ROLE_KEY','PSI_ADMIN_SECRET'];
beforeEach(()=>{for(const key of keys)vi.stubEnv(key,'');client.mockClear();});afterEach(()=>vi.unstubAllEnvs());
describe('Supabase server configuration classification',()=>{
 it('supports the standard private URL without using a public key',()=>{vi.stubEnv('SUPABASE_URL',' https://private.example ');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY',' server-key ');createSupabaseServerClient();expect(client).toHaveBeenCalledWith('https://private.example','server-key',expect.anything());});
 it('preserves deployed URL precedence and ignores whitespace-only aliases',()=>{vi.stubEnv('VITE_SUPABASE_URL',' ');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://legacy.example');vi.stubEnv('SUPABASE_URL','https://private.example');vi.stubEnv('SUPABASE_SERVICE_KEY','server-key');createSupabaseServerClient();expect(client.mock.calls[0]?.[0]).toBe('https://legacy.example');});
 it.each([['url','serviceRoleKey'],['url'],['serviceRoleKey']])('classifies missing configuration without values %#',(...missing)=>{
  if(!missing.includes('url'))vi.stubEnv('SUPABASE_URL','https://private.example');if(!missing.includes('serviceRoleKey'))vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','secret-that-must-not-be-logged');
  let error:any;try{createSupabaseServerClient();}catch(e){error=e;}expect(error).toMatchObject({code:'SUPABASE_SERVER_CONFIG_MISSING',missingConfig:missing});expect(JSON.stringify(error)).not.toContain('secret-that-must-not-be-logged');expect(client).not.toHaveBeenCalled();
 });
});

import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import registry from '../config/psi-product-boundaries.json';
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
describe('ATLAS product boundary: independent contractor cost and dual-entry Inspector',()=>{
    it('never auto-merges safety-expense/payroll ledgers into PSI or Inspector',()=>{
        const contractor=registry.rules['partner-safety-expense'];
        expect(contractor.autoMergeAllowed).toBe(false);
        expect(contractor.includeInInspector).toBe(false);
        expect(contractor.includeInPsiDashboard).toBe(false);
        expect(registry.rules['psi-core'].safetyCostAutoSync).toBe(false);
        expect(registry.rules['psi-inspector'].safetyExpenseAutoSync).toBe(false);
    });
    it('offers direct inspector URL without claiming separate tenant, auth, storage or billing',()=>{
        const inspector=registry.rules['psi-inspector'];
        expect(inspector.standaloneEntry).toBe('/inspector');
        expect(inspector.legacyEmbeddedEntry).toBe('/?mode=photo-inspector');
        expect(inspector.authRequired).toBe(true);
        expect(inspector.notYetIndependent).toContain('separate storage and billing');
        expect(read('index.tsx')).toContain("window.location.pathname.replace(/\\/$/, '') === '/inspector'");
        expect(read('pages/InspectorProduct.tsx')).toContain('href="/inspector"');
        expect(read('App.tsx')).toContain("mode === 'photo-inspector'");
    });
    it('enforces server-validated admin auth on standalone while reusing Inspector rather than another API',()=>{
        const standalone=read('pages/InspectorStandalone.tsx');
        for(const marker of ['refreshAdminAuthentication','loginAdmin','logoutAdmin',"<SafetyInspector onUnsavedChange={setUnsaved}/>",'사진점검에서 로그아웃'])expect(standalone).toContain(marker);
        expect(standalone).toContain('if(unsaved&&!window.confirm(');
        expect(standalone).not.toMatch(/localStorage\.getItem\(.+isAdminAuthenticated/);
        expect(standalone).not.toContain('psi_inspector_share_adopt');
    });
});

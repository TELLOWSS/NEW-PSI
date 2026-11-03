import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const file=(name:string)=>readFileSync(name,'utf8');
const visual=file('styles/psi-platform-workspaces.css');
const operator=file('pages/OperationalApp.tsx');
const education=file('pages/EducationReturn.tsx');
const ocr=file('pages/OcrAnalysis.tsx');
const survey=file('pages/SurveyIntelligence.tsx');
const reports=file('pages/Reports.tsx');
const monthly=file('pages/MonthlyGuidanceReport.tsx');
const studio=file('pages/A4EducationMaterial.tsx');
const product=file('pages/InspectorProduct.tsx');

describe('PSI R74–R77 secondary workspaces product design contract',()=>{
  it('loads visual rules ONLY in admin operational app and never public product',()=>{
    expect(operator).toContain("import '../styles/psi-platform-field-canvas.css';");
    expect(operator).toContain("import '../styles/psi-platform-workspaces.css';");
    expect(operator.indexOf('psi-platform-workspaces.css')).toBeGreaterThan(operator.indexOf('psi-platform-field-canvas.css'));
    expect(product).not.toContain('psi-platform-workspaces.css');
    expect(visual).not.toMatch(/@import\b|https?:\/\//);
    expect(visual).toContain('.psi-platform-field-canvas [data-psi-screen]');
  });
  it('keeps source assessment -> education output + manager evidence boundaries',()=>{
    expect(education).toContain('data-psi-screen="education-return"');
    expect(education).toContain('data-education-return="hero"');
    expect(education).toContain('data-education-return="practice-verification"');
    expect(education).toContain('data-education-return="outputs"');
    expect(education).toContain("onNavigateToPage('reports')");
    expect(education).toContain("onNavigateToPage('monthly-guidance-report')");
    expect(education).toContain("onNavigateToPage('a4-education-material')");
    expect(education).toContain('현장 위험이 없다는 뜻은 아닙니다');
  });
  it('retains OCR routes and paid OCR explicit approval without behavioral rewrites',()=>{
    expect(ocr).toContain('data-psi-screen="ocr-analysis"');
    expect(ocr).toContain('id="ocr-start-guide"');
    expect(ocr).toContain("openWorkflowDestination('new')");
    expect(ocr).toContain("setWorkflowIntent('backup')");
    expect(ocr).toContain("openWorkflowDestination('records')");
    expect(ocr).toContain('paidOcrApprovalPrompt && (');
    expect(ocr).toContain('유료 분석은 별도 승인 후에만 실행됩니다');
  });
  it('preserves survey sample limitation and management baseline workflow',()=>{
    expect(survey).toContain('data-psi-screen="survey-intelligence"');
    expect(survey).toContain('MIN_COMPARABLE_SAMPLE');
    expect(survey).toContain('persistSurveyRiskBaselines');
    expect(survey).toContain('근로자');
    expect(visual).toContain('[data-psi-screen="survey-intelligence"]');
  });
  it('leaves report verification and print materials isolated',()=>{
    expect(reports).toContain('data-psi-screen="reports"');
    expect(reports).toContain('latestVerification');
    expect(reports).toContain('isPackagingEvidence');
    expect(monthly).toContain('data-psi-screen="monthly-guidance"');
    expect(monthly).toContain('관리자 승인 전 초안');
    expect(monthly).toContain('guidance-print');
    expect(studio).toContain('data-psi-screen="a4-education-studio"');
    expect(studio).toContain('psi-enterprise-hero no-print');
    expect(visual).toContain('@media print');
    expect(visual).toContain('data-report-page');
  });
  it('preserves touch targets and reduced-motion support without overriding hazard semantics',()=>{
    expect(visual).toContain('min-height:44px');
    expect(visual).toContain('min-height:46px');
    expect(visual).toContain(':focus-visible');
    expect(visual).toContain('@media(max-width:630px)');
    expect(visual).toContain('@media(max-width:360px)');
    expect(visual).toContain('@media(prefers-reduced-motion:reduce)');
    expect(visual).not.toContain('--psi-danger:');
    expect(visual).not.toContain('--psi-warning:');
  });
});

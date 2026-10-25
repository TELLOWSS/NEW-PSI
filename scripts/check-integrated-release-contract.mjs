import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const checks=[
 ['App Inspector',read('App.tsx').includes("onOpenInspector={() => navigateToPage('safety-inspector')}")],
 ['App monthly education',read('App.tsx').includes('<MonthlyGuidanceReport workerRecords={workerRecords} onNavigateToPage={navigateToPage} />')],
 ['Safe site issue local writes',read('pages/SiteIssueManagement.tsx').includes('persistSiteIssueList')],
 ['Performance same score rules',read('pages/PerformanceAnalysis.tsx').includes('getValidPerformanceScores')],
 ['Performance validity helper',read('utils/performanceScoreSignals.ts').includes('hasValidSafetyScore')],
 ['Education routing',read('pages/MonthlyGuidanceReport.tsx').includes("onNavigateToPage('a4-education-material')")],
 ['Standalone Inspector auth',read('pages/InspectorStandalone.tsx').includes('refreshAdminAuthentication')],
 ['Capacity tab-only diagnostics',read('components/management/FreeTierCapacityPlanner.tsx').includes('getClientRequestDiagnostics')],
 ['Version fingerprint',read('components/management/OperatorReleaseProof.tsx').includes('currentReleaseSha')],
 ['Release proof gate',read('pages/Settings.tsx').includes('<OperatorReleaseProof />')],
 ['Worker program administrator-only',JSON.parse(read('config/psi-product-boundaries.json')).rules['psi-core'].programSharedWithWorkers===false],
 ['Partner expense product separate',JSON.parse(read('config/psi-product-boundaries.json')).rules['partner-safety-expense'].autoMergeAllowed===false],
 ['Score audit includes helper',read('scripts/audit-core-metrics.mjs').includes("file: 'utils/performanceScoreSignals.ts'")],
];
const fails=checks.filter(([,ok])=>!ok).map(([title])=>title);
if(fails.length){console.error('[integrated-release] FAIL '+fails.join(' | '));process.exitCode=1;}
else console.log('[integrated-release] PASS: '+checks.length+' compatibility and product-boundary checks.');

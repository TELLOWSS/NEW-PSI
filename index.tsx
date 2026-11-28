import React from 'react';
import ReactDOM from 'react-dom/client';
const OperationalApp = React.lazy(() => import('./pages/OperationalApp'));
const InspectorReply = React.lazy(() => import('./pages/InspectorReply'));
const InspectorProduct = React.lazy(() => import('./pages/InspectorProduct'));
const InspectorStandalone = React.lazy(() => import('./pages/InspectorStandalone'));
const FieldCamera = React.lazy(() => import('./pages/FieldCamera'));
const TenantAccess = React.lazy(() => import('./pages/TenantAccess'));
const WorkerTenantEducation = React.lazy(() => import('./pages/WorkerTenantEducation'));

const RUNTIME_RECOVERY_RELOAD_KEY = 'psi_runtime_recovery_reload_once';
const VERSION_MISMATCH_RELOAD_KEY = 'psi_version_mismatch_reload_once';
const BOOTSTRAP_FATAL_RENDER_DELAY_MS = 900;

let pendingFatalTimer: number | null = null;

const isAppMounted = (): boolean => document.documentElement.dataset.psiMounted === '1';

const clearPendingFatalTimer = () => {
  if (pendingFatalTimer !== null) {
    window.clearTimeout(pendingFatalTimer);
    pendingFatalTimer = null;
  }
};

const isRecoverableBootstrapMessage = (message: string): boolean => {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('cannot access')
    || normalized.includes('before initialization')
    || normalized.includes('failed to fetch dynamically imported module')
    || normalized.includes('chunkloaderror')
    || normalized.includes('loading chunk');
};

const reloadWithCacheBusting = () => {
  const url = new URL(window.location.href);
  url.searchParams.set('__v', String(Date.now()));
  window.location.replace(url.toString());
};

const tryRuntimeRecoveryReload = (message: string): boolean => {
  if (typeof window === 'undefined') return false;
  if (!isRecoverableBootstrapMessage(message)) return false;

  const hasRetried = window.sessionStorage.getItem(RUNTIME_RECOVERY_RELOAD_KEY) === '1';
  if (hasRetried) return false;

  window.sessionStorage.setItem(RUNTIME_RECOVERY_RELOAD_KEY, '1');
  reloadWithCacheBusting();
  return true;
};

const getCurrentBundlePath = (): string | null => {
  const matches = import.meta.url.match(/\/assets\/index-[^?#]+\.js/i);
  return matches?.[0] || null;
};

const getLatestBundlePathFromHtml = (html: string): string | null => {
  const matches = html.match(/\/assets\/index-[^"']+\.js/i);
  return matches?.[0] || null;
};

const checkVersionMismatchAndReload = async () => {
  if (typeof window === 'undefined') return;
  // Do not initiate a version check after the browser has gone offline.
  if (!navigator.onLine) return;
  if (window.sessionStorage.getItem(VERSION_MISMATCH_RELOAD_KEY) === '1') return;

  const currentBundlePath = getCurrentBundlePath();
  if (!currentBundlePath) return;

  try {
    const response = await fetch('/', { cache: 'no-store' });
    if (!response.ok) return;
    const html = await response.text();
    const latestBundlePath = getLatestBundlePathFromHtml(html);
    if (!latestBundlePath) return;

    if (latestBundlePath !== currentBundlePath) {
      window.sessionStorage.setItem(VERSION_MISMATCH_RELOAD_KEY, '1');
      reloadWithCacheBusting();
    }
  } catch {
    // ignore network errors
  }
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const BootstrapMountSignal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  React.useEffect(() => {
    document.documentElement.dataset.psiMounted = '1';
    clearPendingFatalTimer();
  }, []);
  return <>{children}</>;
};

const renderFatalBootstrapError = (message: string) => {
  if (isAppMounted()) return;
  rootElement.replaceChildren();
  const outer = document.createElement('div');
  outer.setAttribute('style', 'min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;');
  const card = document.createElement('div');
  card.setAttribute('style', 'max-width:680px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px;box-shadow:0 8px 30px rgba(0,0,0,.06);');
  const heading = document.createElement('h2');
  heading.setAttribute('style', 'margin:0 0 8px;font-size:20px;color:#0f172a;');
  heading.textContent = '앱 초기화 오류';
  const desc = document.createElement('p');
  desc.setAttribute('style', 'margin:0 0 12px;color:#475569;line-height:1.6;');
  desc.textContent = '화면 로딩 중 문제가 발생했습니다. 브라우저 새로고침 후에도 동일하면 운영자에게 아래 메시지를 전달해주세요.';
  const pre = document.createElement('pre');
  pre.setAttribute('style', 'margin:0;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:12px;overflow:auto;color:#334155;font-size:12px;white-space:pre-wrap;word-break:break-word;');
  pre.textContent = message;
  card.append(heading, desc, pre);
  outer.appendChild(card);
  rootElement.appendChild(outer);
};

const scheduleFatalBootstrapError = (message: string) => {
  if (isAppMounted()) return;
  clearPendingFatalTimer();
  pendingFatalTimer = window.setTimeout(() => {
    pendingFatalTimer = null;
    if (!isAppMounted()) {
      renderFatalBootstrapError(message);
    }
  }, BOOTSTRAP_FATAL_RENDER_DELAY_MS);
};

window.addEventListener('error', (event) => {
  const msg = event.error?.message || event.message || 'Unknown startup error';
  if (tryRuntimeRecoveryReload(msg)) return;
  scheduleFatalBootstrapError(msg);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = typeof reason === 'string' ? reason : (reason?.message || 'Unhandled promise rejection');
  if (tryRuntimeRecoveryReload(msg)) return;
  scheduleFatalBootstrapError(msg);
});

const normalizedPath = window.location.pathname.replace(/\/$/, '') || '/';
const root = ReactDOM.createRoot(rootElement);
try {
  root.render(
    <React.StrictMode>
      <BootstrapMountSignal>
      {normalizedPath === '/inspection-reply' ? (<React.Suspense fallback={<p role="status">조치 회신 화면 준비 중…</p>}><InspectorReply/></React.Suspense>) : normalizedPath === '/product' ? (
        <React.Suspense fallback={<p role="status">NEW-PSI 제품 체험을 준비합니다…</p>}><InspectorProduct/></React.Suspense>
      ) : normalizedPath === '/camera' ? (
        <React.Suspense fallback={<p role="status">현장 카메라를 준비합니다…</p>}><FieldCamera/></React.Suspense>
      ) : window.location.pathname.replace(/\/$/, '') === '/inspector' ? (
        <React.Suspense fallback={<p role="status">독립 사진점검 화면을 준비합니다…</p>}><InspectorStandalone/></React.Suspense>
      ) : normalizedPath === '/saas/education' ? (
        <React.Suspense fallback={<p role="status">개인 교육 화면을 불러오는 중…</p>}><WorkerTenantEducation /></React.Suspense>
      ) : normalizedPath === '/saas/access' ? (
        <React.Suspense fallback={<p role="status">기업 계정 화면을 불러오는 중…</p>}>
          <TenantAccess />
        </React.Suspense>
      ) : (
      <React.Suspense fallback={<p role="status">안전 운영 화면을 불러오는 중…</p>}><OperationalApp/></React.Suspense>
      )}
      </BootstrapMountSignal>
    </React.StrictMode>
  );
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  if (tryRuntimeRecoveryReload(msg)) {
    // reload triggered
  } else {
  scheduleFatalBootstrapError(msg);
  }
}

setTimeout(() => {
  void checkVersionMismatchAndReload();
}, 1200);

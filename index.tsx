import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DevModeProvider } from './contexts/DevModeContext';

const RUNTIME_RECOVERY_RELOAD_KEY = 'psi_runtime_recovery_reload_once';
const VERSION_MISMATCH_RELOAD_KEY = 'psi_version_mismatch_reload_once';

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

const renderFatalBootstrapError = (message: string) => {
  rootElement.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;">
      <div style="max-width:680px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px;box-shadow:0 8px 30px rgba(0,0,0,.06);">
        <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">앱 초기화 오류</h2>
        <p style="margin:0 0 12px;color:#475569;line-height:1.6;">화면 로딩 중 문제가 발생했습니다. 브라우저 새로고침 후에도 동일하면 운영자에게 아래 메시지를 전달해주세요.</p>
        <pre style="margin:0;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:12px;overflow:auto;color:#334155;font-size:12px;">${message}</pre>
      </div>
    </div>
  `;
};

window.addEventListener('error', (event) => {
  const msg = event.error?.message || event.message || 'Unknown startup error';
  if (tryRuntimeRecoveryReload(msg)) return;
  renderFatalBootstrapError(msg);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = typeof reason === 'string' ? reason : (reason?.message || 'Unhandled promise rejection');
  if (tryRuntimeRecoveryReload(msg)) return;
  renderFatalBootstrapError(msg);
});

const root = ReactDOM.createRoot(rootElement);
try {
  root.render(
    <React.StrictMode>
      <DevModeProvider>
        <App />
      </DevModeProvider>
    </React.StrictMode>
  );
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  if (tryRuntimeRecoveryReload(msg)) {
    // reload triggered
  } else {
  renderFatalBootstrapError(msg);
  }
}

setTimeout(() => {
  void checkVersionMismatchAndReload();
}, 1200);
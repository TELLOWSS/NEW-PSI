import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

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
  renderFatalBootstrapError(msg);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = typeof reason === 'string' ? reason : (reason?.message || 'Unhandled promise rejection');
  renderFatalBootstrapError(msg);
});

const root = ReactDOM.createRoot(rootElement);
try {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  renderFatalBootstrapError(msg);
}
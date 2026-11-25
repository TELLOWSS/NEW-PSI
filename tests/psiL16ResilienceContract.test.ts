import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');

describe('L16 local resilience evidence and no false network guarantees',()=>{
 it('observes only browser online/offline events; never calls a server as a connectivity probe',()=>{
  const entry=source('field-local/main.tsx');
  expect(entry).toContain("const [browserOnline,setBrowserOnline]=useState(()=>navigator.onLine)");
  expect(entry).toContain("window.addEventListener('online',update)");
  expect(entry).toContain("window.addEventListener('offline',update)");
  expect(entry).toContain("window.removeEventListener('online',update)");
  expect(entry).toContain("window.removeEventListener('offline',update)");
  expect(entry).toContain('data-psi-l16-connectivity=');
  expect(entry).toContain('브라우저 신호일 뿐 현장 인터넷 속도·서버 접속 성공을 확인하지 않습니다.');
  expect(entry).toContain('연결 복구 시 클라우드로 자동 전송되지 않습니다.');
  expect(entry).not.toMatch(/fetch\s*\(|postAdminJson|sendBeacon|setInterval|navigator\.connection|getBattery/);
 });
 it('preserves separate manual offline preparation and immutable photo-record boundaries',()=>{
  const entry=source('field-local/main.tsx');
  expect(entry).toContain('VERIFY_LOCAL_ASSETS');
  expect(entry).toContain("scope:'/field-local/'");
  expect(entry).toContain('InspectorLocalDraft offlineEntry');
  expect(entry).toContain('저장 공간 확인');
  expect(entry).toContain('기록 지속 보관 요청');
  expect(entry).toContain('이 기기 오프라인 준비');
  expect(entry).toContain('이 화면은 이 브라우저에 저장한 직접 점검만 엽니다.');
 });
 it('requires independent browser navigation and local record reopen evidence, no synthetic battery score',()=>{
  const qa=source('scripts/verify-psi-l16-resilience.mjs');
  const workflow=source('.github/workflows/psi-company-wide.yml');
  expect(qa).toContain('context.setOffline(true)');
  expect(qa).toContain('context.setOffline(false)');
  expect(qa).toContain("name:'PSI 기기 점검'");
  expect(qa).toContain('이 브라우저에 보관된 점검 1건');
  expect(qa).toContain('navigator.onLine');
  expect(qa).not.toMatch(/getBattery|batteryScore|fakeBattery|safetyClearance|setItem\(/);
  expect(workflow).toContain('node scripts/verify-psi-l16-resilience.mjs');
 });
});

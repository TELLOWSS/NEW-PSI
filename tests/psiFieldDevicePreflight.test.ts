import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildFieldDeviceReport,formatFieldDeviceReport,type FieldDeviceFacts} from '../field-local/devicePreflight';

const facts:FieldDeviceFacts={
 online:true,secureContext:true,standalone:false,indexedDbApi:true,
 cameraApi:true,workerActive:true,offlineAssetsVerified:true,persistenceGranted:false
};
const source=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');

describe('L39 P3 physical device diagnostic is only a privacy-safe manual preflight',()=>{
 it('never promotes capability detection to real device UAT, server receipt or site approval',()=>{
  const report=buildFieldDeviceReport(facts,'2026-11-22T12:00:00.000Z');
  expect(report.schema).toBe('psi-field-device-preflight-v1');
  expect(report.outcome).toBe('DIAGNOSTIC_ONLY');
  expect(report.realDeviceUatApproved).toBe(false);
  expect(report.noAutomaticUpload).toBe(true);
  expect(report.checks).toHaveLength(8);
  expect(report.checks.find(x=>x.id==='camera-api')?.value).toBe('API 감지');
  expect(report.checks.find(x=>x.id==='offline-assets')?.limit).toContain('비행기 모드 재실행');
  expect(formatFieldDeviceReport(report)).toContain('실기기 인수 승인 아님');
  expect(formatFieldDeviceReport(report)).toContain('RELEASE=BLOCKED');
 });
 it('unknown or unavailable capabilities never become verified claims',()=>{
  const report=buildFieldDeviceReport({...facts,online:false,workerActive:null,
   offlineAssetsVerified:null,persistenceGranted:null,cameraApi:false},'2026-11-22T12:00:00.000Z');
  expect(report.checks.find(x=>x.id==='connection-signal')?.value).toBe('오프라인');
  expect(report.checks.find(x=>x.id==='worker')?.value).toBe('확인 불가');
  expect(report.checks.find(x=>x.id==='offline-assets')?.value).toBe('확인 불가');
  expect(report.checks.find(x=>x.id==='persistent-storage')?.value).toBe('확인 불가');
  expect(report.checks.find(x=>x.id==='camera-api')?.value).toBe('API 미감지');
  expect(report.realDeviceUatApproved).toBe(false);
 });
 it('requires a user gesture, has no automatic upload and no identification fields',()=>{
  const moduleSource=source('field-local/devicePreflight.ts');
  const entry=source('field-local/main.tsx');
  const browser=source('scripts/verify-psi-l16-resilience.mjs');
  expect(entry).toContain('runFieldDevicePreflight(verifyWorker)');
  expect(entry).toContain('onClick={()=>void checkDevice()}');
  expect(entry).toContain('onClick={()=>void copyDeviceReport()}');
  expect(browser).toContain('p3-synthetic-device-preflight');
  expect(moduleSource).not.toMatch(/fetch\s*\(|sendBeacon|XMLHttpRequest|geolocation|userAgent|deviceMemory|hardwareConcurrency|service_role|workerId|localStorage|sessionStorage/);
  expect(entry).not.toMatch(/navigator\.geolocation|getBattery|sendBeacon/);
 });
});

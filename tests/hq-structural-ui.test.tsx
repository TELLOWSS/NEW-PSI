import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import StructuralHQWorkbench from '../components/hq/StructuralHQWorkbench';
import CorrectiveActionWorkbench from '../components/hq/CorrectiveActionWorkbench';

it('renders six HQ modules without accessing live incident data or AI providers',()=>{
  const markup=renderToStaticMarkup(React.createElement(StructuralHQWorkbench));
  expect(markup).toContain('hq-structural-workbench');
  expect(markup).toContain('지하 RC');
  expect(markup).toContain('일반 형틀');
  expect(markup).toContain('기초·지하·지상·옥탑');
  for(const name of ['공정별 위험지도','본사 행선지·점검','사고사례 DB','대표이사·본사 교육','사고조사 지원','조치·재점검']) {
    expect(markup).toContain(name);
  }
  expect(markup).toContain('현재 화면의 메모리에만 존재');
  expect(markup).not.toContain('작업재개 승인 완료');
});

it('renders the corrective action empty state and no authenticated completion control',()=>{
  const markup=renderToStaticMarkup(React.createElement(CorrectiveActionWorkbench,{cases:[],onOpenCases:()=>{}}));
  expect(markup).toContain('등록한 개선조치 계획이 없습니다');
  expect(markup).toContain('실제 완료·작업재개 승인 기능이 없습니다');
  expect(markup).toContain('사고사례 임시 등록 화면으로 이동');
  expect(markup).not.toContain('검증완료');
});

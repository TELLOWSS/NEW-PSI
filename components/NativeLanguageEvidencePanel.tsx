import React, { useMemo } from 'react';
import type { WorkerRecord } from '../types';
import { buildNativeLanguageEvidenceCsv, summarizeNativeLanguageEvidence } from '../utils/nativeLanguageEvidence';

export const NativeLanguageEvidencePanel: React.FC<{ records: WorkerRecord[] }> = ({ records }) => {
    const rows = useMemo(() => summarizeNativeLanguageEvidence(records), [records]);
    const download = () => {
        const time = new Date().toISOString();
        const url = URL.createObjectURL(new Blob([buildNativeLanguageEvidenceCsv(rows, time)], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `PSI-언어별-품질점검-${time.slice(0, 10)}.csv`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return <details className="border-b border-slate-200 bg-indigo-50 p-4 text-slate-800">
        <summary className="cursor-pointer font-bold">모국어 품질 근거 · 언어별 점검 ({records.length}건)</summary>
        <p className="my-3 text-sm">현재 PC의 전체 기록을 추가 AI 호출 없이 검사합니다. 번역 누락·문자 혼입·숫자 차이는 자동으로 점검할 수 있지만, 현장 용어의 정확성·자연스러움은 원어민 검수가 필요합니다. 등록된 언어만 표시하며 자료가 없는 언어의 품질은 확인되지 않았습니다.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead><tr>{['언어', '기록', '구조 완결', '자동 점검 통과', '숫자 대조 필요', '원어민 검수'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.language} className="border-t border-indigo-100">
                <td className="p-2">{row.language}</td><td className="p-2">{row.records}</td><td className="p-2">{row.complete}/{row.records}</td><td className="p-2">{row.checksPassed}/{row.records}</td><td className="p-2">{row.numberWarnings}</td><td className="p-2">증빙 미등록</td>
            </tr>)}</tbody>
        </table></div>
        <p className="my-3 text-sm">품질 개선 절차: 언어별 현장 용어집 확정 → 원문·한국어·모국어 문항 대조 → 원어민이 의미·자연스러움·금지/의무·숫자/단위를 검수 → 수정본을 관리자 원문 대조에서 반영 → 같은 표본으로 재검사. 역번역과 AI 자기평가만으로 품질을 인증하지 않습니다.</p>
        <button type="button" onClick={download} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-bold text-white">언어별 점검 근거 CSV 저장</button>
    </details>;
};

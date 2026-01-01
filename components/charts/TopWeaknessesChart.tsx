
import React, { useState, useMemo } from 'react';
import type { WorkerRecord } from '../../types';

interface TopWeaknessesChartProps {
    records: WorkerRecord[];
}

const weaknessDetails: { [key: string]: string[] } = {
    '구체적인 안전 계획 부족': [
        '위험성 평가 및 대응책에 대한 이해 부족.',
        '작업 전 안전 점검(TBM) 내용의 형식화.',
        '돌발 상황에 대한 비상 대응 계획 미흡.',
    ],
    '기타': [
        '정리정돈 상태 불량.',
        '보호구 착용 상태 미흡.',
        '안전 수칙 미준수 사례 발생.',
    ],
    '고소작업': [
        '안전벨트 미체결 또는 부적절한 사용.',
        '작업 발판의 불안정한 설치 상태.',
        '추락 방지망 설치 미흡.',
    ],
    '업무와 무관한 위험성 평가': [
        '수행 작업과 다른 위험 요인 기재.',
        '위험성 평가의 중요성에 대한 인식 부족.',
        '형식적인 서류 작성 경향.',
    ],
     '화재위험': [
        '인화성 물질 관리 미흡.',
        '소화기 비치 상태 불량.',
        '용접 작업 시 방화 조치 미흡.',
    ],
    '안전장비 미착용': [
        '안전모, 안전화 등 기본 보호구 미착용.',
        '특수 작업 시 필요한 보호구 미지급 또는 미착용.',
        '보호구의 중요성에 대한 교육 부족.'
    ]
};

const colors = [
    { bg: 'from-blue-500 to-sky-400', text: 'text-blue-600' },
    { bg: 'from-yellow-500 to-amber-400', text: 'text-yellow-600' },
    { bg: 'from-purple-500 to-violet-400', text: 'text-purple-600' },
];

const WeaknessItem: React.FC<{
    area: string;
    count: number;
    maxCount: number;
    color: { bg: string, text: string };
    isOpen: boolean;
    onToggle: () => void;
}> = ({ area, count, maxCount, color, isOpen, onToggle }) => {
    const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
    const details = weaknessDetails[area] || ['세부 분석 데이터가 없습니다.'];

    return (
        <div className="overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between text-left p-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
                <div className="flex-1 space-y-1.5">
                    <p className="font-semibold text-slate-700 text-sm">{area}</p>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                        <div
                            className={`bg-gradient-to-r ${color.bg} h-3 rounded-full transition-all duration-500`}
                            style={{ width: `${percentage}%` }}
                        ></div>
                    </div>
                </div>
                <div className="flex items-center">
                    <span className={`font-bold text-base ml-4 w-12 text-right ${color.text}`}>{count}회</span>
                    <svg className={`w-5 h-5 ml-2 transform transition-transform text-slate-400 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            </button>
            <div className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                 <div className="px-3 pb-3 mt-1">
                    <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                         <h4 className="font-semibold text-xs text-slate-600 mb-2">세부 분석 항목</h4>
                         <ul className="list-disc list-inside space-y-1 text-xs text-slate-500">
                            {details.map((detail, index) => <li key={index}>{detail}</li>)}
                         </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const TopWeaknessesChart: React.FC<TopWeaknessesChartProps> = ({ records }) => {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    const sortedWeaknesses = useMemo(() => {
        // Defensive check: ensure weakAreas is an array
        const weaknessCounts = records.flatMap(r => Array.isArray(r.weakAreas) ? r.weakAreas : []).reduce((acc, area) => {
            acc[area] = (acc[area] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        return Object.entries(weaknessCounts)
            .sort((a, b) => (b[1] as number) - (a[1] as number))
            .slice(0, 3);
    }, [records]);
    
    const maxCount = useMemo(() => {
        return sortedWeaknesses.length > 0 ? sortedWeaknesses[0][1] : 0;
    }, [sortedWeaknesses]);


    const handleToggle = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    if (sortedWeaknesses.length === 0) {
        return <div className="flex items-center justify-center h-full text-slate-500">데이터가 없습니다.</div>;
    }

    return (
        <div className="space-y-2">
           {sortedWeaknesses.map(([area, count], index) => (
               <WeaknessItem
                   key={area}
                   area={area}
                   count={count}
                   maxCount={maxCount}
                   color={colors[index % colors.length]}
                   isOpen={openIndex === index}
                   onToggle={() => handleToggle(index)}
               />
           ))}
        </div>
    );
};

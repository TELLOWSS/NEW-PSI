
import React, { useState, useMemo, useEffect } from 'react';
import type { WorkerRecord } from '../types';

interface SafetyActionCenterProps { workerRecords: WorkerRecord[]; }
interface ActionItem { id: string; text: string; type: 'critical' | 'routine' | 'analysis'; completed: boolean; }

export const SafetyActionCenter: React.FC<SafetyActionCenterProps> = ({ workerRecords }) => {
    const [tasks, setTasks] = useState<ActionItem[]>([]);
    const [progress, setProgress] = useState(0);

    // Data fingerprint to prevent infinite loops
    const fingerprint = useMemo(() => `${workerRecords.length}-${workerRecords.reduce((s, r) => s + r.safetyScore, 0)}`, [workerRecords]);

    useEffect(() => {
        if (workerRecords.length === 0) return setTasks([{ id: 'init', text: '데이터 업로드 필요', type: 'critical', completed: false }]);
        
        const lowScoreCount = workerRecords.filter(w => w.safetyLevel === '초급').length;
        const weakMap = workerRecords.flatMap(r => r.weakAreas).reduce((acc: Record<string, number>, cur: string) => { acc[cur] = (acc[cur] || 0) + 1; return acc; }, {} as Record<string, number>);
        const topEntry = Object.entries(weakMap).sort((a, b) => b[1] - a[1])[0];
        const topWeakness = topEntry ? topEntry[0] : '일반 안전';

        const newTasks: ActionItem[] = [
            { id: 't1', text: `TBM: '${topWeakness}' 집중 교육`, type: 'routine', completed: false },
            { id: 't2', text: `고위험 근로자 ${lowScoreCount}명 관리`, type: 'critical', completed: false },
            { id: 't3', text: '현장 순회 점검', type: 'routine', completed: false }
        ];

        setTasks(prev => {
            // Merge to keep completed state
            return newTasks.map(n => {
                const exist = prev.find(p => p.id === n.id);
                return exist ? { ...n, completed: exist.completed } : n;
            });
        });
    }, [fingerprint]);

    useEffect(() => {
        const done = tasks.filter(t => t.completed).length;
        setProgress(tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0);
    }, [tasks]);

    return (
        <div className="bg-gradient-to-br from-indigo-600 to-blue-600 rounded-2xl shadow-lg p-6 text-white h-full flex flex-col">
            <h3 className="text-xl font-bold mb-4">Smart Action Center</h3>
            <div className="w-full bg-white/20 rounded-full h-2 mb-4"><div className="bg-white h-2 rounded-full transition-all" style={{width: `${progress}%`}}></div></div>
            <div className="flex-1 overflow-y-auto space-y-2">
                {tasks.map(t => (
                    <div key={t.id} onClick={() => setTasks(p => p.map(i => i.id === t.id ? {...i, completed: !i.completed} : i))} 
                         className={`p-3 rounded-lg border cursor-pointer flex items-center ${t.completed ? 'bg-indigo-900/50 border-transparent opacity-60' : 'bg-white/10 border-white/20 hover:bg-white/20'}`}>
                        <div className={`w-5 h-5 rounded border mr-3 flex items-center justify-center ${t.completed ? 'bg-green-400 border-green-400' : ''}`}>
                            {t.completed && <svg className="w-4 h-4 text-indigo-900" fill="currentColor" viewBox="0 0 20 20"><path d="M16.7 5.3l-8 8-4-4-1.4 1.4 5.4 5.4 9.4-9.4z"/></svg>}
                        </div>
                        <span className="text-sm">{t.text}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

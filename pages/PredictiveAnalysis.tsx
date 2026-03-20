
import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { WorkerRecord } from '../types';

// 관리 직군 필터링 함수
const isManagementRole = (field: string) => 
    /관리|팀장|부장|과장|기사|공무|소장/.test(field);

// 온톨로지 노드 및 링크 타입 정의
interface Node {
    id: string;
    group: 'worker' | 'risk' | 'job' | 'action';
    value: number; // 크기 결정
    label: string;
}

interface Link {
    source: string;
    target: string;
    value: number; // 굵기 결정
}

const clampOntologyZoom = (value: number) => Math.min(1.8, Math.max(0.7, Number(value.toFixed(2))));

const getOntologyLabelLimit = (group: Node['group']) => {
    if (group === 'worker') return 8;
    if (group === 'action') return 10;
    return 9;
};

const shortenOntologyLabel = (label: string, group: Node['group']) => {
    const normalized = String(label || '').trim();
    const limit = getOntologyLabelLimit(group);
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
};

const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
};

// 간단한 포스 그래프 시각화 컴포넌트 (SVG 기반)
const OntologyGraph: React.FC<{ nodes: Node[], links: Link[]; spacingStrength: number }> = ({ nodes, links, spacingStrength }) => {
    // 렌더링 최적화를 위해 노드 좌표를 미리 계산 (시뮬레이션 단순화)
    const [positions, setPositions] = useState<Record<string, { x: number, y: number }>>({});

    useEffect(() => {
        const newPos: Record<string, { x: number, y: number }> = {};
        const width = 1000;
        const height = 700;
        const margin = 28;
        const centerX = width / 2;
        const centerY = height / 2;

        // 그룹별 배치 전략
        nodes.forEach((node, i) => {
            const angle = (i / nodes.length) * 2 * Math.PI;
            let radius = 240;
            
            if (node.group === 'risk') radius = 95; // 위험요인은 중앙
            if (node.group === 'job') radius = 210; // 공종은 중간
            if (node.group === 'worker') radius = 285; // 근로자는 외곽
            if (node.group === 'action') radius = 320; // 조치는 최외곽

            // 노드 ID 해시를 이용한 랜덤성 부여 (일관된 위치 보장)
            const hash = node.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const noise = (hash % 30) - 15;

            newPos[node.id] = {
                x: centerX + Math.cos(angle) * radius + noise,
                y: centerY + Math.sin(angle) * radius + noise
            };
        });

        const relaxIterations = 16 + Math.round(spacingStrength * 12);
        const minDistance = 30 + Math.round(spacingStrength * 24);
        const nodeIds = nodes.map((node) => node.id);

        for (let iteration = 0; iteration < relaxIterations; iteration++) {
            for (let i = 0; i < nodeIds.length; i++) {
                for (let j = i + 1; j < nodeIds.length; j++) {
                    const leftId = nodeIds[i];
                    const rightId = nodeIds[j];
                    const left = newPos[leftId];
                    const right = newPos[rightId];
                    if (!left || !right) continue;

                    const dx = right.x - left.x;
                    const dy = right.y - left.y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 0.001;

                    if (distance >= minDistance) continue;

                    const push = (minDistance - distance) / 2;
                    const ux = dx / distance;
                    const uy = dy / distance;

                    left.x -= ux * push;
                    left.y -= uy * push;
                    right.x += ux * push;
                    right.y += uy * push;
                }
            }

            for (const nodeId of nodeIds) {
                const point = newPos[nodeId];
                if (!point) continue;
                point.x = Math.min(width - margin, Math.max(margin, point.x));
                point.y = Math.min(height - margin, Math.max(margin, point.y));
            }
        }

        setPositions(newPos);
    }, [nodes, spacingStrength]);

    return (
        <svg viewBox="0 0 1000 700" className="w-full h-full bg-slate-900 rounded-2xl shadow-inner border border-slate-700">
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="28" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
                </marker>
            </defs>
            {/* Links */}
            {links.map((link, i) => {
                const start = positions[link.source];
                const end = positions[link.target];
                if (!start || !end) return null;
                return (
                    <line 
                        key={i} 
                        x1={start.x} y1={start.y} 
                        x2={end.x} y2={end.y} 
                        stroke={link.value > 2 ? "#f43f5e" : "#475569"} 
                        strokeWidth={Math.sqrt(link.value)} 
                        strokeOpacity={0.6}
                        markerEnd="url(#arrowhead)"
                    />
                );
            })}
            {/* Nodes */}
            {nodes.map((node) => {
                const pos = positions[node.id];
                if (!pos) return null;
                let color = "#94a3b8";
                if (node.group === 'risk') color = "#f43f5e"; // Red
                if (node.group === 'worker') color = "#3b82f6"; // Blue
                if (node.group === 'job') color = "#10b981"; // Emerald
                if (node.group === 'action') color = "#f59e0b"; // Amber
                const displayLabel = shortenOntologyLabel(node.label, node.group);

                return (
                    <g key={node.id} transform={`translate(${pos.x},${pos.y})`} className="cursor-pointer hover:scale-110 transition-transform">
                        <title>{node.label}</title>
                        <circle r={Math.max(5, Math.sqrt(node.value) * 3 + 5)} fill={color} stroke="#1e293b" strokeWidth="2" />
                        <text y={-10} textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" className="pointer-events-none select-none drop-shadow-md">
                            {displayLabel}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

const PredictiveAnalysis: React.FC<{ workerRecords: WorkerRecord[] }> = ({ workerRecords }) => {
    // 1. 순수 근로자 필터링
    const sourceRecords = useMemo(() => 
        workerRecords.filter(r => !isManagementRole(r.jobField))
    , [workerRecords]);

    const [todayDate, setTodayDate] = useState('');
    const [nextMonth, setNextMonth] = useState('');
    const [ontologyZoom, setOntologyZoom] = useState(1);
    const [ontologySpacingStrength, setOntologySpacingStrength] = useState(0.5);
    const ontologyViewportRef = useRef<HTMLDivElement | null>(null);
    const [isPanningOntology, setIsPanningOntology] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
    const hasAutoCenteredRef = useRef(false);
    const touchStateRef = useRef<{
        mode: 'none' | 'pan' | 'pinch';
        startX: number;
        startY: number;
        startScrollLeft: number;
        startScrollTop: number;
        startDistance: number;
        startZoom: number;
    }>({
        mode: 'none',
        startX: 0,
        startY: 0,
        startScrollLeft: 0,
        startScrollTop: 0,
        startDistance: 0,
        startZoom: 1,
    });

    useEffect(() => {
        const d = new Date();
        setTodayDate(`${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`);
        d.setMonth(d.getMonth() + 1);
        setNextMonth(`${d.getMonth() + 1}월`);
    }, []);

    // 2. 온톨로지 데이터 구성 (Nodes & Links)
    const graphData = useMemo(() => {
        const nodes: Node[] = [];
        const links: Link[] = [];
        const nodeMap = new Set<string>();

        // 위험 키워드 추출 로직
        const getRiskKeyword = (text: string) => {
            if (text.includes('추락') || text.includes('고소')) return '추락 위험';
            if (text.includes('전기') || text.includes('감전')) return '감전 위험';
            if (text.includes('화재') || text.includes('용접')) return '화재 위험';
            if (text.includes('보호구') || text.includes('미착용')) return '보호구 미흡';
            if (text.includes('협착') || text.includes('끼임')) return '협착 위험';
            return '작업 절차 미준수';
        };

        if (sourceRecords.length === 0) return { nodes: [], links: [] };

        // 상위 위험 근로자 및 빈도 높은 위험 요소 추출
        const targetWorkers = sourceRecords
            .sort((a, b) => a.safetyScore - b.safetyScore)
            .slice(0, 10);

        targetWorkers.forEach(w => {
            // Worker Node
            if (!nodeMap.has(w.id)) {
                nodes.push({ id: w.id, group: 'worker', value: 10, label: w.name });
                nodeMap.add(w.id);
            }

            // Job Node
            const jobId = `job-${w.jobField}`;
            if (!nodeMap.has(jobId)) {
                nodes.push({ id: jobId, group: 'job', value: 20, label: w.jobField });
                nodeMap.add(jobId);
            }
            links.push({ source: w.id, target: jobId, value: 1 });

            // Risk Nodes & Links
            w.weakAreas.forEach(weak => {
                const riskLabel = getRiskKeyword(weak);
                const riskId = `risk-${riskLabel}`;
                
                if (!nodeMap.has(riskId)) {
                    nodes.push({ id: riskId, group: 'risk', value: 30, label: riskLabel });
                    nodeMap.add(riskId);
                }
                // Link: Worker -> Risk (점수가 낮을수록 강한 연결)
                links.push({ source: w.id, target: riskId, value: w.safetyScore < 60 ? 5 : 2 });
                
                // Ontology Inference: Risk -> Action (Next Month Plan)
                let actionLabel = '';
                if (riskLabel === '추락 위험') actionLabel = '안전대 체결 확인';
                if (riskLabel === '화재 위험') actionLabel = '소화기 비치/감시자';
                if (riskLabel === '감전 위험') actionLabel = '전선 피복/접지 확인';
                if (riskLabel === '보호구 미흡') actionLabel = 'TBM 보호구 상호점검';
                if (riskLabel === '협착 위험') actionLabel = '신호수 배치 필수';
                
                if (actionLabel) {
                    const actionId = `action-${actionLabel}`;
                    if (!nodeMap.has(actionId)) {
                        nodes.push({ id: actionId, group: 'action', value: 15, label: actionLabel });
                        nodeMap.add(actionId);
                    }
                    links.push({ source: riskId, target: actionId, value: 3 });
                }
            });
        });

        return { nodes, links };
    }, [sourceRecords]);

    // 회의 안건 (Agenda) 생성 로직
    const meetingAgenda = useMemo(() => {
        const riskCounts: Record<string, number> = {};
        sourceRecords.forEach(r => {
            r.weakAreas.forEach(area => {
                const key = area.includes('추락') ? '추락' : area.includes('전기') ? '전기' : area.includes('화재') ? '화재' : '기타';
                riskCounts[key] = (riskCounts[key] || 0) + 1;
            });
        });
        
        const topRisks = Object.entries(riskCounts).sort((a,b) => b[1] - a[1]).slice(0, 3);
        
        return topRisks.map(([risk], idx) => ({
            rank: idx + 1,
            title: `${nextMonth} ${risk} 집중 관리 기간`,
            desc: `지난 달 ${risk} 관련 지적 사항이 ${(riskCounts[risk]/sourceRecords.length * 100).toFixed(0)}%로 가장 높았습니다. TBM 시 강조 바랍니다.`
        }));
    }, [sourceRecords, nextMonth]);

    const handleOntologyMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        const viewport = ontologyViewportRef.current;
        if (!viewport) return;

        setIsPanningOntology(true);
        panStartRef.current = {
            x: event.clientX,
            y: event.clientY,
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
        };
    };

    const handleOntologyMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!isPanningOntology) return;
        const viewport = ontologyViewportRef.current;
        if (!viewport) return;

        const deltaX = event.clientX - panStartRef.current.x;
        const deltaY = event.clientY - panStartRef.current.y;
        viewport.scrollLeft = panStartRef.current.scrollLeft - deltaX;
        viewport.scrollTop = panStartRef.current.scrollTop - deltaY;
    };

    const stopOntologyPanning = () => {
        setIsPanningOntology(false);
    };

    const centerOntologyViewport = () => {
        const viewport = ontologyViewportRef.current;
        if (!viewport) return;
        viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
        viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
    };

    const handleResetOntologyView = () => {
        setOntologyZoom(1);
        requestAnimationFrame(() => {
            centerOntologyViewport();
        });
    };

    useEffect(() => {
        if (hasAutoCenteredRef.current) return;
        if (graphData.nodes.length === 0) return;

        requestAnimationFrame(() => {
            centerOntologyViewport();
            hasAutoCenteredRef.current = true;
        });
    }, [graphData.nodes.length]);

    const handleOntologyTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        const viewport = ontologyViewportRef.current;
        if (!viewport) return;

        if (event.touches.length === 1) {
            const touch = event.touches[0];
            touchStateRef.current = {
                ...touchStateRef.current,
                mode: 'pan',
                startX: touch.clientX,
                startY: touch.clientY,
                startScrollLeft: viewport.scrollLeft,
                startScrollTop: viewport.scrollTop,
            };
            setIsPanningOntology(true);
            return;
        }

        if (event.touches.length === 2) {
            touchStateRef.current = {
                ...touchStateRef.current,
                mode: 'pinch',
                startDistance: getTouchDistance(event.touches),
                startZoom: ontologyZoom,
            };
            setIsPanningOntology(false);
        }
    };

    const handleOntologyTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
        const viewport = ontologyViewportRef.current;
        if (!viewport) return;

        if (touchStateRef.current.mode === 'pan' && event.touches.length === 1) {
            event.preventDefault();
            const touch = event.touches[0];
            const deltaX = touch.clientX - touchStateRef.current.startX;
            const deltaY = touch.clientY - touchStateRef.current.startY;
            viewport.scrollLeft = touchStateRef.current.startScrollLeft - deltaX;
            viewport.scrollTop = touchStateRef.current.startScrollTop - deltaY;
            return;
        }

        if (touchStateRef.current.mode === 'pinch' && event.touches.length === 2) {
            event.preventDefault();
            const nextDistance = getTouchDistance(event.touches);
            if (touchStateRef.current.startDistance <= 0 || nextDistance <= 0) return;
            const scaleRatio = nextDistance / touchStateRef.current.startDistance;
            const nextZoom = clampOntologyZoom(touchStateRef.current.startZoom * scaleRatio);
            setOntologyZoom(nextZoom);
        }
    };

    const handleOntologyTouchEnd = () => {
        touchStateRef.current = {
            ...touchStateRef.current,
            mode: 'none',
            startDistance: 0,
        };
        setIsPanningOntology(false);
    };

    return (
        <div className="space-y-8 animate-fade-in-up">
            {/* Header: Meeting Context */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-[30px] p-8 text-white shadow-2xl border border-slate-700 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="bg-indigo-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">Monthly Meeting</span>
                            <span className="text-indigo-300 text-xs font-bold">{todayDate} 기준 분석</span>
                        </div>
                        <h2 className="text-3xl font-black mb-2">월간 위험성평가 회의 및 전략 수립</h2>
                        <p className="text-slate-400 max-w-2xl text-sm font-medium leading-relaxed">
                            수집된 수기 기록 데이터를 온톨로지로 가공하여 <span className="text-white font-bold underline decoration-indigo-500">인과관계</span>를 분석했습니다. 
                            이 자료를 바탕으로 다음 달({nextMonth})의 중점 관리 사항을 결정하고 전파 교육 자료를 작성하십시오.
                        </p>
                    </div>
                    <button className="px-6 py-3 bg-white text-indigo-900 rounded-xl font-black text-sm shadow-lg hover:bg-indigo-50 transition-all flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        회의 자료 인쇄
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Ontology Graph (Visual Evidence) */}
                <div className="lg:col-span-2 bg-slate-900 p-6 rounded-[30px] shadow-xl border border-slate-800 flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                            위험 요인 온톨로지 맵 (Risk Ontology Map)
                        </h3>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-2 py-1">
                                <button
                                    type="button"
                                    onClick={() => setOntologyZoom((prev) => clampOntologyZoom(prev - 0.1))}
                                    className="w-7 h-7 rounded-lg bg-slate-700 text-slate-100 font-black hover:bg-slate-600"
                                    aria-label="온톨리지 축소"
                                >
                                    −
                                </button>
                                <span className="text-[11px] font-black text-slate-200 min-w-[52px] text-center">{Math.round(ontologyZoom * 100)}%</span>
                                <button
                                    type="button"
                                    onClick={() => setOntologyZoom((prev) => clampOntologyZoom(prev + 0.1))}
                                    className="w-7 h-7 rounded-lg bg-slate-700 text-slate-100 font-black hover:bg-slate-600"
                                    aria-label="온톨리지 확대"
                                >
                                    +
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOntologyZoom(1)}
                                    className="ml-1 px-2 h-7 rounded-lg bg-slate-700 text-[11px] font-black text-slate-100 hover:bg-slate-600"
                                >
                                    100%
                                </button>
                                <button
                                    type="button"
                                    onClick={handleResetOntologyView}
                                    className="px-2 h-7 rounded-lg bg-indigo-700 text-[11px] font-black text-white hover:bg-indigo-600"
                                >
                                    초기화
                                </button>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-2 py-1">
                                <span className="text-[11px] font-black text-slate-300 whitespace-nowrap">간격</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={ontologySpacingStrength}
                                    onChange={(event) => setOntologySpacingStrength(Number(event.target.value))}
                                    className="w-20 accent-indigo-500"
                                    aria-label="온톨리지 노드 간격 조절"
                                />
                                <span className="text-[11px] font-black text-slate-200 w-8 text-right">{Math.round(ontologySpacingStrength * 100)}</span>
                            </div>
                            <div className="flex gap-4 text-[10px] font-bold text-slate-400">
                                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div>근로자</span>
                                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>공종</span>
                                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div>위험요인</span>
                                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div>예방대책</span>
                            </div>
                        </div>
                    </div>
                    <div
                        ref={ontologyViewportRef}
                        className={`flex-1 min-h-[400px] relative border border-slate-800 rounded-2xl bg-slate-950/50 overflow-auto ${isPanningOntology ? 'cursor-grabbing' : 'cursor-grab'}`}
                        onMouseDown={handleOntologyMouseDown}
                        onMouseMove={handleOntologyMouseMove}
                        onMouseUp={stopOntologyPanning}
                        onMouseLeave={stopOntologyPanning}
                        onTouchStart={handleOntologyTouchStart}
                        onTouchMove={handleOntologyTouchMove}
                        onTouchEnd={handleOntologyTouchEnd}
                        onTouchCancel={handleOntologyTouchEnd}
                        style={{ touchAction: 'none' }}
                    >
                        {graphData.nodes.length > 0 ? (
                            <div className="min-w-[900px] min-h-[620px] w-full h-full flex items-center justify-center p-4">
                                <div
                                    className="w-full h-full transition-transform duration-200"
                                    style={{ transform: `scale(${ontologyZoom})`, transformOrigin: 'center center' }}
                                >
                                    <OntologyGraph nodes={graphData.nodes} links={graphData.links} spacingStrength={ontologySpacingStrength} />
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-600">
                                <p>데이터 부족 또는 분석 대기 중</p>
                            </div>
                        )}
                        <div className="absolute bottom-4 right-4 bg-slate-800/80 backdrop-blur px-4 py-2 rounded-xl border border-slate-700 text-xs text-slate-300">
                            * 선의 굵기는 위험 발생 빈도와 연관성을 나타냅니다.
                        </div>
                    </div>
                </div>

                {/* Right: Next Month Agenda & Action Items */}
                <div className="space-y-6">
                    {/* Agenda Card */}
                    <div className="bg-white p-6 rounded-[30px] shadow-lg border border-slate-100">
                        <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                            {nextMonth} 중점 관리 안건
                        </h3>
                        <div className="space-y-4">
                            {meetingAgenda.length > 0 ? meetingAgenda.map((item) => (
                                <div key={item.rank} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 transition-colors group">
                                    <div className="flex items-start gap-3">
                                        <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-md group-hover:scale-110 transition-transform">
                                            {item.rank}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black text-slate-800 mb-1">{item.title}</h4>
                                            <p className="text-xs text-slate-500 leading-relaxed font-medium">
                                                {item.desc}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center py-10 text-slate-400 text-sm">
                                    분석된 데이터가 충분하지 않습니다.
                                </div>
                            )}
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                            <p className="text-[10px] text-slate-400 font-bold">
                                * 위 안건은 OCR 및 사용자 수정 데이터를 기반으로 자동 생성되었습니다.
                            </p>
                        </div>
                    </div>

                    {/* AI Insight Card */}
                    <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-6 rounded-[30px] shadow-lg shadow-orange-200 text-white relative overflow-hidden">
                        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white opacity-20 rounded-full blur-xl"></div>
                        <h3 className="text-lg font-black mb-2 flex items-center gap-2">
                            <span className="text-2xl">📢</span> TBM 전파 교육 제안
                        </h3>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                            <p className="text-xs font-bold opacity-80 mb-1">다음 달 위험성평가 기록지 작성 가이드:</p>
                            <p className="text-sm font-black leading-relaxed">
                                "{nextMonth}은 계절적 요인과 맞물려 <span className="underline decoration-white">추락 및 미끄러짐</span> 사고 위험이 높습니다. 
                                작업 전 안전대 고리 체결 확인을 필수 항목으로 기재하도록 지도하십시오."
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PredictiveAnalysis;

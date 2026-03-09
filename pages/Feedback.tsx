
import React, { useEffect, useMemo, useState } from 'react';
import type { AppSettings } from '../types';

type OutboxItem = {
    id: string;
    name: string;
    type: string;
    message: string;
    createdAt: string;
    status: 'pending';
    retryCount?: number;
    lastError?: string;
};

const Feedback: React.FC = () => {
    const [formData, setFormData] = useState({
        name: '',
        type: '💡 현장 맞춤 기능 제안',
        message: ''
    });
    const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
    const [showGuide, setShowGuide] = useState(true);
    const [outboxItems, setOutboxItems] = useState<OutboxItem[]>([]);
    const [retryingId, setRetryingId] = useState<string | null>(null);
    const [isRetryingAll, setIsRetryingAll] = useState(false);

    const feedbackChannel = useMemo(() => {
        try {
            const raw = localStorage.getItem('psi_app_settings');
            if (!raw) return null;
            const parsed = JSON.parse(raw) as AppSettings;
            return parsed.feedbackChannel || null;
        } catch {
            return null;
        }
    }, []);

    const readOutbox = (): OutboxItem[] => {
        try {
            const raw = localStorage.getItem('psi_feedback_outbox');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed as OutboxItem[];
        } catch {
            return [];
        }
    };

    const writeOutbox = (items: OutboxItem[]) => {
        localStorage.setItem('psi_feedback_outbox', JSON.stringify(items.slice(0, 100)));
        setOutboxItems(items.slice(0, 100));
    };

    useEffect(() => {
        setOutboxItems(readOutbox());
    }, []);

    const sendViaWebhook = async (payload: { name: string; type: string; message: string }) => {
        const webhookUrl = feedbackChannel?.webhookUrl?.trim() || '';
        const timeoutMs = Math.max(2000, feedbackChannel?.timeoutMs || 8000);
        const includeMetadata = feedbackChannel?.includeMetadata ?? true;

        if (!webhookUrl) {
            throw new Error('Webhook URL not configured');
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

        try {
            const requestBody: Record<string, unknown> = {
                name: payload.name,
                type: payload.type,
                message: payload.message,
            };

            if (includeMetadata) {
                requestBody.metadata = {
                    source: 'PSI Feedback',
                    submittedAt: new Date().toISOString(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    userAgent: navigator.userAgent,
                    appVersion: 'v2.1.0',
                };
            }

            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
        } finally {
            window.clearTimeout(timeoutId);
        }
    };

    const saveToOutbox = (payload: { name: string; type: string; message: string }, lastError?: string) => {
        const outbox = readOutbox();
        outbox.unshift({
            id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: payload.name,
            type: payload.type,
            message: payload.message,
            createdAt: new Date().toISOString(),
            status: 'pending',
            retryCount: 0,
            lastError,
        });
        writeOutbox(outbox);
    };

    const handleRetryOne = async (item: OutboxItem) => {
        const webhookUrl = feedbackChannel?.webhookUrl?.trim() || '';
        if (!webhookUrl) {
            alert('Webhook URL이 설정되지 않아 재전송할 수 없습니다. 설정 탭에서 URL을 먼저 입력해 주세요.');
            return;
        }

        setRetryingId(item.id);
        try {
            await sendViaWebhook({ name: item.name, type: item.type, message: item.message });
            const remaining = readOutbox().filter((entry) => entry.id !== item.id);
            writeOutbox(remaining);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            const updated = readOutbox().map((entry) => (
                entry.id === item.id
                    ? { ...entry, retryCount: (entry.retryCount || 0) + 1, lastError: message }
                    : entry
            ));
            writeOutbox(updated);
        } finally {
            setRetryingId(null);
        }
    };

    const handleRetryAll = async () => {
        const webhookUrl = feedbackChannel?.webhookUrl?.trim() || '';
        if (!webhookUrl) {
            alert('Webhook URL이 설정되지 않아 전체 재전송할 수 없습니다. 설정 탭에서 URL을 먼저 입력해 주세요.');
            return;
        }
        if (outboxItems.length === 0) return;

        setIsRetryingAll(true);
        let successCount = 0;
        let failCount = 0;

        for (const item of [...outboxItems]) {
            try {
                await sendViaWebhook({ name: item.name, type: item.type, message: item.message });
                const remaining = readOutbox().filter((entry) => entry.id !== item.id);
                writeOutbox(remaining);
                successCount++;
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                const updated = readOutbox().map((entry) => (
                    entry.id === item.id
                        ? { ...entry, retryCount: (entry.retryCount || 0) + 1, lastError: message }
                        : entry
                ));
                writeOutbox(updated);
                failCount++;
            }
        }

        setIsRetryingAll(false);
        alert(`Outbox 재전송 완료\n성공: ${successCount}건\n실패: ${failCount}건`);
    };

    const handleDeleteOutboxItem = (id: string) => {
        const next = readOutbox().filter((entry) => entry.id !== id);
        writeOutbox(next);
    };

    const handleClearOutbox = () => {
        if (!confirm('Outbox 항목을 모두 삭제하시겠습니까?')) return;
        writeOutbox([]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.message) {
            alert('성함과 내용을 모두 입력해주세요.');
            return;
        }

        setStatus('sending');

        const webhookUrl = feedbackChannel?.webhookUrl?.trim() || '';

        if (!webhookUrl) {
            setTimeout(() => {
                setStatus('success');
                setFormData({ name: '', type: '💡 현장 맞춤 기능 제안', message: '' });
                setTimeout(() => setStatus('idle'), 3000);
            }, 1200);
            return;
        }

        try {
            const payload = {
                name: formData.name,
                type: formData.type,
                message: formData.message,
            };

            await sendViaWebhook(payload);

            setStatus('success');
            setFormData({ name: '', type: '💡 현장 맞춤 기능 제안', message: '' });
            setTimeout(() => setStatus('idle'), 3000);
        } catch (error) {
            console.error('Feedback delivery failed:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            saveToOutbox({ name: formData.name, type: formData.type, message: formData.message }, message);
            setStatus('error');
            alert('실시간 전송에 실패하여 로컬 Outbox에 임시 저장했습니다. 네트워크 또는 Webhook URL을 확인해주세요.');
            setTimeout(() => setStatus('idle'), 3000);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in-up">
            {/* Hero Header */}
            <div className="relative bg-slate-900 rounded-[40px] shadow-2xl overflow-hidden p-12 text-center text-white border border-white/10">
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20">
                    <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-500 rounded-full blur-3xl mix-blend-overlay animate-blob"></div>
                    <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-600 rounded-full blur-3xl mix-blend-overlay animate-blob animation-delay-4000"></div>
                </div>
                <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/20 mb-4">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                        <span className="text-xs font-bold text-green-200 uppercase tracking-widest">Live Feedback Channel</span>
                    </div>
                    <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight">현장 직통 채널 (Field Voice)</h2>
                    <p className="text-indigo-200 max-w-2xl mx-auto text-xl font-bold leading-relaxed">
                        현장의 목소리는 가장 강력한 데이터입니다.<br/>
                        작은 불편함부터 위험 요소까지, 개발팀과 안전 관리자에게 직접 전달하세요.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Left Column: Changelog Timeline */}
                <div className="lg:col-span-7 space-y-10">
                    <div className="flex items-center space-x-4 mb-2">
                        <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <h3 className="text-2xl font-black text-slate-800">시스템 업데이트 히스토리</h3>
                    </div>

                    {/* Timeline Item: V2.1.0 (2026 Feb) */}
                    <div className="relative pl-10 before:absolute before:left-4 before:top-0 before:bottom-0 before:w-1 before:bg-indigo-100 last:before:hidden">
                        <div className="absolute left-0 top-0 w-9 h-9 rounded-full bg-white border-[6px] border-indigo-600 z-10 shadow-lg animate-pulse"></div>
                        <div className="bg-white rounded-[40px] shadow-xl border border-slate-100 p-8 hover:shadow-2xl transition-all duration-500 group">
                            <div className="flex flex-wrap justify-between items-start mb-6 gap-4">
                                <div>
                                    <h4 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                        PSI 2.1: Enterprise Grade Reliability
                                        <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-600 text-white shadow-lg shadow-indigo-300">v2.1.0</span>
                                    </h4>
                                    <span className="text-sm text-indigo-500 font-bold mt-2 block uppercase tracking-widest">2026년 02월 17일 STABILITY UPDATE</span>
                                </div>
                                <div className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    CURRENT
                                </div>
                            </div>
                            <div className="space-y-6">
                                <p className="text-slate-600 text-lg font-medium leading-relaxed">
                                    기업 환경에서의 안정성과 확장성을 대폭 강화했습니다. 300명 이상의 대규모 근로자 관리, 무한 재시도 방지, 메모리 최적화 등 프로덕션 레벨의 안정성을 확보했습니다.
                                </p>
                                <div className="p-5 bg-indigo-50 rounded-3xl border border-indigo-100">
                                    <h5 className="font-black text-indigo-800 mb-2 flex items-center gap-2">
                                        <span className="text-xl">🛡️</span> 2.1 주요 개선사항
                                    </h5>
                                    <ul className="text-sm text-slate-600 font-bold space-y-2 list-disc list-inside">
                                        <li>300+ 근로자 일괄 처리 Progressive Rendering 엔진 최적화</li>
                                        <li>무한 루프 방지: OCR 재시도 로직 및 API 호출 최대 대기시간 설정</li>
                                        <li>보고서 생성 실패 추적 시스템 (개별 실패 건 상세 표시)</li>
                                        <li>Null 참조 방지 및 타임아웃 보호 강화</li>
                                        <li>메모리 최적화: GC 시간 확보 (100ms → 500ms)</li>
                                        <li>취소 가능한 삭제 (Undo Delete 5초 기능)</li>
                                        <li>실시간 할당량 추적 및 백오프 전략 개선</li>
                                    </ul>
                                </div>
                                <div className="p-5 bg-emerald-50 rounded-3xl border border-emerald-100">
                                    <h5 className="font-black text-emerald-800 mb-2 flex items-center gap-2">
                                        <span className="text-xl">📊</span> 검증 결과
                                    </h5>
                                    <ul className="text-sm text-slate-600 font-bold space-y-1.5">
                                        <li>✅ 보안 검사: 0건 취약점 (CodeQL 통과)</li>
                                        <li>✅ 무한 루프 위험: 4건 → 0건 (100% 개선)</li>
                                        <li>✅ Null 충돌 위험: 제거 완료</li>
                                        <li>✅ 에러 추적: 300% 개선</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Timeline Item: V2.0.0 (2026 New Year) */}
                    <div className="relative pl-10 before:absolute before:left-4 before:top-0 before:bottom-0 before:w-1 before:bg-indigo-100 last:before:hidden pt-10">
                        <div className="absolute left-0 top-10 w-9 h-9 rounded-full bg-white border-[6px] border-indigo-500 z-10 shadow-lg"></div>
                        <div className="bg-white/80 rounded-[40px] border border-slate-100 p-8 grayscale-[30%] hover:grayscale-0 transition-all duration-500">
                            <div className="flex flex-wrap justify-between items-start mb-6 gap-4">
                                <div>
                                    <h4 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                        PSI 2.0: AI Autonomous Safety
                                        <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-500 text-white">v2.0.0</span>
                                    </h4>
                                    <span className="text-sm text-slate-400 font-bold mt-2 block uppercase tracking-widest">2026년 01월 01일 GRAND UPDATE</span>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <p className="text-slate-600 text-base font-medium leading-relaxed">
                                    2026년 새해를 맞아 PSI가 2.0 버전으로 도약합니다. 기존의 분석 기능을 넘어, 현장 데이터를 기반으로 미래 위험을 스스로 예측하고 제안하는 **'능동형 안전 지능(Active Intelligence)'**이 탑재되었습니다.
                                </p>
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <h5 className="font-black text-slate-700 mb-2 flex items-center gap-2 text-sm">
                                        <span className="text-lg">🚀</span> 2.0 주요 변경점
                                    </h5>
                                    <ul className="text-xs text-slate-600 font-bold space-y-1.5 list-disc list-inside">
                                        <li>시간축 동기화 알고리즘 개선 (2026 Future-Ready)</li>
                                        <li>근로자 행동 패턴 기반 초정밀 위험 예측 모델 적용</li>
                                        <li>다국어 실시간 통역/번역 엔진 고도화</li>
                                        <li>심리 분석: 필기 압력 및 레이아웃 위반 감지</li>
                                        <li>무결성 검증: 과거 위반 이력과 기재 내용 대조</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Timeline Item: V1.5.0 (Optimization) */}
                    <div className="relative pl-10 before:absolute before:left-4 before:top-0 before:bottom-0 before:w-1 before:bg-indigo-100 last:before:hidden pt-10">
                        <div className="absolute left-0 top-10 w-9 h-9 rounded-full bg-white border-[6px] border-emerald-500 z-10 shadow-lg"></div>
                        <div className="bg-white/80 rounded-[40px] border border-slate-100 p-8 grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-500">
                            <div className="flex flex-wrap justify-between items-start mb-6 gap-4">
                                <div>
                                    <h4 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                        시스템 전면 최적화 & UX 고도화
                                        <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500 text-white">v1.5.0</span>
                                    </h4>
                                    <span className="text-sm text-slate-400 font-bold mt-2 block uppercase tracking-widest">2025년 12월 10일 RELEASE</span>
                                </div>
                            </div>
                            <p className="text-slate-600 text-sm font-medium leading-relaxed">
                                대시보드 리뉴얼, 퀵 액션(Quick Action) 도입, 이미지 리포트 생성 기능 추가 등 사용자 경험 대폭 개선.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right Column: Feedback Form */}
                <div className="lg:col-span-5">
                    <div className="bg-white p-8 rounded-[48px] shadow-2xl border border-slate-100 sticky top-10">
                        
                        {/* 1. Feature Explanation & Guide */}
                        {showGuide && (
                            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 mb-8 relative">
                                <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                                <h4 className="font-black text-slate-800 text-sm flex items-center gap-2 mb-3">
                                    <span className="bg-indigo-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">?</span>
                                    이 기능은 어떻게 작동하나요?
                                </h4>
                                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 bg-white p-3 rounded-xl border border-slate-100 shadow-sm mb-3">
                                    <div className="text-center">
                                        <span className="text-xl block mb-1">👷</span>
                                        <span>현장 입력</span>
                                    </div>
                                    <div className="text-slate-300">➜</div>
                                    <div className="text-center">
                                        <span className="text-xl block mb-1">☁️</span>
                                        <span>개발팀 전송</span>
                                    </div>
                                    <div className="text-slate-300">➜</div>
                                    <div className="text-center">
                                        <span className="text-xl block mb-1">⚡️</span>
                                        <span>즉시 반영</span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                                    <span className="text-rose-500 font-bold">* 프로토타입 알림:</span><br/>
                                    설정 탭의 Webhook URL이 비어 있으면 <strong>전송 성공 시뮬레이션</strong>으로 동작합니다. URL이 설정되면 실제 전송을 시도하며, 실패 시 로컬 Outbox에 임시 저장됩니다.
                                </p>
                                <p className="text-xs text-indigo-600 leading-relaxed font-bold mt-3">
                                    Gemini 협업 논의가 필요한 경우 피드백 유형에서 <strong>"🤖 Gemini 협업: 다음 버전 기획/개선"</strong>을 선택해 주세요.
                                </p>
                            </div>
                        )}

                        <div className="text-center mb-8">
                            <h3 className="text-2xl font-black text-slate-900">현장 목소리 보내기</h3>
                            <p className="text-sm text-slate-400 mt-2 font-bold">어떤 의견이라도 경청하겠습니다.</p>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">성함 및 직책/공종</label>
                                <input 
                                    type="text" 
                                    placeholder="예: 홍길동 (형틀 반장)" 
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    className="w-full bg-slate-50 border-transparent rounded-2xl shadow-inner focus:ring-2 focus:ring-indigo-600 text-sm py-4 px-5 font-bold transition-all" 
                                    disabled={status === 'sending' || status === 'success' || status === 'error'}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">피드백 유형 (Category)</label>
                                <select 
                                    value={formData.type}
                                    onChange={e => setFormData({...formData, type: e.target.value})}
                                    className="w-full bg-slate-50 border-transparent rounded-2xl shadow-inner focus:ring-2 focus:ring-indigo-600 text-sm py-4 px-5 font-bold transition-all appearance-none"
                                    disabled={status === 'sending' || status === 'success' || status === 'error'}
                                >
                                    <option>🚨 긴급: 현장 위험 요소 즉시 제보</option>
                                    <option>🐛 품질: 시스템 버그 리포트</option>
                                    <option>🌏 품질: 번역/OCR 오류 신고</option>
                                    <option>💡 기능: 현장 맞춤 기능 제안</option>
                                    <option>🤖 Gemini 협업: 다음 버전 기획/개선</option>
                                    <option>📱 UX: 모바일 화면/네비게이션 최적화</option>
                                    <option>🎨 디자인: 브랜드/로고 가독성 개선</option>
                                    <option>🎛️ 디자인: 대시보드 색상/버전 표기 개선</option>
                                    <option>📄 공신력: 특허/법무/권리화 문의</option>
                                    <option>🙌 운영: 안전 우수 사례 칭찬/공유</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">상세 내용</label>
                                <textarea 
                                    rows={5} 
                                    placeholder="내용을 구체적으로 적어주시면 시스템 개선에 큰 도움이 됩니다." 
                                    value={formData.message}
                                    onChange={e => setFormData({...formData, message: e.target.value})}
                                    className="w-full bg-slate-50 border-transparent rounded-2xl shadow-inner focus:ring-2 focus:ring-indigo-600 text-sm p-5 resize-none font-bold transition-all"
                                    disabled={status === 'sending' || status === 'success' || status === 'error'}
                                ></textarea>
                            </div>
                            
                            <button 
                                type="submit" 
                                disabled={status !== 'idle'}
                                className={`w-full py-5 font-black rounded-3xl shadow-2xl transition-all transform active:scale-95 flex items-center justify-center gap-2 relative overflow-hidden
                                    ${status === 'success' ? 'bg-green-500 text-white' : status === 'error' ? 'bg-rose-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}
                                    ${status === 'sending' ? 'cursor-not-allowed opacity-80' : ''}
                                `}
                            >
                                {status === 'idle' && (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                        메시지 전송하기
                                    </>
                                )}
                                {status === 'sending' && (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        전송 중...
                                    </>
                                )}
                                {status === 'success' && (
                                    <>
                                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        전송 완료!
                                    </>
                                )}
                                {status === 'error' && (
                                    <>
                                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                        전송 실패 (Outbox 저장)
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div>
                                    <p className="text-xs font-black text-slate-700">피드백 Outbox</p>
                                    <p className="text-[11px] text-slate-500">전송 실패 시 자동 보관되며, 여기서 재전송할 수 있습니다.</p>
                                </div>
                                <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-black">
                                    {outboxItems.length}건
                                </span>
                            </div>

                            {outboxItems.length === 0 ? (
                                <p className="text-xs text-slate-400 font-bold">대기 중인 항목이 없습니다.</p>
                            ) : (
                                <>
                                    <div className="flex gap-2 mb-3">
                                        <button
                                            onClick={handleRetryAll}
                                            disabled={isRetryingAll}
                                            className={`px-3 py-2 rounded-lg text-xs font-black transition-colors ${isRetryingAll ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                                        >
                                            {isRetryingAll ? '전체 재전송 중...' : '전체 재전송'}
                                        </button>
                                        <button
                                            onClick={handleClearOutbox}
                                            className="px-3 py-2 rounded-lg text-xs font-black bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                                        >
                                            전체 비우기
                                        </button>
                                    </div>

                                    <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                                        {outboxItems.slice(0, 20).map((item) => (
                                            <div key={item.id} className="p-3 rounded-xl border border-slate-200 bg-white">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-black text-slate-800 truncate">{item.type}</p>
                                                        <p className="text-[11px] text-slate-500 mt-0.5">{item.name} · {new Date(item.createdAt).toLocaleString()}</p>
                                                        <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{item.message}</p>
                                                        <p className="text-[10px] text-rose-500 mt-1">재시도 {item.retryCount || 0}회{item.lastError ? ` · 최근 오류: ${item.lastError}` : ''}</p>
                                                    </div>
                                                    <div className="flex flex-col gap-1 shrink-0">
                                                        <button
                                                            onClick={() => handleRetryOne(item)}
                                                            disabled={retryingId === item.id || isRetryingAll}
                                                            className={`px-2.5 py-1.5 rounded-md text-[11px] font-black ${retryingId === item.id || isRetryingAll ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                                                        >
                                                            {retryingId === item.id ? '재전송...' : '재전송'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteOutboxItem(item.id)}
                                                            className="px-2.5 py-1.5 rounded-md text-[11px] font-black bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                                                        >
                                                            삭제
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        <div
                            className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 relative group/patent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                            title="특허출원 제10-2026-0039151호 (발명자: 박성훈)"
                            aria-label="특허출원 신뢰 안내"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    (e.currentTarget as HTMLDivElement).blur();
                                }
                            }}
                        >
                            <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 mt-0.5 text-emerald-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V7l7-4z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                                </svg>
                                <div>
                                    <p className="text-xs font-black text-emerald-800">PSI 특허 출원 기반 신뢰 안내</p>
                                    <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                                        특허출원 제10-2026-0039151호 (발명자: 박성훈). 시스템 공신력/권리화 관련 문의는
                                        피드백 유형에서 “특허/법무/공신력 관련 문의”를 선택해 접수해 주세요.
                                    </p>
                                </div>
                            </div>
                            <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 max-w-[min(260px,calc(100vw-2rem))] rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-medium text-white opacity-0 shadow-lg transition-all duration-200 group-hover/patent:translate-y-0 group-hover/patent:opacity-100 group-focus-within/patent:translate-y-0 group-focus-within/patent:opacity-100 translate-y-1 sm:left-4 sm:w-max sm:max-w-[90%]">
                                특허출원 제10-2026-0039151호 (발명자: 박성훈)
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Feedback;

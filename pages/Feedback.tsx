
import React, { useState } from 'react';

const Feedback: React.FC = () => {
    const [formData, setFormData] = useState({
        name: '',
        type: '💡 새로운 기능 제안',
        message: ''
    });
    const [status, setStatus] = useState<'idle' | 'sending' | 'success'>('idle');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.message) {
            alert('성함과 내용을 모두 입력해주세요.');
            return;
        }

        setStatus('sending');
        
        // Simulate network request
        setTimeout(() => {
            setStatus('success');
            setFormData({ name: '', type: '💡 새로운 기능 제안', message: '' });
            
            // Reset status after showing success message
            setTimeout(() => setStatus('idle'), 3000);
        }, 1500);
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
                    <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight">피드백 및 시스템 업데이트</h2>
                    <p className="text-indigo-200 max-w-2xl mx-auto text-xl font-bold leading-relaxed">
                        현장의 목소리를 담아 PSI는 매일 진화합니다. <br/>
                        완성된 '양방향 안전 생태계'를 지금 경험하십시오.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Left Column: Changelog Timeline */}
                <div className="lg:col-span-8 space-y-10">
                    <div className="flex items-center space-x-4 mb-2">
                        <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <h3 className="text-2xl font-black text-slate-800">현장 최적화 업데이트 히스토리</h3>
                    </div>

                    {/* Timeline Item: V2.0.0 (2026 New Year) */}
                    <div className="relative pl-10 before:absolute before:left-4 before:top-0 before:bottom-0 before:w-1 before:bg-indigo-100 last:before:hidden">
                        <div className="absolute left-0 top-0 w-9 h-9 rounded-full bg-white border-[6px] border-indigo-600 z-10 shadow-lg animate-pulse"></div>
                        <div className="bg-white rounded-[40px] shadow-xl border border-slate-100 p-8 hover:shadow-2xl transition-all duration-500 group">
                            <div className="flex flex-wrap justify-between items-start mb-6 gap-4">
                                <div>
                                    <h4 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                        PSI 2.0: AI Autonomous Safety
                                        <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-600 text-white shadow-lg shadow-indigo-300">v2.0.0</span>
                                    </h4>
                                    <span className="text-sm text-indigo-500 font-bold mt-2 block uppercase tracking-widest">2026년 01월 01일 GRAND UPDATE</span>
                                </div>
                                <div className="px-4 py-2 rounded-xl text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    NEW ERA
                                </div>
                            </div>
                            <div className="space-y-6">
                                <p className="text-slate-600 text-lg font-medium leading-relaxed">
                                    2026년 새해를 맞아 PSI가 2.0 버전으로 도약합니다. 기존의 분석 기능을 넘어, 현장 데이터를 기반으로 미래 위험을 스스로 예측하고 제안하는 **'능동형 안전 지능(Active Intelligence)'**이 탑재되었습니다.
                                </p>
                                <div className="p-5 bg-indigo-50 rounded-3xl border border-indigo-100">
                                    <h5 className="font-black text-indigo-800 mb-2 flex items-center gap-2">
                                        <span className="text-xl">🚀</span> 2.0 주요 변경점
                                    </h5>
                                    <ul className="text-sm text-slate-600 font-bold space-y-2 list-disc list-inside">
                                        <li>시간축 동기화 알고리즘 개선 (2026 Future-Ready)</li>
                                        <li>근로자 행동 패턴 기반 초정밀 위험 예측 모델 적용</li>
                                        <li>다국어 실시간 통역/번역 엔진 고도화</li>
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

                    {/* Timeline Item: V1.4.0 */}
                    <div className="relative pl-10 before:absolute before:left-4 before:top-0 before:bottom-0 before:w-1 before:bg-indigo-100 last:before:hidden pt-10">
                        <div className="absolute left-0 top-10 w-9 h-9 rounded-full bg-white border-[6px] border-slate-300 z-10 shadow-sm"></div>
                        <div className="bg-white/60 rounded-[40px] border border-slate-100 p-8 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-500">
                            <div className="flex flex-wrap justify-between items-start mb-6 gap-4">
                                <div>
                                    <h4 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                        현장 맞춤형 직무 & 데이터 안전성 강화
                                        <span className="px-3 py-1 rounded-full text-xs font-black bg-slate-200 text-slate-600">v1.4.0</span>
                                    </h4>
                                    <span className="text-sm text-slate-400 font-bold mt-2 block uppercase tracking-widest">2025년 12월 05일 RELEASE</span>
                                </div>
                            </div>
                            <p className="text-slate-600 text-sm font-medium leading-relaxed">
                                특수 직무(신호수, 통역) 배지 시스템 도입 및 데이터 삭제 실행 취소(Undo) 기능 탑재.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right Column: Feedback Form */}
                <div className="lg:col-span-4">
                    <div className="bg-white p-10 rounded-[48px] shadow-2xl border border-slate-100 sticky top-10">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-4 text-indigo-600 shadow-xl shadow-indigo-100">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                            </div>
                            <h3 className="text-2xl font-black text-slate-900">현장 목소리 보내기</h3>
                            <p className="text-sm text-slate-400 mt-2 font-bold">기능 제안, 현장의 어려움 등 <br/>어떤 의견이라도 감사히 듣겠습니다.</p>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <input 
                                    type="text" 
                                    placeholder="성함 및 직책" 
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    className="w-full bg-slate-50 border-transparent rounded-2xl shadow-inner focus:ring-2 focus:ring-indigo-600 text-sm py-4 px-5 font-bold transition-all" 
                                    disabled={status === 'sending' || status === 'success'}
                                />
                            </div>
                            <div>
                                <select 
                                    value={formData.type}
                                    onChange={e => setFormData({...formData, type: e.target.value})}
                                    className="w-full bg-slate-50 border-transparent rounded-2xl shadow-inner focus:ring-2 focus:ring-indigo-600 text-sm py-4 px-5 font-bold transition-all"
                                    disabled={status === 'sending' || status === 'success'}
                                >
                                    <option>💡 새로운 기능 제안</option>
                                    <option>🐞 시스템 오류 제보</option>
                                    <option>📢 현장 적용 사례 공유</option>
                                    <option>✨ 개발자 응원 메시지</option>
                                </select>
                            </div>
                            <div>
                                <textarea 
                                    rows={5} 
                                    placeholder="현장에서 느끼시는 소중한 의견을 적어주세요..." 
                                    value={formData.message}
                                    onChange={e => setFormData({...formData, message: e.target.value})}
                                    className="w-full bg-slate-50 border-transparent rounded-2xl shadow-inner focus:ring-2 focus:ring-indigo-600 text-sm p-5 resize-none font-bold transition-all"
                                    disabled={status === 'sending' || status === 'success'}
                                ></textarea>
                            </div>
                            
                            <button 
                                type="submit" 
                                disabled={status !== 'idle'}
                                className={`w-full py-5 font-black rounded-3xl shadow-2xl transition-all transform active:scale-95 flex items-center justify-center gap-2 relative overflow-hidden
                                    ${status === 'success' ? 'bg-green-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}
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
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Feedback;

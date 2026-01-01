
import React, { useState, useEffect } from 'react';

interface Issue {
    id: string;
    date: string;
    time: string;
    location: string;
    type: string;
    description: string;
    actionRequired: string;
    status: '검토 필요' | '조치 중' | '조치 완료';
    image?: string;
    responsiblePerson: string;
}

const SiteIssueManagement: React.FC = () => {
    const [issues, setIssues] = useState<Issue[]>(() => {
        try {
            const saved = localStorage.getItem('psi_site_issues');
            return saved ? JSON.parse(saved) : [];
        } catch(e) { return []; }
    });
    const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
    const [showAddModal, setShowAddModal] = useState(false);

    // New Issue Form State
    const [newIssue, setNewIssue] = useState<Partial<Issue>>({
        status: '검토 필요',
        date: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        localStorage.setItem('psi_site_issues', JSON.stringify(issues));
    }, [issues]);

    const getStatusBadge = (status: string) => {
        switch(status) {
            case '조치 완료': return 'bg-green-100 text-green-700 border border-green-200';
            case '조치 중': return 'bg-blue-100 text-blue-700 border border-blue-200';
            default: return 'bg-red-100 text-red-700 border border-red-200';
        }
    };

    const handleAddIssue = () => {
        if (!newIssue.location || !newIssue.description) {
            alert("위치와 내용을 입력해주세요.");
            return;
        }
        const issue: Issue = {
            id: Date.now().toString(),
            date: newIssue.date || new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString('ko-KR', {hour: '2-digit', minute:'2-digit'}),
            location: newIssue.location || '',
            type: newIssue.type || '기타',
            description: newIssue.description || '',
            actionRequired: newIssue.actionRequired || '',
            status: '검토 필요',
            responsiblePerson: newIssue.responsiblePerson || '',
            // Placeholder image for demo if none provided
            image: undefined 
        };
        setIssues([issue, ...issues]);
        setShowAddModal(false);
        setNewIssue({ status: '검토 필요', date: new Date().toISOString().split('T')[0] });
    };

    const updateStatus = (id: string, newStatus: Issue['status']) => {
        setIssues(issues.map(i => i.id === id ? {...i, status: newStatus} : i));
    };

    const deleteIssue = (id: string) => {
        if(window.confirm("삭제하시겠습니까?")) {
            setIssues(issues.filter(i => i.id !== id));
        }
    };

    const filteredIssues = issues.filter(issue => {
        if (filter === 'all') return true;
        if (filter === 'pending') return issue.status === '검토 필요' || issue.status === '조치 중';
        if (filter === 'completed') return issue.status === '조치 완료';
        return true;
    });

    return (
        <div className="space-y-6">
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900">현장 지적사항 관리</h2>
                    </div>
                    <button onClick={() => setShowAddModal(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-md transition-transform hover:-translate-y-0.5">
                        + 새 지적사항 등록
                    </button>
                </div>
                <p className="text-slate-500">현장 순회 중 발견된 불안전 요소나 시정 조치가 필요한 사항을 기록하고 추적 관리합니다.</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-slate-800">지적사항 목록 <span className="text-slate-500 font-normal text-sm ml-2">총 {filteredIssues.length}건</span></h3>
                    <div className="flex space-x-2">
                        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>전체</button>
                        <button onClick={() => setFilter('pending')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === 'pending' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>미조치</button>
                        <button onClick={() => setFilter('completed')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === 'completed' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>조치 완료</button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {filteredIssues.length > 0 ? filteredIssues.map((issue) => (
                        <div key={issue.id} className="flex flex-col md:flex-row gap-6 border border-slate-200 rounded-xl p-6 hover:border-indigo-300 hover:shadow-md transition-all bg-white">
                            {/* Image Placeholder */}
                            <div className="w-full md:w-48 h-48 bg-slate-100 rounded-lg flex items-center justify-center shrink-0 border border-slate-200">
                                {issue.image ? (
                                    <img src={issue.image} alt="Issue" className="w-full h-full object-cover rounded-lg"/>
                                ) : (
                                    <div className="text-center text-slate-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        <span className="text-xs">사진 없음</span>
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-2 py-0.5 text-xs font-bold rounded ${getStatusBadge(issue.status)}`}>{issue.status}</span>
                                            <span className="text-xs text-slate-500 font-medium">{issue.date} {issue.time}</span>
                                        </div>
                                        <h4 className="text-lg font-bold text-slate-900">{issue.location} - {issue.type}</h4>
                                    </div>
                                    <button onClick={() => deleteIssue(issue.id)} className="text-slate-400 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button>
                                </div>
                                
                                <p className="text-slate-700 font-medium mb-4 flex-1">{issue.description}</p>
                                
                                {issue.actionRequired && (
                                    <div className="bg-slate-50 p-3 rounded-md text-sm text-slate-600 mb-4 border border-slate-200">
                                        <span className="font-bold text-slate-800 mr-2">조치 요구:</span> {issue.actionRequired}
                                    </div>
                                )}

                                <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                                    <div className="text-sm text-slate-500">
                                        담당자: <span className="font-semibold text-slate-800">{issue.responsiblePerson || '미지정'}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        {issue.status !== '조치 완료' && (
                                            <button onClick={() => updateStatus(issue.id, '조치 완료')} className="px-3 py-1.5 bg-green-600 text-white text-sm font-bold rounded hover:bg-green-700 transition-colors shadow-sm">
                                                조치 완료 처리
                                            </button>
                                        )}
                                        {issue.status === '검토 필요' && (
                                            <button onClick={() => updateStatus(issue.id, '조치 중')} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded hover:bg-slate-50 transition-colors shadow-sm">
                                                조치 시작
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <div className="flex justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <p className="text-slate-500 font-medium text-lg">등록된 지적사항이 없습니다.</p>
                            <p className="text-sm text-slate-400 mt-1">위험성 평가 기록 분석 외 별도의 현장 지적사항을 관리해보세요.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Issue Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in-up">
                        <h3 className="text-xl font-bold text-slate-900 mb-4">새 지적사항 등록</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">발견 일자</label>
                                <input type="date" value={newIssue.date} onChange={e => setNewIssue({...newIssue, date: e.target.value})} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">위치 (구역/층)</label>
                                <input type="text" placeholder="예: 103동 5층 슬라브" value={newIssue.location || ''} onChange={e => setNewIssue({...newIssue, location: e.target.value})} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">유형</label>
                                <select value={newIssue.type} onChange={e => setNewIssue({...newIssue, type: e.target.value})} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                                    <option value="추락 위험">추락 위험</option>
                                    <option value="낙하물 위험">낙하물 위험</option>
                                    <option value="화재 위험">화재 위험</option>
                                    <option value="전기 위험">전기 위험</option>
                                    <option value="보호구 미착용">보호구 미착용</option>
                                    <option value="기타">기타</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">지적 내용</label>
                                <textarea rows={3} placeholder="상세 내용을 입력하세요" value={newIssue.description || ''} onChange={e => setNewIssue({...newIssue, description: e.target.value})} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"></textarea>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">조치 요구 사항</label>
                                <input type="text" placeholder="예: 즉시 난간 설치 요망" value={newIssue.actionRequired || ''} onChange={e => setNewIssue({...newIssue, actionRequired: e.target.value})} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">담당자</label>
                                <input type="text" placeholder="담당자 이름" value={newIssue.responsiblePerson || ''} onChange={e => setNewIssue({...newIssue, responsiblePerson: e.target.value})} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
                            </div>
                        </div>
                        <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-slate-100">
                            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-slate-600 bg-slate-100 font-semibold rounded-lg hover:bg-slate-200">취소</button>
                            <button onClick={handleAddIssue} className="px-4 py-2 text-white bg-indigo-600 font-semibold rounded-lg hover:bg-indigo-700">등록</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SiteIssueManagement;

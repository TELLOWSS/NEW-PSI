import React, { useState, useCallback, useEffect } from 'react';

interface JudgmentTaggingRecord {
  id: string;
  rawText: string;
  riskCategory: string;
  riskSubcategory: string;
  judgmentTags: string[];
  recommendedAction: string;
  consensusStatus: 'pending' | 'agreed' | 'disputed';
}

const RISK_CATEGORIES = ['추락', '낙하', '협착', '감전', '화상', '요통', '붕괴', '화학'];

const JUDGMENT_TAGS = [
  '위험 미인지',
  '위험 과소판단',
  '작업 목적 미이해',
  '절차 미준수',
  '검증 미실',
  '규칙 무시',
  '과신',
  '주의력 산만',
];

const LIVE_RECORDS_KEY = 'psi_judgment_tagging_live_records';
const LIVE_QUALITY_KEY = 'psi_judgment_tagging_live_quality';
const LIVE_QUALITY_EVENT = 'psi-judgment-tagging-quality-updated';

const buildLiveQualitySummary = (records: JudgmentTaggingRecord[]) => {
  const requiredErrors: Array<{ row: number; field: string; message: string }> = [];

  records.forEach((record, index) => {
    if (!record.rawText.trim()) {
      requiredErrors.push({ row: index + 1, field: 'rawText', message: '필수값 누락' });
    }
    if (!record.riskCategory.trim()) {
      requiredErrors.push({ row: index + 1, field: 'riskCategory', message: '필수값 누락' });
    }
    if (record.judgmentTags.length === 0) {
      requiredErrors.push({ row: index + 1, field: 'judgmentTags', message: '최소 1개 태그 필요' });
    }
    if (!record.recommendedAction.trim()) {
      requiredErrors.push({ row: index + 1, field: 'recommendedAction', message: '필수값 누락' });
    }
  });

  const errorMap = new Map<string, { field: string; message: string; count: number }>();
  requiredErrors.forEach((error) => {
    const key = `${error.field}:${error.message}`;
    const found = errorMap.get(key);
    if (found) {
      found.count += 1;
      return;
    }
    errorMap.set(key, { field: error.field, message: error.message, count: 1 });
  });

  const errorTop = Array.from(errorMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const actionItems = errorTop.map((item, index) => ({
    priority: index + 1,
    title: `${item.field} 보정`,
    action: `${item.message} 항목 ${item.count}건 보정 후 재검증`,
    count: item.count,
    source: 'error' as const,
  }));

  return {
    status: requiredErrors.length === 0 ? 'PASS' : 'FAIL',
    totalRows: records.length,
    filledRows: records.length,
    unfilledRows: 0,
    errorCount: requiredErrors.length,
    warningCount: 0,
    errorTop,
    warningTop: [],
    actionItems,
    errors: requiredErrors,
    warnings: [],
    meta: {
      generatedAt: new Date().toISOString(),
      input: 'live:judgment-tagging-input',
      codebook: 'templates/psi_judgment_tag_codebook_v1_24_2026-05-16.csv',
      ontology: 'templates/psi_ontology_v1_seed_2026-05-16.csv',
    },
  };
};

export const JudgmentTaggingInput: React.FC = () => {
  const [records, setRecords] = useState<JudgmentTaggingRecord[]>(() => {
    try {
      const saved = localStorage.getItem(LIVE_RECORDS_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed as JudgmentTaggingRecord[] : [];
    } catch {
      return [];
    }
  });
  const [currentRecord, setCurrentRecord] = useState<JudgmentTaggingRecord>({
    id: `REC-${Date.now()}`,
    rawText: '',
    riskCategory: '',
    riskSubcategory: '',
    judgmentTags: [],
    recommendedAction: '',
    consensusStatus: 'pending',
  });

  const handleAddRecord = useCallback(() => {
    if (!currentRecord.rawText.trim() || !currentRecord.riskCategory) {
      alert('원문과 위험 카테고리는 필수입니다.');
      return;
    }

    setRecords(prev => [...prev, currentRecord]);
    setCurrentRecord({
      id: `REC-${Date.now()}`,
      rawText: '',
      riskCategory: '',
      riskSubcategory: '',
      judgmentTags: [],
      recommendedAction: '',
      consensusStatus: 'pending',
    });
  }, [currentRecord]);

  const handleTagToggle = (tag: string) => {
    setCurrentRecord(prev => ({
      ...prev,
      judgmentTags: prev.judgmentTags.includes(tag)
        ? prev.judgmentTags.filter(t => t !== tag)
        : [...prev.judgmentTags, tag],
    }));
  };

  const handleExportCsv = () => {
    if (records.length === 0) {
      alert('저장할 기록이 없습니다.');
      return;
    }

    const csvHeader = 'ID,원문,위험분류,위험소분류,판단태그,권장조치,합의상태\n';
    const csvRows = records.map(r =>
      `"${r.id}","${r.rawText.replace(/"/g, '""')}","${r.riskCategory}","${r.riskSubcategory}","${r.judgmentTags.join(';')}","${r.recommendedAction.replace(/"/g, '""')}","${r.consensusStatus}"`
    ).join('\n');

    const csv = csvHeader + csvRows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `judgment-tagging-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    localStorage.setItem(LIVE_RECORDS_KEY, JSON.stringify(records));
    const quality = buildLiveQualitySummary(records);
    localStorage.setItem(LIVE_QUALITY_KEY, JSON.stringify(quality));
    window.dispatchEvent(new Event(LIVE_QUALITY_EVENT));
  }, [records]);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in-up">
      <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-green-700">9) 수기 데이터 입력</p>

        {/* 입력 폼 */}
        <div className="mt-6 space-y-4">
          {/* 원문 입력 */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-2">원문 기록 *</label>
            <textarea
              value={currentRecord.rawText}
              onChange={(e) => setCurrentRecord({ ...currentRecord, rawText: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:border-green-500 focus:ring-1 focus:ring-green-400 outline-none resize-none"
              rows={3}
              placeholder="현장에서 발생한 상황을 자유롭게 기록하세요."
            />
            <p className="mt-1 text-[10px] text-slate-600">{currentRecord.rawText.length}/500자</p>
          </div>

          {/* 위험 분류 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-700 mb-2">위험 분류 *</label>
              <select
                value={currentRecord.riskCategory}
                onChange={(e) => setCurrentRecord({ ...currentRecord, riskCategory: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:border-green-500 focus:ring-1 focus:ring-green-400 outline-none"
              >
                <option value="">선택하세요</option>
                {RISK_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* 위험 소분류 */}
            <div>
              <label className="block text-xs font-black text-slate-700 mb-2">위험 소분류</label>
              <input
                type="text"
                value={currentRecord.riskSubcategory}
                onChange={(e) => setCurrentRecord({ ...currentRecord, riskSubcategory: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:border-green-500 focus:ring-1 focus:ring-green-400 outline-none"
                placeholder="예: 안전고리, 지지불량"
              />
            </div>
          </div>

          {/* 판단 태그 */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-2">판단 태그 (複選 가능)</label>
            <div className="grid grid-cols-2 gap-2">
              {JUDGMENT_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => handleTagToggle(tag)}
                  className={`px-3 py-2 rounded-lg text-xs font-black transition-all ${
                    currentRecord.judgmentTags.includes(tag)
                      ? 'bg-green-600 text-white'
                      : 'bg-white border-2 border-slate-300 text-slate-700 hover:border-green-300'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-600">선택됨: {currentRecord.judgmentTags.length}개</p>
          </div>

          {/* 권장 조치 */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-2">권장 조치</label>
            <textarea
              value={currentRecord.recommendedAction}
              onChange={(e) => setCurrentRecord({ ...currentRecord, recommendedAction: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:border-green-500 focus:ring-1 focus:ring-green-400 outline-none resize-none"
              rows={2}
              placeholder="예: 장비 점검, 교육 강화, 규칙 재정의"
            />
          </div>

          {/* 합의 상태 */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-2">합의 상태</label>
            <select
              value={currentRecord.consensusStatus}
              onChange={(e) => setCurrentRecord({ ...currentRecord, consensusStatus: e.target.value as JudgmentTaggingRecord['consensusStatus'] })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:border-green-500 focus:ring-1 focus:ring-green-400 outline-none"
            >
              <option value="pending">🔄 대기</option>
              <option value="agreed">✅ 합의</option>
              <option value="disputed">⚠️ 의견 불일치</option>
            </select>
          </div>

          {/* 추가 버튼 */}
          <button
            onClick={handleAddRecord}
            className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-black transition-colors"
          >
            입력 완료 및 추가
          </button>
        </div>

        {/* 입력 현황 */}
        <div className="mt-6 p-3 bg-white rounded-lg border border-slate-200">
          <p className="text-xs font-black text-slate-700 mb-2">📊 입력 현황</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="px-2 py-1.5 bg-green-100 rounded text-xs font-bold text-green-800">
              입력: {records.length}건
            </div>
            <div className="px-2 py-1.5 bg-blue-100 rounded text-xs font-bold text-blue-800">
              완료율: {records.length > 0 ? `${Math.round((records.filter((record) => record.rawText.trim() && record.riskCategory.trim() && record.judgmentTags.length > 0 && record.recommendedAction.trim()).length / records.length) * 100)}%` : '0%'}
            </div>
          </div>
        </div>

        {/* 기록 목록 */}
        {records.length > 0 && (
          <div className="mt-6 space-y-2">
            <p className="text-xs font-black text-slate-700">입력된 기록</p>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {records.map((r, idx) => (
                <div key={r.id} className="p-2 bg-white rounded-lg border border-slate-200 text-xs">
                  <p className="font-bold text-slate-900">{idx + 1}. {r.riskCategory}</p>
                  <p className="text-slate-600 line-clamp-2">{r.rawText}</p>
                  <button
                    onClick={() => setRecords(prev => prev.filter(rec => rec.id !== r.id))}
                    className="mt-1 text-red-600 hover:text-red-800 font-bold text-[9px]"
                  >
                    × 삭제
                  </button>
                </div>
              ))}
            </div>

            {/* CSV 내보내기 */}
            <button
              onClick={handleExportCsv}
              className="w-full px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-black text-xs transition-colors mt-4"
            >
              💾 CSV로 내보내기
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

import { useState, useEffect } from 'react';

const LIVE_QUALITY_KEY = 'psi_judgment_tagging_live_quality';
const LIVE_QUALITY_EVENT = 'psi-judgment-tagging-quality-updated';

export type JudgmentTaggingQuality = {
  status: 'PASS' | 'FAIL';
  totalRows: number;
  filledRows: number;
  unfilledRows: number;
  errorCount: number;
  warningCount: number;
  errorTop: Array<{
    field: string;
    message: string;
    count: number;
  }>;
  warningTop: Array<{
    field: string;
    message: string;
    count: number;
  }>;
  actionItems: Array<{
    priority: number;
    title: string;
    action: string;
    count: number;
    source: 'error' | 'warning';
  }>;
  errors: Array<any>;
  warnings: Array<any>;
  meta?: {
    generatedAt: string;
    input: string;
    codebook: string;
    ontology: string;
  };
};

export const useJudgmentTaggingQuality = () => {
  const [data, setData] = useState<JudgmentTaggingQuality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getLiveQuality = (): JudgmentTaggingQuality | null => {
      try {
        const raw = localStorage.getItem(LIVE_QUALITY_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as JudgmentTaggingQuality;
      } catch {
        return null;
      }
    };

    const fetchData = async () => {
      try {
        setLoading(true);
        const liveQuality = getLiveQuality();
        if (liveQuality) {
          setData(liveQuality);
          setError(null);
          return;
        }

        const response = await fetch('/api/judgment-tagging-quality.json');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const json = (await response.json()) as JudgmentTaggingQuality;
        setData(json);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : '데이터 로드 실패';
        setError(message);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === LIVE_QUALITY_KEY) {
        fetchData();
      }
    };

    const handleLiveUpdate = () => {
      fetchData();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(LIVE_QUALITY_EVENT, handleLiveUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(LIVE_QUALITY_EVENT, handleLiveUpdate);
    };
  }, []);

  return { data, loading, error };
};

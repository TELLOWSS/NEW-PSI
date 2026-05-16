import { useState, useEffect } from 'react';

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
    const fetchData = async () => {
      try {
        setLoading(true);
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
    // 5초마다 갱신
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return { data, loading, error };
};

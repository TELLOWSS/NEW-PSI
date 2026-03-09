import React, { useEffect, useMemo, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '../lib/supabaseClient';

interface WorkerTrainingProps {
    sessionId: string;
}

type SessionRow = {
    id: string;
    source_text_ko: string;
    audio_urls: Record<string, string>;
};

const LANGUAGE_LABELS: Record<string, string> = {
    'ko-KR': '한국어',
    'en-US': '영어',
    'vi-VN': '베트남어',
    'cmn-CN': '중국어',
    'th-TH': '태국어',
    'id-ID': '인도네시아어',
    'uz-UZ': '우즈베크어',
    'mn-MN': '몽골어',
    'km-KH': '크메르어',
    'ru-RU': '러시아어',
    'ne-NP': '네팔어',
    'my-MM': '미얀마어',
    'fil-PH': '필리핀어',
    'hi-IN': '힌디어',
    'bn-BD': '벵골어',
    'ur-PK': '우르두어',
    'si-LK': '싱할라어',
    'kk-KZ': '카자흐어',
};

const resolveLanguageCodeByNationality = (nationalityRaw: string): string => {
    const nationality = (nationalityRaw || '').toLowerCase().trim();

    if (!nationality) return 'en-US';
    if (nationality.includes('한국') || nationality.includes('대한민국') || nationality.includes('korea')) return 'ko-KR';
    if (nationality.includes('베트남') || nationality.includes('vietnam')) return 'vi-VN';
    if (nationality.includes('중국') || nationality.includes('china')) return 'cmn-CN';
    if (nationality.includes('태국') || nationality.includes('thailand')) return 'th-TH';
    if (nationality.includes('인도네시아') || nationality.includes('indonesia')) return 'id-ID';
    if (nationality.includes('우즈베키스탄') || nationality.includes('uzbek')) return 'uz-UZ';
    if (nationality.includes('몽골') || nationality.includes('mongolia')) return 'mn-MN';
    if (nationality.includes('캄보디아') || nationality.includes('cambodia') || nationality.includes('khmer')) return 'km-KH';
    if (nationality.includes('러시아') || nationality.includes('russia')) return 'ru-RU';
    if (nationality.includes('네팔') || nationality.includes('nepal')) return 'ne-NP';
    if (nationality.includes('미얀마') || nationality.includes('myanmar')) return 'my-MM';
    if (nationality.includes('필리핀') || nationality.includes('philippines') || nationality.includes('filipino')) return 'fil-PH';
    if (nationality.includes('인도') || nationality.includes('india') || nationality.includes('hindi')) return 'hi-IN';
    if (nationality.includes('방글라데시') || nationality.includes('bangladesh') || nationality.includes('bengali')) return 'bn-BD';
    if (nationality.includes('파키스탄') || nationality.includes('pakistan') || nationality.includes('urdu')) return 'ur-PK';
    if (nationality.includes('스리랑카') || nationality.includes('sri lanka') || nationality.includes('sinhala')) return 'si-LK';
    if (nationality.includes('카자흐스탄') || nationality.includes('kazakhstan') || nationality.includes('kazakh')) return 'kk-KZ';

    return 'en-US';
};

const WorkerTraining: React.FC<WorkerTrainingProps> = ({ sessionId }) => {
    const [loading, setLoading] = useState(true);
    const [sessionData, setSessionData] = useState<SessionRow | null>(null);

    const [workerName, setWorkerName] = useState('');
    const [nationality, setNationality] = useState('베트남');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const sigRef = useRef<SignatureCanvas | null>(null);

    const langKey = useMemo(() => resolveLanguageCodeByNationality(nationality), [nationality]);

    const selectedAudioUrl = useMemo(() => {
        if (!sessionData?.audio_urls) return '';
        const map = sessionData.audio_urls;
        return map[langKey] || map['en-US'] || map['ko-KR'] || '';
    }, [sessionData, langKey]);

    useEffect(() => {
        const run = async () => {
            if (!sessionId) {
                setMessage('sessionId가 없습니다. QR URL을 다시 확인해 주세요.');
                setLoading(false);
                return;
            }

            setLoading(true);
            const { data, error } = await supabase
                .from('training_sessions')
                .select('id, source_text_ko, audio_urls')
                .eq('id', sessionId)
                .single();

            if (error) {
                setMessage(`세션 조회 오류: ${error.message}`);
                setSessionData(null);
            } else {
                setSessionData(data as SessionRow);
            }
            setLoading(false);
        };

        void run();
    }, [sessionId]);

    const handleClear = () => {
        sigRef.current?.clear();
    };

    const handleSubmit = async () => {
        if (!workerName.trim()) {
            alert('이름을 입력해 주세요.');
            return;
        }

        if (!sigRef.current || sigRef.current.isEmpty()) {
            alert('전자서명을 먼저 입력해 주세요.');
            return;
        }

        if (!selectedAudioUrl) {
            alert('오디오 URL이 없습니다. 관리자에게 문의해 주세요.');
            return;
        }

        const signatureDataUrl = sigRef.current.toDataURL('image/png');

        setSubmitting(true);
        setMessage('');

        try {
            const response = await fetch('/api/training/submit-signature', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    workerName,
                    nationality,
                    selectedAudioUrl,
                    signatureDataUrl,
                }),
            });

            const data = await response.json();
            if (!response.ok || !data.ok) {
                throw new Error(data.message || '제출 실패');
            }

            setMessage('제출 완료! 교육 이수 서명이 저장되었습니다.');
            setWorkerName('');
            sigRef.current?.clear();
        } catch (error: any) {
            setMessage(`오류: ${error?.message || '알 수 없는 오류'}`);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="bg-white p-6 rounded-2xl border border-slate-200 font-bold">불러오는 중...</div>;
    }

    if (!sessionData) {
        return <div className="bg-white p-6 rounded-2xl border border-rose-200 text-rose-700 font-bold">세션이 없습니다. 관리자에게 문의해 주세요.</div>;
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-2xl font-black text-slate-900">외국인 근로자 안전교육 확인</h2>
                <p className="text-sm font-bold text-slate-500 mt-2">음성 안내를 듣고 전자서명을 제출해 주세요.</p>

                <div className="mt-4">
                    <label className="block text-xs font-black text-slate-500 mb-2">이름</label>
                    <input
                        value={workerName}
                        onChange={(e) => setWorkerName(e.target.value)}
                        className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 font-bold"
                        placeholder="이름 입력"
                    />
                </div>

                <div className="mt-4">
                    <label className="block text-xs font-black text-slate-500 mb-2">국적</label>
                    <input
                        value={nationality}
                        onChange={(e) => setNationality(e.target.value)}
                        className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 font-bold"
                        placeholder="예: 베트남, 중국, 러시아, 우즈베키스탄, 카자흐스탄..."
                    />
                    <p className="mt-2 text-[11px] font-bold text-slate-500">
                        자동 언어 선택: <span className="text-slate-700">{LANGUAGE_LABELS[langKey] || '영어'} ({langKey})</span> (미지원 국가는 영어 `en-US`로 안내)
                    </p>
                </div>

                <div className="mt-4">
                    <label className="block text-xs font-black text-slate-500 mb-2">음성 안내</label>
                    {selectedAudioUrl ? (
                        <audio controls className="w-full">
                            <source src={selectedAudioUrl} type="audio/mpeg" />
                        </audio>
                    ) : (
                        <p className="text-sm text-rose-600 font-bold">재생할 오디오가 없습니다.</p>
                    )}
                </div>

                <div className="mt-4">
                    <label className="block text-xs font-black text-slate-500 mb-2">전자서명</label>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                        <SignatureCanvas
                            ref={(ref) => {
                                sigRef.current = ref;
                            }}
                            penColor="black"
                            canvasProps={{
                                width: 700,
                                height: 220,
                                className: 'w-full h-[220px]'
                            }}
                        />
                    </div>
                    <button
                        onClick={handleClear}
                        className="mt-2 px-4 py-2 text-xs font-black rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                        서명 지우기
                    </button>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="mt-6 w-full py-3 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {submitting ? '제출 중...' : '제출'}
                </button>

                {message && <p className="mt-3 text-sm font-bold text-slate-700">{message}</p>}
            </div>
        </div>
    );
};

export default WorkerTraining;

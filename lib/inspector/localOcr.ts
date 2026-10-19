export const OCR_LANGUAGES = { kor: '한국어', eng: '영어', vie: '베트남어', chi_sim: '중국어(간체)' } as const;
export async function recognizeLocally(image: Blob, language: keyof typeof OCR_LANGUAGES, onProgress: (progress: number) => void, signal?: AbortSignal) {
    if (!Object.hasOwn(OCR_LANGUAGES,language)) throw new Error('지원하는 문자 인식 언어를 선택해 주세요.');
    const { createWorker, OEM } = await import('tesseract.js');
    if(signal?.aborted) throw new Error('문자 인식이 취소되었습니다.');
    const base = new URL('/inspector-ocr/v1',window.location.origin).href;
    let active: Awaited<ReturnType<typeof createWorker>> | null=null;
    let stopped=false,timer:ReturnType<typeof setTimeout>,cancel:()=>void;
    const interrupted=new Promise<never>((_,reject)=>{
        cancel=()=>{stopped=true;void active?.terminate();reject(new Error('문자 인식이 취소되었습니다.'));};
        timer=setTimeout(()=>{stopped=true;void active?.terminate();reject(new Error('문자 인식 시간이 길어지고 있습니다. 수기 입력이나 수동 분석결과 가져오기를 이용해 주세요.'));},45000);
        signal?.addEventListener('abort',cancel,{once:true});
    });
    const work=(async()=>{
        const worker=await createWorker(language,OEM.LSTM_ONLY,{workerPath:`${base}/worker.min.js`,corePath:base,langPath:base,
            workerBlobURL:false,cacheMethod:'none',logger:m=>{if(!stopped)onProgress(Math.round((m.progress||0)*100));},errorHandler:()=>undefined});
        active=worker;
        if(stopped){await worker.terminate();throw new Error('문자 인식이 취소되었습니다.');}
        const {data}=await worker.recognize(image);
        return {rawText:data.text,confidence:data.confidence/100,engine:'LOCAL_TESSERACT' as const,language,requiresHumanReview:true as const};
    })();
    try {return await Promise.race([work,interrupted]);}
    finally {stopped=true;clearTimeout(timer!);signal?.removeEventListener('abort',cancel!);void active?.terminate();}
}

import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({createWorker:vi.fn(),recognize:vi.fn(),terminate:vi.fn()}));
vi.mock('tesseract.js',()=>({createWorker:mocks.createWorker,OEM:{LSTM_ONLY:1}}));
import {recognizeLocally} from '../lib/inspector/localOcr';
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('window',{location:{origin:'https://psi.example'}});mocks.terminate.mockResolvedValue(undefined);mocks.createWorker.mockResolvedValue({recognize:mocks.recognize,terminate:mocks.terminate});});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('local OCR without paid fallback',()=>{
    it('uses only same-origin runtime and language assets, returns review-required text',async()=>{
        mocks.recognize.mockResolvedValue({data:{text:'SAFETY FIRST',confidence:91}});
        expect(await recognizeLocally(new Blob(['image']),'eng',()=>undefined)).toMatchObject({rawText:'SAFETY FIRST',confidence:.91,requiresHumanReview:true});
        expect(mocks.createWorker.mock.calls[0][2]).toMatchObject({workerPath:'https://psi.example/inspector-ocr/v1/worker.min.js',corePath:'https://psi.example/inspector-ocr/v1',langPath:'https://psi.example/inspector-ocr/v1'});
        expect(mocks.terminate).toHaveBeenCalled();
    });
    it('rejects unsupported languages before creating any worker',async()=>{
        await expect(recognizeLocally(new Blob(), 'my' as any,()=>undefined)).rejects.toThrow('지원하는');expect(mocks.createWorker).not.toHaveBeenCalled();
    });
    it('cancels recognition even when the worker promise never settles',async()=>{
        mocks.recognize.mockImplementation(()=>new Promise(()=>{}));const controller=new AbortController();
        const pending=recognizeLocally(new Blob(),'kor',()=>undefined,controller.signal);await vi.waitFor(()=>expect(mocks.recognize).toHaveBeenCalled());controller.abort();await expect(pending).rejects.toThrow('취소');expect(mocks.terminate).toHaveBeenCalled();
    });
    it('times out stalled work with a manual path and no provider retry',async()=>{
        vi.useFakeTimers();mocks.recognize.mockImplementation(()=>new Promise(()=>{}));const pending=recognizeLocally(new Blob(),'kor',()=>undefined);const checked=expect(pending).rejects.toThrow('수기 입력');await vi.advanceTimersByTimeAsync(45001);await checked;expect(mocks.createWorker).toHaveBeenCalledTimes(1);
    });
});

import { describe, it, expect, vi } from 'vitest';
import type { WorkerRecord } from '../types';

class MockZip {
    private contents = new Map<string, Uint8Array>();
    file(path: string, bytes?: Uint8Array | string): {async: (format: 'string' | 'uint8array') => Promise<string | Uint8Array>} | null | void {
        if (bytes === undefined) {
            const stored=this.contents.get(path);
            return stored ? { async: async format => format === 'string'
                ? new TextDecoder().decode(stored) : stored } : null;
        }
        this.contents.set(path,typeof bytes === 'string'
            ? new TextEncoder().encode(bytes) : bytes);
    }
    get files(): Record<string,{dir:boolean}> {
        return Object.fromEntries([...this.contents.keys()].map(path=>[path,{dir:false}]));
    }
    async generateAsync(): Promise<Blob> {
        return new Blob([JSON.stringify([...this.contents].map(([path,bytes])=>[path,[...bytes]]))],
            {type:'application/zip'});
    }
    async loadAsync(blob: Blob): Promise<MockZip> {
        const data=JSON.parse(await blob.text()) as Array<[string,number[]]>;
        this.contents=new Map(data.map(([path,bytes])=>[path,Uint8Array.from(bytes)]));
        return this;
    }
}
vi.mock('../utils/externalScripts',()=>({
    ensureJsZip:async()=>MockZip,
    ensureFileSaver:async()=>()=>undefined,
}));
import {buildPsiEvidenceArchive,verifyPsiEvidenceArchive} from '../utils/psiEvidenceArchive';
import {buildPsiMinimizedReviewArchive} from '../utils/psiMinimizedReviewArchive';

const record=():WorkerRecord=>({
    id:'synthetic-001',name:'가상근로자',date:'2026-10-25',language:'zh',
    jobField:'형틀',originalImage:'data:image/jpeg;base64,QUJDRA==',
    handwrittenAnswers:[{questionNumber:'Q1',answerText:'高处作业',
        koreanTranslation:'높은 곳에서 하는 작업'}],
} as unknown as WorkerRecord);

const fixture=async()=>{
    const original=await buildPsiEvidenceArchive(record(),{exportedAt:'2026-11-01T00:00:00Z'});
    const verified=await verifyPsiEvidenceArchive(original.blob,original.zipSha256);
    expect(verified.verified).toBe(true);
    expect(verified.recordId).toBe('synthetic-001');
    return {original,verified};
};
const inspect=async(blob:Blob)=>{
    const archive=await new MockZip().loadAsync(blob);
    return archive;
};

describe('PSI local review copy retains only approved selection for further review',()=>{
    it('copies selected byte-identical file, omits excluded source and source manifest',async()=>{
        const {original,verified}=await fixture();
        const result=await buildPsiMinimizedReviewArchive(original.blob,verified,
            ['assets/currently-stored-original-form.jpg'],'synthetic-001','2026-11-01T03:00:00Z');
        const copied=await inspect(result.blob);
        const paths=Object.keys(copied.files);
        expect(paths).toEqual(expect.arrayContaining([
            'selected/assets/currently-stored-original-form.jpg',
            'REVIEW_MANIFEST.json','SHA256SUMS.txt',
        ]));
        expect(paths).not.toContain('selected/record/snapshot.json');
        expect(paths).not.toContain('selected/record/timeline.txt');
        expect(paths).not.toContain('manifest.json');
        expect(paths).toHaveLength(3);
        const image=await copied.file('selected/assets/currently-stored-original-form.jpg')!.async('uint8array') as Uint8Array;
        expect([...image]).toEqual([65,66,67,68]);
        expect(result.manifest.excludedFileCount).toBe(2);
        expect(result.manifest.disclosureApproved).toBe(false);
        expect(result.manifest.privacyRedactionCompleted).toBe(false);
        expect(result.manifest.humanContentReviewRequired).toBe(true);
        expect(result.zipSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(await original.blob.text()).toContain('record/snapshot.json');
    });
    it('blocks mismatched record, mismatched source checksum and prior unanchored verification',async()=>{
        const {original,verified}=await fixture();
        const path=['record/timeline.txt'];
        await expect(buildPsiMinimizedReviewArchive(original.blob,verified,path,'another-worker')).rejects.toThrow('근로자 기록');
        await expect(buildPsiMinimizedReviewArchive(original.blob,{...verified,externallyAnchored:false},path,'synthetic-001')).rejects.toThrow('원본 ZIP');
        await expect(buildPsiMinimizedReviewArchive(original.blob,{...verified,zipSha256:'0'.repeat(64)},path,'synthetic-001')).rejects.toThrow('무결성');
    });
    it('blocks invalid selections and leaves original archive unchanged',async()=>{
        const {original,verified}=await fixture();
        const unchanged=await original.blob.text();
        await expect(buildPsiMinimizedReviewArchive(original.blob,verified,[],'synthetic-001')).rejects.toThrow('1~50');
        await expect(buildPsiMinimizedReviewArchive(original.blob,verified,
            ['record/timeline.txt','record/timeline.txt'],'synthetic-001')).rejects.toThrow('중복');
        await expect(buildPsiMinimizedReviewArchive(original.blob,verified,
            ['assets/secret-unlisted.jpg'],'synthetic-001')).rejects.toThrow('없는 파일');
        expect(await original.blob.text()).toBe(unchanged);
    });
    it('fails on a substituted original Blob even if a prior ZIP once passed',async()=>{
        const {original,verified}=await fixture();
        const rows=JSON.parse(await original.blob.text()) as Array<[string,number[]]>;
        rows.find(item=>item[0]==='record/timeline.txt')![1].push(65);
        const altered=new Blob([JSON.stringify(rows)],{type:'application/zip'});
        await expect(buildPsiMinimizedReviewArchive(altered,verified,
            ['assets/currently-stored-original-form.jpg'],'synthetic-001')).rejects.toThrow('무결성');
    });
});

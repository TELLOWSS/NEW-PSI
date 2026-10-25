import {expect,it,vi} from 'vitest';
import {shareInspectorPacket,sharePhotoFile,shareResultMessage,copyInspectorShareText,shareCopyResultMessage} from '../lib/inspector/sharing';
const packet={title:'현장 검토',text:'담당: 형틀반장 / 상태: 미조치'};
it('calls the selected native share synchronously from the gesture with prepared files',async()=>{const file=sharePhotoFile(new Blob(['jpeg'],{type:'image/jpeg'}),2),share=vi.fn().mockResolvedValue(undefined),target={share,canShare:()=>true};const pending=shareInspectorPacket({...packet,files:[file]},target);expect(share).toHaveBeenCalledOnce();expect(share.mock.calls[0][0].files).toEqual([file]);expect(await pending).toBe('handed-off');expect(share.mock.calls[0][0].text).toContain('미조치');expect(shareResultMessage['handed-off']).not.toContain('전송 완료했습니다');});
it('never silently drops photos when file sharing is unsupported',async()=>{const share=vi.fn();expect(await shareInspectorPacket({...packet,files:[sharePhotoFile(new Blob(['png'],{type:'image/png'}),1)]},{share,canShare:()=>false})).toBe('files-unsupported');expect(share).not.toHaveBeenCalled();});
it('falls back for missing share support and handles cancellation without success',async()=>{expect(await shareInspectorPacket(packet,{})).toBe('unsupported');expect(await shareInspectorPacket(packet,{share:async()=>{throw new DOMException('cancel','AbortError');}})).toBe('cancelled');expect(await shareInspectorPacket(packet,{share:async()=>{throw new Error('blocked');}})).toBe('failed');});
it('does not require canShare for a text-only share and preserves MIME extensions',async()=>{const share=vi.fn().mockResolvedValue(undefined);expect(await shareInspectorPacket(packet,{share})).toBe('handed-off');expect(sharePhotoFile(new Blob(['p'],{type:'image/png'}),3).name).toBe('현장점검-사진-3.png');expect(sharePhotoFile(new Blob(['w'],{type:'image/webp'}),4).type).toBe('image/webp');});

it('recovers when clipboard is missing or denied without throwing and without claiming message delivery',async()=>{
    expect(await copyInspectorShareText('전달 문구',null)).toBe('unsupported');
    const reject=vi.fn().mockRejectedValue(new Error('permission denied'));
    expect(await copyInspectorShareText('전달 문구',{writeText:reject})).toBe('failed');
    const writeText=vi.fn().mockResolvedValue(undefined);
    expect(await copyInspectorShareText('현장 위험 · 조치 확인',{writeText})).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('현장 위험 · 조치 확인');
    expect(shareCopyResultMessage.copied).toContain('실제 전송 여부');
    expect(shareCopyResultMessage.unsupported).toContain('선택해서 복사');
    expect(await copyInspectorShareText(' ',{writeText})).toBe('failed');
});

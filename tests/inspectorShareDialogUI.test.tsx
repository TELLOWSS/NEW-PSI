import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {ShareDialog} from '../components/inspector/InspectorShareButton';

describe('novice inspector share fallback',()=>{
    it('exposes an explicit text-only share path, clipboard fallback and delivery warning',()=>{
        const html=renderToStaticMarkup(React.createElement(ShareDialog,{
            title:'현장 점검',text:'검토 요청 문구',onClose:()=>{},
        }));
        expect(html).toContain('문구만 공유창 열기');
        expect(html).toContain('문구 복사');
        expect(html).toContain('실제 메시지 전송 완료를 뜻하지 않습니다');
        expect(html).toContain('카카오톡');
        expect(html).toContain('공유한 사본');
    });
});

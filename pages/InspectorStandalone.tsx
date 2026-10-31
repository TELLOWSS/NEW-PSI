import React,{useEffect,useState} from 'react';
import SafetyInspector from './SafetyInspector';
import {currentReleaseLabel} from '../utils/releaseGate';
import {AdminLockScreen} from '../components/AdminLockScreen';
import {refreshAdminAuthentication,loginAdmin,logoutAdmin} from '../utils/adminGuard';
import '../styles.css';
import '../components/inspector/inspector-standalone.css';

/**
 * Product-independent entry surface, NOT a second security principal/tenant.
 * PSI and this workspace currently share the existing dedicated admin session
 * and Inspector server storage. Authentication is checked against the server.
 */
export default function InspectorStandalone(){
    const [status,setStatus]=useState<'checking'|'locked'|'unlocked'>('checking');
    const [error,setError]=useState(''),[submitting,setSubmitting]=useState(false);
    const [unsaved,setUnsaved]=useState(false);
    useEffect(()=>{
        let active=true;
        void refreshAdminAuthentication().then(ok=>{if(active)setStatus(ok?'unlocked':'locked');})
            .catch(()=>{if(active)setStatus('locked');});
        return()=>{active=false;};
    },[]);
    const unlock=async(password:string,bypass=false)=>{
        if(submitting)return;
        setSubmitting(true);setError('');
        try{await loginAdmin(password,bypass);setStatus('unlocked');}
        catch(reason){setError(reason instanceof Error?reason.message:'관리자 인증에 실패했습니다.');setStatus('locked');}
        finally{setSubmitting(false);}
    };
    const logout=async()=>{
        if(unsaved&&!window.confirm('저장 전 입력이 있습니다. 로그아웃하면 사진·설명·조치 입력이 사라집니다. 로그아웃할까요?'))return;
        setSubmitting(true);setError('');
        try{await logoutAdmin();}
        catch{setError('로그아웃 응답을 확인하지 못했습니다. 다시 접속하기 전 인증 상태를 확인하세요.');}
        finally{setStatus('locked');setSubmitting(false);}
    };
    if(status==='checking')return <div className="inspector-standalone-auth" role="status">사진점검 관리자 인증 상태를 확인하고 있습니다…</div>;
    if(status==='locked')return <div className="inspector-standalone-auth">
        <div className="inspector-standalone-login"><strong>PSI INSPECTOR · 독립 사진점검</strong>
            <p>이 화면은 운영자용 클라우드 점검입니다. 서버 인증 뒤 사진·조치·재점검 자료를 중앙에 보관합니다. 일반 체험자는 아래 기기 점검을 이용하세요.</p>
            <a href="/field-local/">로그인 없이 기기 점검 · 기록은 내 브라우저에</a>{' · '}<a href="/camera">간편 현장 카메라</a>{' · '}
            <a href="/product">로그인 없이 예시 체험 보기</a>
        </div>
        <AdminLockScreen onUnlock={unlock} errorMessage={error} isSubmitting={submitting}/>
    </div>;
    return <div className="inspector-standalone">
        <a className="inspector-standalone-skip" href="#inspector-standalone-main">사진점검 본문으로 이동</a>
        <header className="inspector-standalone-header">
            <div className="inspector-standalone-brand"><small>FIELD SAFETY · PSI INSPECTOR</small><strong>사진점검 전용 작업공간</strong>
            <p>사진 한 장 → 위험 검토 → 현장 조치 → 재점검 → 보고서</p><p aria-label="실행 코드 버전">{currentReleaseLabel()}</p></div>
            <details className="inspector-standalone-navigation"><summary>사용 안내 · 이동 · 로그아웃</summary><nav aria-label="독립 사진점검 탐색">
                <a href="/product">사용 안내</a>
                <a href="/">PSI 전체로 이동</a>
                <button type="button" disabled={submitting} onClick={()=>void logout()}>사진점검에서 로그아웃</button>
            </nav></details>
        </header>
        <main id="inspector-standalone-main"><SafetyInspector onUnsavedChange={setUnsaved}/></main>
        <footer className="inspector-standalone-footer">
            별도 접속 화면이지만 인증·저장은 현재 NEW-PSI 점검 서비스와 공유합니다. 협력사 안전관리비·안전시설비·신호수 인건비는 이 화면에서 집계하거나 처리하지 않습니다.
        </footer>
    </div>;
}

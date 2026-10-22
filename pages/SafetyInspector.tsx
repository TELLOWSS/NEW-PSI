import React,{lazy,Suspense,useState} from 'react';
import InspectorQuickWorkspace from '../components/inspector/InspectorQuickWorkspace';
import '../components/inspector/inspector.css';
import '../components/inspector/inspector-experience.css';
import '../components/inspector/inspector-quick.css';

const InspectorAdvancedWorkspace=lazy(()=>import('./InspectorAdvancedWorkspace'));

export default function SafetyInspector() {
    const [advanced,setAdvanced]=useState(false);
    return advanced?<Suspense fallback={<p role="status">저장 기록을 준비합니다…</p>}><InspectorAdvancedWorkspace onQuick={()=>setAdvanced(false)}/></Suspense>:<InspectorQuickWorkspace onAdvanced={()=>setAdvanced(true)}/>;
}

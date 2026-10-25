import React,{lazy,Suspense,useState} from 'react';
import InspectorQuickWorkspace from '../components/inspector/InspectorQuickWorkspace';
import type {RecordResumeEntry} from '../lib/inspector/recordResume';
import '../components/inspector/inspector.css';
import '../components/inspector/inspector-experience.css';
import '../components/inspector/inspector-quick.css';
import '../components/inspector/inspector-collab.css';

const InspectorAdvancedWorkspace=lazy(()=>import('./InspectorAdvancedWorkspace'));

export default function SafetyInspector() {
    const [view,setView]=useState<{advanced:boolean;entry?:RecordResumeEntry}>({advanced:false});
    return view.advanced?<Suspense fallback={<p role="status">저장 기록을 준비합니다…</p>}><InspectorAdvancedWorkspace onQuick={()=>setView({advanced:false})} onResume={entry=>setView({advanced:false,entry})}/></Suspense>:<InspectorQuickWorkspace initialEntry={view.entry} onAdvanced={()=>setView({advanced:true})}/>;
}

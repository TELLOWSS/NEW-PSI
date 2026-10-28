import React from 'react';
import {createRoot} from 'react-dom/client';
import InspectorCameraDialog from '../components/inspector/InspectorCameraDialog';
import '../components/inspector/inspector-experience.css';
const params=new URLSearchParams(location.search);
const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const context=canvas.getContext('2d')!;context.fillStyle='#ff0000';context.fillRect(0,0,640,480);
const url=params.get('failure')?'bad-reference':canvas.toDataURL();
createRoot(document.getElementById('root')!).render(<InspectorCameraDialog reference={{label:'조치 전 · 사진 1',url}} onClose={()=>{document.body.dataset.closed='true';}} onUse={file=>{(window as any).captured=file;}}/>);

import React from 'react';
import {legalForText} from '../../lib/inspector/legal';
import InspectorAnswer from './InspectorAnswer';
import './inspector.css';
import './inspector-experience.css';
import './inspector-quick.css';

export default function InspectorProductReference({keyword}:{keyword:string}) {
    const reference=legalForText(keyword);
    return <section className="si-workspace" aria-label="체험 장면의 관련 기준"><p className="si-caption">체험용 장면의 주제로 찾은 날짜 고정 참고 자료입니다. 사진 AI 판독·실제 위반 판정이 아닙니다. 원문 검토일: {reference.reviewedAt}.</p><InspectorAnswer key={keyword} analysis={null} reference={reference} note={keyword}/></section>;
}

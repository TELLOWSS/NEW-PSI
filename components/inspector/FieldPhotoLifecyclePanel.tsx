import React from 'react';
import type { FieldPhotoLifecycleStage } from '../../lib/inspector/fieldPhotoLifecycle';

export default function FieldPhotoLifecyclePanel({ stages }: { stages: readonly FieldPhotoLifecycleStage[] }) {
    return (
        <section className="field-camera-lifecycle" aria-label="사진 처리 단계별 상태" data-psi-photo-lifecycle="true">
            <div className="field-camera-lifecycle-head">
                <div>
                    <span>사진의 현재 위치</span>
                    <h2>저장과 전달은 서로 다릅니다</h2>
                </div>
                <p>사진함 보관, 외부 공유, 수신 확인, 실제 조치 검수를 단계별로 구분합니다.</p>
            </div>
            <ol className="field-camera-lifecycle-grid">
                {stages.map(stage => (
                    <li className="field-camera-lifecycle-stage" data-stage={stage.key} data-tone={stage.tone} key={stage.key}>
                        <span className="field-camera-lifecycle-label">{stage.title}</span>
                        <strong>{stage.status}</strong>
                        <p>{stage.detail}</p>
                    </li>
                ))}
            </ol>
        </section>
    );
}

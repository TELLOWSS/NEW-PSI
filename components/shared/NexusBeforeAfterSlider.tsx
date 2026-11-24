import React, { useState } from 'react';

interface Props {
  beforeUrl: string;
  afterUrl: string;
  label?: string;
}

export const NexusBeforeAfterSlider: React.FC<Props> = ({
  beforeUrl,
  afterUrl,
  label = '시정조치 전후 사진 비교',
}) => {
  const [splitPct, setSplitPct] = useState(50);

  return (
    <div className="nexus-ba-slider" role="group" aria-label={label}>
      <div className="nexus-ba-viewport">
        <img src={afterUrl} alt="조치 후 재점검 사진" className="nexus-ba-img is-after" />
        <img
          src={beforeUrl}
          alt="조치 전 위험 사진"
          className="nexus-ba-img is-before"
          style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
        />
        <div className="nexus-ba-divider" style={{ left: `${splitPct}%` }} aria-hidden="true">
          <span>↔</span>
        </div>
        <span className="nexus-ba-tag is-left">조치 전</span>
        <span className="nexus-ba-tag is-right">조치 후</span>
      </div>
      <label className="nexus-ba-range-row">
        <span>전/후 분할 비교 ({splitPct}%)</span>
        <input
          type="range"
          min={5}
          max={95}
          value={splitPct}
          aria-label="조치 전후 사진 비교 슬라이더"
          onChange={e => setSplitPct(Number(e.target.value))}
        />
      </label>
    </div>
  );
};

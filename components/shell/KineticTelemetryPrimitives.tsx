import React, { useEffect, useId, useRef, useState } from 'react';
import type { NexusDecisionSignalLevel } from '../../utils/nexusDecisionBrief';
import type { PsiConnectedPageTrendTone } from '../../utils/psiPageDecisionBrief';

const prefersReducedOrPaused = (): boolean => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return true;
  if (document.documentElement.dataset.psiMotionPaused === 'true') return true;
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
};

interface KineticCounterProps {
  value: number;
  suffix?: string;
  fallbackText?: string;
}

/**
 * 실시간 KPI 수치를 감속 곡선으로 부드럽게 카운트업하며, 모션 정지·고대비·접근성 모드를 준수합니다.
 */
export const KineticCounter: React.FC<KineticCounterProps> = ({
  value,
  suffix = '',
  fallbackText,
}) => {
  const safeTarget = Number.isFinite(value) ? value : 0;
  const [displayValue, setDisplayValue] = useState<number>(safeTarget);
  const previousRef = useRef<number>(safeTarget);
  const mountedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    if (prefersReducedOrPaused() || value === 0) {
      previousRef.current = value;
      setDisplayValue(value);
      mountedRef.current = true;
      return;
    }

    const fromValue = mountedRef.current
      ? previousRef.current
      : Math.max(0, Math.round(value * 0.45));
    mountedRef.current = true;

    if (fromValue === value) {
      setDisplayValue(value);
      previousRef.current = value;
      return;
    }

    const duration = 420;
    const start = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      if (prefersReducedOrPaused()) {
        previousRef.current = value;
        setDisplayValue(value);
        return;
      }
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = Math.round(fromValue + (value - fromValue) * eased);
      setDisplayValue(nextVal);
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        previousRef.current = value;
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  if (!Number.isFinite(value) && fallbackText) {
    return <span className="psi-tabular-num">{fallbackText}</span>;
  }

  return (
    <span className="psi-tabular-num">
      {displayValue}
      {suffix}
    </span>
  );
};

interface KineticSparklineProps {
  points: readonly number[];
  tone: PsiConnectedPageTrendTone;
  label: string;
}

/**
 * 초경량 SVG 추세선과 실시간 맥박 점을 렌더링합니다.
 */
export const KineticSparkline: React.FC<KineticSparklineProps> = ({
  points,
  tone,
  label,
}) => {
  const gradientId = useId().replace(/:/g, '');
  const normalized = points.length >= 2 ? points : [45, 50, 52, 55, 58, 60];
  const width = 76;
  const height = 24;
  const padX = 3;
  const padY = 4;
  const stepX = (width - padX * 2) / Math.max(1, normalized.length - 1);

  const coords = normalized.map((raw, idx) => {
    const clamped = Math.max(0, Math.min(100, raw));
    const x = +(padX + idx * stepX).toFixed(1);
    const y = +(height - padY - (clamped / 100) * (height - padY * 2)).toFixed(1);
    return { x, y };
  });

  const linePath = coords
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${pt.x} ${pt.y}`)
    .join(' ');
  const areaPoints = [
    `${coords[0].x},${height}`,
    ...coords.map(pt => `${pt.x},${pt.y}`),
    `${coords[coords.length - 1].x},${height}`,
  ].join(' ');
  const last = coords[coords.length - 1];

  return (
    <svg
      className={'psi-kinetic-sparkline is-' + tone}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      data-label={label}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <path
        className="psi-sparkline-path"
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle className="psi-sparkline-halo" cx={last.x} cy={last.y} r="4.2" fill="currentColor" />
      <circle className="psi-sparkline-dot" cx={last.x} cy={last.y} r="2.2" fill="currentColor" />
    </svg>
  );
};

interface SignalBeaconProps {
  level: NexusDecisionSignalLevel;
  label: string;
}

/**
 * ISO 안전 등급과 살아 숨 쉬는 동심원 비컨을 결합한 상태 표시기입니다.
 */
export const SignalBeacon: React.FC<SignalBeaconProps> = ({ level, label }) => (
  <em className={'psi-cd-signal is-' + level}>
    <span className="psi-kinetic-beacon" aria-hidden="true">
      <i />
    </span>
    <span>{label}</span>
  </em>
);

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Page, WorkerRecord } from '../types';
import { filterLoadedNexusRecords, sliceLoadedNexusRecords } from '../utils/safetyNexusViewModel';
import { buildMonthlyFieldFollowupSummary, collectMonthlyFollowupCases, getKoreanCalendarDay } from '../utils/monthlyFieldFollowup';
import { buildPracticeVerificationSummary, collectOverduePracticeRechecks, PRACTICE_RESULT_LABELS } from '../utils/practiceVerification';
import { FOLLOWUP_STATUS_LABELS } from '../utils/workerRiskFollowup';
import {
  NEXUS_ORBIT_LAYERS,
  NEXUS_SPHERE_NODES_BY_LAYER,
  computeTargetAnglesForLatLon,
  formatSphericalCoord,
  latLonToUnitVec3,
  normalizeAngleRad,
  projectNodeToStage,
  shortestAngleStep,
  type NexusOrbitLayer,
} from '../utils/nexusSphereProjection';
import {
  NEXUS_HAZARD_EQUIPMENT_AXIS_OPTIONS,
  NEXUS_PROCESS_AXIS_OPTIONS,
  NEXUS_ZONE_AXIS_OPTIONS,
  buildOrbitLayerLiveSignals,
  type NexusHazardEquipmentAxis,
  type NexusProcessAxis,
  type NexusThreeAxisFilter,
  type NexusZoneAxis,
} from '../utils/nexusStructuralTaxonomy';
import {
  NEXUS_PIPELINE_UPDATED_EVENT,
  buildShiftHandoverBriefingText,
  readNexusPipelineCases,
  summarizePipelineForOrbitLayer,
  type NexusPipelineCase,
} from '../utils/nexusQuickPipeline';
import {
  NEXUS_CEO_TRAINING_UPDATED_EVENT,
  readExecutiveTrainingCampaigns,
  stageExecutiveTrainingHandoff,
  summarizeExecutiveTrainingForOrbitLayer,
  type NexusExecutiveTrainingCampaign,
} from '../utils/nexusExecutiveTrainingPipeline';
import {
  NEXUS_HQ_LOOP_UPDATED_EVENT,
  buildMultiSitePortfolioMatrix,
  readAiInvestigations,
  readApprovedCustomIncidentSeeds,
  readHqVisitPlans,
  scopeNexusWorkspaceData,
  seedMultiSiteOperationalSimulation,
  summarizeHqLoopForOrbitLayer,
  type NexusAiInvestigationRecord,
  type NexusHqVisitPlan,
  type NexusWorkspaceAuthority,
} from '../utils/nexusHqCommandLoop';
import {
  NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT,
  buildUnifiedCeoDailyBriefing,
  readEquipmentPhotoSubmissions,
  type NexusEquipmentPhotoSubmission,
  type NexusUnifiedCeoDailyBriefing,
} from '../utils/nexusEquipmentPhotoReport';
import {
  NEXUS_SITE_MASTER_UPDATED_EVENT,
  readManagedNexusSites,
  type NexusManagedSite,
} from '../utils/nexusSiteRegistry';
import { exportExecutiveBriefingPptx } from '../utils/nexusExecutivePptx';
import { downloadNexusComplianceZip } from '../utils/nexusComplianceBundle';
import {
  NEXUS_OFFLINE_QUEUE_UPDATED_EVENT,
  getPendingOfflineQueueCount,
  isNexusOnline,
  resolveOfflineSyncConflict,
  type NexusConflictResolutionChoice,
  type NexusOfflineSyncConflict,
} from '../utils/nexusOfflineQueue';
import { syncNexusOfflineQueueWithServer } from '../utils/nexusSyncEngine';
import { buildExecutiveBentoSnapshot } from '../utils/nexusExecutiveBentoMetrics';
import { NexusExecutiveBentoBoard } from '../components/shared/NexusExecutiveBentoBoard';
import { NexusStructuralElevationMap } from '../components/shared/NexusStructuralElevationMap';
import { buildRoleScopedCommands, type NexusCommandAction } from '../utils/nexusCommandPalette';
import type { NexusStructuralIncidentSeed } from '../utils/nexusStructuralTaxonomy';
import {
  NexusHqCommandWorkbench,
  type NexusWorkbenchTab,
} from '../components/inspector/NexusHqCommandWorkbench';
import {
  buildNexusDecisionBrief,
  getAllowedDecisionPersonas,
  type NexusDecisionActionTarget,
  type NexusDecisionPersona,
} from '../utils/nexusDecisionBrief';
import { NexusDecisionFirstBrief } from '../components/shared/NexusDecisionFirstBrief';
import WebGLNexusCore from './NexusWebGLCore';
import { ScoreMetricEvidencePanel } from '../components/shared/ScoreMetricEvidencePanel';
import { PracticeEvidencePanel, type PracticeEvidenceSelection } from '../components/shared/PracticeEvidencePanel';
import { nexusFeatureFlags } from '../config/nexusFeatureFlags';
import {
  SUNLIGHT_MODE_CHANGED_EVENT,
  THEME_CHANGED_EVENT,
  getResolvedTheme,
  getSunlightMode,
  setSunlightMode as persistGlobalSunlightMode,
  type ResolvedTheme,
} from '../utils/themeUtils';
import './SafetyNexus.css';

const NEXUS_THEME_OVERRIDE_KEY = 'psi_nexus_theme_override_v1';

const FOLLOWUP_FILTER_LABELS = { overdue: '기한 초과', unresolved: '미완료', interim_control: '임시 통제 중', scheduled: '조치 예정', reopened: '재개방 이력', completed: '완료로 기록된' } as const;
type FollowupFilter = keyof typeof FOLLOWUP_FILTER_LABELS;
export type NexusViewState = { month: string; trade: string; active: number; flat: boolean; question: number | null; priority: FollowupFilter | 'recheck' | null; practice?: PracticeEvidenceSelection | null; orbitLayer?: NexusOrbitLayer };
export type NexusWorkspaceView =
  | 'hq_command'
  | 'hq_bi'
  | 'hq_ops'
  | 'hq_audit'
  | 'field_ops'
  | 'field_inbox'
  | 'field_sphere';
type Props = {
  workerRecords: WorkerRecord[];
  loadState?: 'loading' | 'ready' | 'error';
  initialTrade?: string;
  initialView?: NexusViewState | null;
  lockedRole?: NexusWorkspaceAuthority;
  lockedSiteId?: string;
  initialRole?: NexusWorkspaceAuthority;
  onViewChange?: (view: NexusViewState) => void;
  onNavigateToPage: (page: Page) => void;
  onReturnDashboard?: (trade: string) => void;
  onOpenRecord?: (record: WorkerRecord) => void;
};

const METRICS = [
  ['01', '위험인지', 'Awareness'], ['02', '교육이해', 'Understanding'], ['03', '실천참여', 'Engagement'],
  ['04', '보호구·수칙', 'Protection'], ['05', '소통·보고', 'Communication'], ['06', '작업중지 감수성', 'Stop-work awareness'],
];

const CoreArt: React.FC<{ active: number; paused: boolean; reduced: boolean; sequenceNonce?: number; cinematicActive?: boolean; yaw?: number; pitch?: number }> = ({ active, paused, reduced, sequenceNonce = 0, cinematicActive = false, yaw = 0, pitch = 0.22 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const focusRef = useRef(active);
  const yawRef = useRef(yaw);
  const pitchRef = useRef(pitch);
  useEffect(() => { focusRef.current = active; yawRef.current = yaw; pitchRef.current = pitch; }, [active, yaw, pitch]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = 0;
    let phase = 0;
    const sceneStarted = performance.now();
    let smoothedFocus = focusRef.current;
    let smoothedYaw = yawRef.current;
    let smoothedPitch = pitchRef.current;
    let visible = document.visibilityState === 'visible';
    let w = 600, h = 540;
    const n = window.matchMedia('(max-width: 700px)').matches ? 680 : 1700;
    const points = Array.from({ length: n }, (_, i) => {
      const y = 1 - (i + .5) * 2 / n, a = i * Math.PI * (3 - Math.sqrt(5)), r = Math.sqrt(Math.max(0, 1 - y * y));
      return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, seed: ((i * 47) % 101) / 101, color: i % 15 === 0 ? 1 : 0 };
    });
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(rect.width, 1); h = Math.max(rect.height, 1);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width = Math.round(w * pixelRatio); canvas.height = Math.round(h * pixelRatio);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      draw();
    };
    const rotate = (x: number, y: number, z: number, ay: number, ax: number) => {
      const xx = x * Math.cos(ay) + z * Math.sin(ay), zz = z * Math.cos(ay) - x * Math.sin(ay);
      return { x: xx, y: y * Math.cos(ax) - zz * Math.sin(ax), z: y * Math.sin(ax) + zz * Math.cos(ax) };
    };
    const draw = () => {
      smoothedFocus += (focusRef.current - smoothedFocus) * .085;
      smoothedYaw = paused || reduced ? yawRef.current : shortestAngleStep(smoothedYaw, yawRef.current, 0.14);
      smoothedPitch = paused || reduced ? pitchRef.current : smoothedPitch + (pitchRef.current - smoothedPitch) * 0.14;
      const t = reduced ? 0.35 : phase;
      const story = cinematicActive ? Math.min(12, (performance.now() - sceneStarted) / 1000) : -1;
      const sweep = story >= 0 ? Math.max(0, Math.min(1, story / 12)) : 0;
      const cx = w * .5 + Math.sin(t * .34) * w * .009 + (story >= 0 ? Math.sin(story * .48) * w * .013 : 0);
      const cy = h * .50 + Math.cos(t * .26) * h * .007 + (story >= 0 ? (sweep - .5) * h * .013 : 0);
      const R = Math.min(w * .255, h * .275, 176) * (story >= 0 ? (1 + .075 * Math.sin(sweep * Math.PI)) : 1);
      ctx.clearRect(0, 0, w, h);
      const halo = ctx.createRadialGradient(cx, cy, R * .06, cx, cy, R * 2.2);
      halo.addColorStop(0, 'rgba(255,205,116,.26)'); halo.addColorStop(.36, 'rgba(247,139,55,.072)');
      halo.addColorStop(.8, 'rgba(22,115,139,.023)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo; ctx.fillRect(cx - R * 2.3, cy - R * 2.3, R * 4.6, R * 4.6);
      const project = (x: number, y: number, z: number) => { const d = 3 / (3 - z * .45); return { x: cx + x * R * d, y: cy + y * R * d, d }; };
      // Geodesic latitude rings on fallback 2D canvas
      for (const lat of [-0.55, 0, 0.55]) {
        const gr = Math.cos(lat) * 1.02, gy = Math.sin(lat) * 1.02;
        ctx.lineWidth = 0.65;
        ctx.strokeStyle = lat === 0 ? 'rgba(251,196,120,0.22)' : 'rgba(98,218,228,0.14)';
        ctx.beginPath();
        for (let j = 0; j <= 64; j++) {
          const a = (j / 64) * Math.PI * 2;
          const p = rotate(Math.cos(a) * gr, gy, Math.sin(a) * gr, smoothedYaw + t * 0.24, smoothedPitch);
          const s = project(p.x, p.y, p.z);
          if (j === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
      }
      for (let ring = 0; ring < 3; ring++) {
        const incline = [.43, -.84, 1.06][ring] + smoothedPitch * 0.3, spin = t * [.43, -.29, .17][ring] + ring * .8 + smoothedYaw * 0.4;
        ctx.lineWidth = .7;
        for (let j = 0; j < 170; j++) {
          const a = j * 2 * Math.PI / 170, b = (j + 1) * 2 * Math.PI / 170;
          const p = rotate(Math.cos(a) * 1.66, Math.sin(a) * 1.66, 0, spin, incline);
          const q = rotate(Math.cos(b) * 1.66, Math.sin(b) * 1.66, 0, spin, incline);
          const s = project(p.x, p.y, p.z), e = project(q.x, q.y, q.z);
          ctx.strokeStyle = ring === 2 ? 'rgba(82,217,229,' + (.09 + Math.max(0, p.z) * .15) + ')' : 'rgba(251,186,108,' + (.07 + Math.max(0, p.z) * .18) + ')';
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        }
        const a = t * (ring === 1 ? -1.2 : 1.05) + ring * 1.8, p = rotate(Math.cos(a) * 1.66, Math.sin(a) * 1.66, 0, spin, incline), d = project(p.x, p.y, p.z);
        ctx.shadowColor = ring === 2 ? '#60ebec' : '#ffc37e'; ctx.shadowBlur = 14;
        ctx.fillStyle = ring === 2 ? '#76e6eb' : '#ffcf9b'; ctx.beginPath(); ctx.arc(d.x, d.y, 2.3, 0, 2 * Math.PI); ctx.fill(); ctx.shadowBlur = 0;
      }
      const sorted = points.map(p => {
        const pos = rotate(p.x, p.y, p.z, smoothedYaw + t * 0.24 + smoothedFocus * .04, smoothedPitch + Math.sin(t * .5) * .08);
        const size = 1 + .035 * Math.sin(t * 4 + p.seed * 19), pr = project(pos.x * size, pos.y * size, pos.z * size);
        return { x: pr.x, y: pr.y, z: pos.z, s: (.5 + p.seed * 1.05) * pr.d, color: p.color };
      }).sort((a, b) => a.z - b.z);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 12;
      sorted.forEach((p, i) => {
        if (i % 29 !== 0 || p.z < .05) return;
        ctx.shadowColor = p.color ? '#74e8e2' : '#ffc18a';
        ctx.fillStyle = p.color ? 'rgba(88,223,227,.30)' : 'rgba(255,191,106,.33)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 1.7, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
      sorted.forEach(p => {
        const alpha = (p.z > 0 ? .48 : .22) + Math.max(0, p.z) * .36;
        ctx.fillStyle = p.color ? 'rgba(119,236,236,' + alpha + ')' : 'rgba(255,189,106,' + alpha + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
      });
      const centerGlow = ctx.createRadialGradient(cx, cy, 5, cx, cy, R * .68);
      centerGlow.addColorStop(0, 'rgba(255,216,162,.09)'); centerGlow.addColorStop(1, 'rgba(255,180,95,0)');
      ctx.fillStyle = centerGlow; ctx.beginPath(); ctx.arc(cx, cy, R * .7, 0, Math.PI * 2); ctx.fill();
    };
    const tick = (time: number) => {
      if (!visible || paused || reduced) return;
      if (time - last > 31) { phase += .018; last = time; draw(); }
      raf = requestAnimationFrame(tick);
    };
    const visibility = () => {
      visible = document.visibilityState === 'visible'; cancelAnimationFrame(raf);
      if (visible && !paused && !reduced) raf = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    document.addEventListener('visibilitychange', visibility);
    resize();
    if (!paused && !reduced && visible) raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, [paused, reduced, sequenceNonce, cinematicActive, yaw, pitch]);
  return <canvas ref={ref} className="nexus-core-canvas" aria-hidden="true" />;
};

const SafetyNexus: React.FC<Props> = ({
  workerRecords,
  loadState = 'ready',
  initialTrade = '',
  initialView,
  lockedRole,
  lockedSiteId,
  initialRole = 'hq',
  onViewChange,
  onNavigateToPage,
  onReturnDashboard,
  onOpenRecord: requestOpenRecord,
}) => {
  const [orbitLayer, setOrbitLayer] = useState<NexusOrbitLayer>(initialView?.orbitLayer ?? 'cycle');
  const layerNodes = NEXUS_SPHERE_NODES_BY_LAYER[orbitLayer];
  const [active, setActive] = useState(initialView?.active ?? 0);
  const safeActive = active < layerNodes.length ? active : 0;
  const selected = layerNodes[safeActive];

  // Spherical rotation state (yaw/pitch) locked onto the active node or dragged by the user
  const initialAngles = useMemo(
    () => computeTargetAnglesForLatLon(selected.latDeg, selected.lonDeg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [sphereAngles, setSphereAngles] = useState<{ yaw: number; pitch: number }>(initialAngles);
  const [zoomScale, setZoomScale] = useState(1);
  const [isDraggingSphere, setIsDraggingSphere] = useState(false);
  const dragStateRef = useRef<{ active: boolean; startX: number; startY: number; startYaw: number; startPitch: number; moved: boolean; vx: number; vy: number; lastX: number; lastY: number }>({
    active: false, startX: 0, startY: 0, startYaw: 0, startPitch: 0, moved: false, vx: 0, vy: 0, lastX: 0, lastY: 0,
  });
  const inertiaRafRef = useRef<number>(0);

  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 700px)');
    const update = (e: MediaQueryListEvent) => setIsMobileViewport(e.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const [immersive, setImmersive] = useState(false);
  const [recordNotice, setRecordNotice] = useState('');
  const [pendingRecord, setPendingRecord] = useState<WorkerRecord | null>(null);
  const onOpenRecord = requestOpenRecord ? (record: WorkerRecord) => {
    if (workerRecords.filter(row => String(row.id || '').trim() === String(record.id || '').trim()).length !== 1) {
      setRecordNotice('동일 식별자의 기록이 여러 개입니다. 오래된 이력으로 덮어쓰지 않도록 상세 편집을 열지 않았습니다. 원본 기록을 대조해 주세요.');
      return;
    }
    setRecordNotice(''); setImmersive(false); setPendingRecord(record);
  } : undefined;
  useEffect(() => {
    if (!pendingRecord || immersive) return;
    const frame = requestAnimationFrame(() => { requestOpenRecord?.(pendingRecord); setPendingRecord(null); });
    return () => cancelAnimationFrame(frame);
  }, [pendingRecord, immersive, requestOpenRecord]);
  const immersiveToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!immersive) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const surface = document.querySelector<HTMLElement>('.safety-nexus.is-immersive');
    const background = Array.from(document.body.children).filter((element): element is HTMLElement =>
      element instanceof HTMLElement && element !== surface && !element.contains(surface));
    const previousInert = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    immersiveToggleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setImmersive(false); return; }
      if (event.key !== 'Tab') return;
      const surface = document.querySelector<HTMLElement>('.safety-nexus.is-immersive');
      const targets = surface ? Array.from(surface.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), summary, a[href], [tabindex]:not([tabindex="-1"])')).filter(el => el.getClientRects().length > 0) : [];
      if (!targets.length) return;
      const first = targets[0], last = targets[targets.length - 1];
      if (event.shiftKey && (document.activeElement === first || !surface?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !surface?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = priorOverflow; document.removeEventListener('keydown', onKey); background.forEach((element, index) => { element.inert = previousInert[index]; }); requestAnimationFrame(() => immersiveToggleRef.current?.focus()); };
  }, [immersive]);
  const [flat, setFlat] = useState(!nexusFeatureFlags.threeDEnabled || (initialView?.flat ?? false));
  const [cinematicPlaying, setCinematicPlaying] = useState(false);
  const [cinematicNonce, setCinematicNonce] = useState(0);
  useEffect(() => {
    if (!cinematicPlaying) return;
    const timeout = setTimeout(() => setCinematicPlaying(false), 12000);
    return () => clearTimeout(timeout);
  }, [cinematicPlaying, cinematicNonce]);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdActiveIdx, setCmdActiveIdx] = useState(0);
  const [floatingToast, setFloatingToast] = useState('');
  const [nexusTheme, setNexusTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const saved = window.localStorage.getItem(NEXUS_THEME_OVERRIDE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // Ignore storage errors
    }
    return getResolvedTheme();
  });
  const [sunlightMode, setSunlightMode] = useState<boolean>(() => getSunlightMode());
  useEffect(() => {
    const syncGlobalTheme = () => {
      try {
        window.localStorage.removeItem(NEXUS_THEME_OVERRIDE_KEY);
      } catch {
        // Ignore storage errors
      }
      setNexusTheme(getResolvedTheme());
    };
    const syncSunlight = () => setSunlightMode(getSunlightMode());
    window.addEventListener(THEME_CHANGED_EVENT, syncGlobalTheme);
    window.addEventListener(SUNLIGHT_MODE_CHANGED_EVENT, syncSunlight);
    return () => {
      window.removeEventListener(THEME_CHANGED_EVENT, syncGlobalTheme);
      window.removeEventListener(SUNLIGHT_MODE_CHANGED_EVENT, syncSunlight);
    };
  }, []);
  const handleToggleNexusTheme = () => {
    const next: ResolvedTheme = nexusTheme === 'light' ? 'dark' : 'light';
    setNexusTheme(next);
    if (next === 'dark') {
      persistGlobalSunlightMode(false);
      setSunlightMode(false);
    }
    try {
      window.localStorage.setItem(NEXUS_THEME_OVERRIDE_KEY, next);
    } catch {
      // Ignore storage errors
    }
    triggerToast(
      next === 'light'
        ? '☀️ 밝은 화면(화이트 테마)으로 전환되었습니다'
        : '🌙 어두운 화면(다크 테마)으로 전환되었습니다',
    );
  };
  const handleToggleSunlightMode = () => {
    const next = persistGlobalSunlightMode(!sunlightMode);
    setSunlightMode(next);
    if (next && nexusTheme !== 'light') {
      setNexusTheme('light');
      try {
        window.localStorage.setItem(NEXUS_THEME_OVERRIDE_KEY, 'light');
      } catch {
        // Ignore storage errors
      }
    }
    triggerToast(
      next
        ? '☀️ 야외 직사광선 고대비 모드가 켜졌습니다'
        : '🔆 일반 화면 모드로 복귀했습니다',
    );
  };
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerToast = (msg: string) => {
    setFloatingToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setFloatingToast(''), 3200);
  };
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    preference.addEventListener('change', onChange);
    return () => preference.removeEventListener('change', onChange);
  }, []);
  useEffect(() => { if (reduced) setCinematicPlaying(false); }, [reduced]);

  const lockOntoNode = (
    nextIndex: number,
    nextLayer: NexusOrbitLayer = orbitLayer,
    options?: { syncWorkbenchTab?: boolean },
  ) => {
    const list = NEXUS_SPHERE_NODES_BY_LAYER[nextLayer];
    const bounded = ((nextIndex % list.length) + list.length) % list.length;
    const targetNode = list[bounded];
    setActive(bounded);
    setSphereAngles(computeTargetAnglesForLatLon(targetNode.latDeg, targetNode.lonDeg));
    if (options?.syncWorkbenchTab && nextLayer === 'modules') {
      if (bounded === 0) setWorkbenchTab('visit_01');
      else if (bounded === 1 || bounded === 4) setWorkbenchTab('investigate_05_02');
      else if (bounded === 3) setWorkbenchTab('training_04');
      else setWorkbenchTab('inspect_03_06');
    }
  };

  const handleLayerSwitch = (nextLayer: NexusOrbitLayer) => {
    setOrbitLayer(nextLayer);
    const firstNode = NEXUS_SPHERE_NODES_BY_LAYER[nextLayer][0];
    setActive(0);
    setSphereAngles(computeTargetAnglesForLatLon(firstNode.latDeg, firstNode.lonDeg));
  };

  const handleStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (flat) return;
    const targetEl = event.target as HTMLElement | null;
    if (targetEl?.closest('button')) return;
    if (inertiaRafRef.current) cancelAnimationFrame(inertiaRafRef.current);
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startYaw: sphereAngles.yaw,
      startPitch: sphereAngles.pitch,
      moved: false,
      vx: 0,
      vy: 0,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    setIsDraggingSphere(true);
  };

  const handleStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active || flat) return;
    const dx = event.clientX - dragStateRef.current.startX;
    const dy = event.clientY - dragStateRef.current.startY;
    dragStateRef.current.vx = (event.clientX - dragStateRef.current.lastX) * 0.0075;
    dragStateRef.current.vy = (event.clientY - dragStateRef.current.lastY) * 0.0065;
    dragStateRef.current.lastX = event.clientX;
    dragStateRef.current.lastY = event.clientY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragStateRef.current.moved = true;
    const nextYaw = normalizeAngleRad(dragStateRef.current.startYaw + dx * 0.0075);
    const nextPitch = Math.max(-0.78, Math.min(0.78, dragStateRef.current.startPitch + dy * 0.0065));
    setSphereAngles({ yaw: nextYaw, pitch: nextPitch });
  };

  const handleStagePointerUp = () => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    setIsDraggingSphere(false);
    if (paused || reduced) return;
    let vx = dragStateRef.current.vx;
    let vy = dragStateRef.current.vy;
    if (Math.hypot(vx, vy) < 0.002) return;
    const stepInertia = () => {
      vx *= 0.91;
      vy *= 0.91;
      if (Math.hypot(vx, vy) < 0.0005) return;
      setSphereAngles(prev => ({
        yaw: normalizeAngleRad(prev.yaw + vx),
        pitch: Math.max(-0.78, Math.min(0.78, prev.pitch + vy)),
      }));
      inertiaRafRef.current = requestAnimationFrame(stepInertia);
    };
    inertiaRafRef.current = requestAnimationFrame(stepInertia);
  };

  const [filterMonth, setFilterMonth] = useState(initialView?.month ?? '');
  const [filterTrade, setFilterTrade] = useState(initialView?.trade ?? initialTrade);
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(initialView?.question ?? null);
  const [priorityFilter, setPriorityFilter] = useState<FollowupFilter | 'recheck' | null>(initialView?.priority ?? null);
  const [practiceFilter, setPracticeFilter] = useState<PracticeEvidenceSelection | null>(initialView?.practice ?? null);
  const [axisFilter, setAxisFilter] = useState<NexusThreeAxisFilter>({
    zoneAxis: '',
    processAxis: '',
    hazardEquipmentAxis: '',
  });
  const [selectedSeedIdx, setSelectedSeedIdx] = useState(0);
  const [pipelineCases, setPipelineCases] = useState<NexusPipelineCase[]>(() => readNexusPipelineCases());
  const [trainingCampaigns, setTrainingCampaigns] = useState<NexusExecutiveTrainingCampaign[]>(() =>
    readExecutiveTrainingCampaigns(),
  );
  const [visitPlans, setVisitPlans] = useState<NexusHqVisitPlan[]>(() => readHqVisitPlans());
  const [investigations, setInvestigations] = useState<NexusAiInvestigationRecord[]>(() => readAiInvestigations());
  const [approvedCustomSeeds, setApprovedCustomSeeds] = useState<NexusStructuralIncidentSeed[]>(() =>
    readApprovedCustomIncidentSeeds(),
  );
  const [equipmentReports, setEquipmentReports] = useState<NexusEquipmentPhotoSubmission[]>(() =>
    readEquipmentPhotoSubmissions(),
  );
  const [managedSites, setManagedSites] = useState<NexusManagedSite[]>(() => readManagedNexusSites(false));
  const [workspaceRole, setWorkspaceRole] = useState<NexusWorkspaceAuthority>(lockedRole ?? initialRole);
  const [hqSelectedSiteId, setHqSelectedSiteId] = useState<string>('');
  const [assignedFieldSiteId, setAssignedFieldSiteId] = useState<string>(
    lockedSiteId || readManagedNexusSites(false)[0]?.siteId || 'SITE-01-SUBRC',
  );
  const [activeView, setActiveView] = useState<NexusWorkspaceView>(
    (lockedRole ?? initialRole) === 'field' ? 'field_ops' : 'hq_command',
  );
  const [showAxisFilterBar, setShowAxisFilterBar] = useState<boolean>(false);
  const [workbenchTab, setWorkbenchTab] = useState<NexusWorkbenchTab>(
    (lockedRole ?? initialRole) === 'field' ? 'inspect_03_06' : 'equipment_photo',
  );
  const [dailyCeoBriefing, setDailyCeoBriefing] = useState<NexusUnifiedCeoDailyBriefing | null>(null);
  const [dailyBriefingNotice, setDailyBriefingNotice] = useState<string>('');
  const [offlinePendingCount, setOfflinePendingCount] = useState<number>(() => getPendingOfflineQueueCount());
  const [isOnlineState, setIsOnlineState] = useState<boolean>(() => isNexusOnline());
  const [syncNotice, setSyncNotice] = useState<string>('');
  const [syncConflicts, setSyncConflicts] = useState<NexusOfflineSyncConflict[]>([]);
  const [conflictDrawerOpen, setConflictDrawerOpen] = useState<boolean>(false);
  const [quickStopWorkTrigger, setQuickStopWorkTrigger] = useState<number>(0);
  const [decisionPersona, setDecisionPersona] = useState<NexusDecisionPersona>(
    (lockedRole ?? initialRole) === 'field' ? 'field_manager' : 'executive',
  );
  const [complianceNotice, setComplianceNotice] = useState<string>('');
  const serverSnapshotRef = useRef({ pipelineCases, equipmentReports });
  serverSnapshotRef.current = { pipelineCases, equipmentReports };
  const runOfflineSyncWithConflictCheck = (showToast = false) => {
    const snap = serverSnapshotRef.current;
    void syncNexusOfflineQueueWithServer({
      serverSnapshot: {
        pipelineCases: snap.pipelineCases.map(c => ({
          caseId: c.caseId,
          siteId: c.siteId,
          locationLabel: c.locationLabel,
          hqDirectiveNote: c.hqDirectiveNote,
          updatedAt: c.updatedAt,
          status: c.status,
        })),
        equipmentReports: snap.equipmentReports.map(r => ({
          reportId: r.submissionId,
          siteId: r.siteId,
          workActivity: r.workActivity,
          status: r.status,
          hqReviewNote: r.hqReviewNote,
          hqReviewer: r.hqReviewer,
          hqReviewedAt: r.hqReviewedAt,
        })),
      },
    }).then(telemetry => {
      setOfflinePendingCount(telemetry.pendingCount);
      setIsOnlineState(telemetry.online);
      setSyncConflicts(telemetry.conflicts);
      if (telemetry.conflicts.length > 0) {
        setConflictDrawerOpen(true);
      }
      setSyncNotice(telemetry.message);
      if (showToast) {
        triggerToast(`🔄 ${telemetry.message}`);
      }
    });
  };
  const handleResolveSyncConflict = (conflict: NexusOfflineSyncConflict, choice: NexusConflictResolutionChoice) => {
    const resolved = resolveOfflineSyncConflict(conflict.queueId, choice, conflict);
    const remaining = syncConflicts.filter(c => c.queueId !== conflict.queueId);
    setSyncConflicts(remaining);
    setOfflinePendingCount(resolved.remainingPendingCount);
    setSyncNotice(resolved.resolutionNotice);
    if (remaining.length === 0) {
      setConflictDrawerOpen(false);
    }
    triggerToast(resolved.resolutionNotice);
  };
  const effectiveRole: NexusWorkspaceAuthority = lockedRole ?? workspaceRole;
  const effectiveFieldSiteId = lockedSiteId || assignedFieldSiteId;
  useEffect(() => {
    try {
      window.localStorage.setItem('psi_nexus_workspace_authority_v1', effectiveRole);
      window.dispatchEvent(new Event('psi-nexus-authority-updated'));
    } catch {
      // Ignore storage errors
    }
    const allowed = getAllowedDecisionPersonas(effectiveRole);
    setDecisionPersona(prev => (allowed.includes(prev) ? prev : allowed[0]));
  }, [effectiveRole]);
  useEffect(() => {
    const syncPipeline = () => setPipelineCases(readNexusPipelineCases());
    const syncTraining = () => setTrainingCampaigns(readExecutiveTrainingCampaigns());
    const syncHqLoop = () => {
      setVisitPlans(readHqVisitPlans());
      setInvestigations(readAiInvestigations());
      setApprovedCustomSeeds(readApprovedCustomIncidentSeeds());
    };
    const syncEquipment = () => setEquipmentReports(readEquipmentPhotoSubmissions());
    const syncSiteMaster = () => {
      const nextSites = readManagedNexusSites(false);
      setManagedSites(nextSites);
      if (nextSites.length > 0 && !nextSites.some(s => s.siteId === assignedFieldSiteId) && !lockedSiteId) {
        setAssignedFieldSiteId(nextSites[0].siteId);
      }
    };
    const syncOffline = () => setOfflinePendingCount(getPendingOfflineQueueCount());
    const handleOnline = () => {
      setIsOnlineState(true);
      runOfflineSyncWithConflictCheck(false);
    };
    const handleOffline = () => setIsOnlineState(false);
    window.addEventListener(NEXUS_PIPELINE_UPDATED_EVENT, syncPipeline);
    window.addEventListener(NEXUS_CEO_TRAINING_UPDATED_EVENT, syncTraining);
    window.addEventListener(NEXUS_HQ_LOOP_UPDATED_EVENT, syncHqLoop);
    window.addEventListener(NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT, syncEquipment);
    window.addEventListener(NEXUS_SITE_MASTER_UPDATED_EVENT, syncSiteMaster);
    window.addEventListener(NEXUS_OFFLINE_QUEUE_UPDATED_EVENT, syncOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', syncPipeline);
    window.addEventListener('storage', syncTraining);
    window.addEventListener('storage', syncHqLoop);
    window.addEventListener('storage', syncEquipment);
    window.addEventListener('storage', syncSiteMaster);
    window.addEventListener('storage', syncOffline);
    return () => {
      window.removeEventListener(NEXUS_PIPELINE_UPDATED_EVENT, syncPipeline);
      window.removeEventListener(NEXUS_CEO_TRAINING_UPDATED_EVENT, syncTraining);
      window.removeEventListener(NEXUS_HQ_LOOP_UPDATED_EVENT, syncHqLoop);
      window.removeEventListener(NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT, syncEquipment);
      window.removeEventListener(NEXUS_SITE_MASTER_UPDATED_EVENT, syncSiteMaster);
      window.removeEventListener(NEXUS_OFFLINE_QUEUE_UPDATED_EVENT, syncOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', syncPipeline);
      window.removeEventListener('storage', syncTraining);
      window.removeEventListener('storage', syncHqLoop);
      window.removeEventListener('storage', syncEquipment);
      window.removeEventListener('storage', syncSiteMaster);
      window.removeEventListener('storage', syncOffline);
    };
  }, [assignedFieldSiteId, lockedSiteId]);
  useEffect(() => { onViewChange?.({ month: filterMonth, trade: filterTrade, active: safeActive, flat, question: selectedQuestion, priority: priorityFilter, practice: practiceFilter, orbitLayer }); }, [filterMonth, filterTrade, safeActive, flat, selectedQuestion, priorityFilter, practiceFilter, orbitLayer, onViewChange]);
  const loadedSlice = useMemo(
    () => sliceLoadedNexusRecords(workerRecords, { month: filterMonth, trade: filterTrade }),
    [workerRecords, filterMonth, filterTrade]
  );
  const snapshot = loadedSlice.snapshot;
  const filteredRecords = useMemo(
    () => filterLoadedNexusRecords(workerRecords, { month: filterMonth, trade: filterTrade }),
    [workerRecords, filterMonth, filterTrade]
  );
  const asOfWindow = useMemo(() => {
    const today = getKoreanCalendarDay();
    const year = Number(filterMonth.slice(0, 4)), month = Number(filterMonth.slice(5, 7));
    const endOfMonth = filterMonth && month >= 1 && month <= 12 && year >= 2000 && year <= 2100
      ? filterMonth + '-' + String(new Date(year, month, 0).getDate()).padStart(2, '0')
      : today;
    return {
      asOfDate: endOfMonth > today ? today : endOfMonth,
      ...(filterMonth ? { periodStartDate: filterMonth + '-01' } : {})
    };
  }, [filterMonth]);
  const followup = useMemo(
    () => buildMonthlyFieldFollowupSummary(filteredRecords, asOfWindow),
    [filteredRecords, asOfWindow]
  );
  const allFollowupCases = useMemo(() => collectMonthlyFollowupCases(filteredRecords, followup.asOfDate), [filteredRecords, followup.asOfDate]);
  const questionCases = allFollowupCases.filter(row => row.item.opened.questionNumber === selectedQuestion);
  const priorityCases = useMemo(() => allFollowupCases
    .filter(row => priorityFilter === 'overdue' ? row.overdue : priorityFilter === 'unresolved' ? !row.completed : priorityFilter === 'reopened' ? row.item.events.some(event => event.status === 'reopened') : row.item.latest.status === priorityFilter),
    [allFollowupCases, priorityFilter]);
  const practice = useMemo(
    () => buildPracticeVerificationSummary(filteredRecords, asOfWindow),
    [filteredRecords, asOfWindow]
  );
  const overdueRechecks = useMemo(() => collectOverduePracticeRechecks(filteredRecords, practice.asOfDate), [filteredRecords, practice.asOfDate]);
  const count = snapshot.loadedRecordRows;

  const nodeUnitVecs = useMemo(
    () => layerNodes.map(node => latLonToUnitVec3(node.latDeg, node.lonDeg)),
    [layerNodes],
  );
  const projectedNodes = useMemo(
    () =>
      layerNodes.map((node, idx) =>
        projectNodeToStage(node.latDeg, node.lonDeg, sphereAngles.yaw, sphereAngles.pitch, {
          isMobile: isMobileViewport,
          nodeIndex: idx,
          totalNodes: layerNodes.length,
        }),
      ),
    [layerNodes, sphereAngles.yaw, sphereAngles.pitch, isMobileViewport],
  );
  const activeProjection = projectedNodes[safeActive] ?? projectedNodes[0];
  const dynamicFocusPath = useMemo(() => {
    const sx = activeProjection?.surfaceSvgX ?? 500;
    const sy = activeProjection?.surfaceSvgY ?? 350;
    const tx = activeProjection?.svgX ?? 500;
    const ty = activeProjection?.svgY ?? 350;
    const cx = Math.round(sx + (tx - sx) * 0.52);
    const cy = Math.round(sy + (ty - sy) * 0.36 - 24);
    return `M${sx} ${sy} Q${cx} ${cy} ${tx} ${ty}`;
  }, [activeProjection]);

  const scopedData = useMemo(
    () =>
      scopeNexusWorkspaceData({
        workspaceRole: effectiveRole,
        selectedSiteId: hqSelectedSiteId,
        assignedFieldSiteId: effectiveFieldSiteId,
        pipelineCases,
        visitPlans,
        investigations,
        trainingCampaigns,
        equipmentReports,
      }),
    [
      effectiveRole,
      hqSelectedSiteId,
      effectiveFieldSiteId,
      pipelineCases,
      visitPlans,
      investigations,
      trainingCampaigns,
      equipmentReports,
    ],
  );

  const currentLayerMeta = NEXUS_ORBIT_LAYERS.find(layer => layer.id === orbitLayer) ?? NEXUS_ORBIT_LAYERS[0];
  const layerLiveSignals = useMemo(
    () =>
      buildOrbitLayerLiveSignals(
        orbitLayer,
        filteredRecords,
        axisFilter,
        followup.asOfDate,
        approvedCustomSeeds,
      ),
    [orbitLayer, filteredRecords, axisFilter, followup.asOfDate, approvedCustomSeeds],
  );
  const pipelineNodeSummaries = useMemo(
    () => summarizePipelineForOrbitLayer(orbitLayer, scopedData.pipelineCases, followup.asOfDate),
    [orbitLayer, scopedData.pipelineCases, followup.asOfDate],
  );
  const trainingNodeSummaries = useMemo(
    () => summarizeExecutiveTrainingForOrbitLayer(orbitLayer, scopedData.trainingCampaigns),
    [orbitLayer, scopedData.trainingCampaigns],
  );
  const hqLoopNodeSummaries = useMemo(
    () => summarizeHqLoopForOrbitLayer(orbitLayer, scopedData.visitPlans, scopedData.investigations),
    [orbitLayer, scopedData.visitPlans, scopedData.investigations],
  );
  const activeSignal = layerLiveSignals[safeActive] ?? layerLiveSignals[0];
  const activePipelineSummary = pipelineNodeSummaries[safeActive] ?? pipelineNodeSummaries[0];
  const activeTrainingSummary = trainingNodeSummaries[safeActive] ?? trainingNodeSummaries[0];
  const activeHqLoopSummary = hqLoopNodeSummaries[safeActive] ?? hqLoopNodeSummaries[0];
  const activeSeed = activeSignal?.linkedSeeds[selectedSeedIdx < (activeSignal?.linkedSeeds.length ?? 0) ? selectedSeedIdx : 0] ?? activeSignal?.linkedSeeds[0];

  const bentoSnapshot = useMemo(
    () =>
      effectiveRole === 'hq'
        ? buildExecutiveBentoSnapshot({
          pipelineCases,
          visitPlans,
          investigations,
          trainingCampaigns,
          equipmentReports,
          workerRecords: filteredRecords,
          selectedSiteId: scopedData.effectiveSiteId,
          asOfDate: followup.asOfDate,
        })
        : null,
    [
      effectiveRole,
      pipelineCases,
      visitPlans,
      investigations,
      trainingCampaigns,
      equipmentReports,
      filteredRecords,
      scopedData.effectiveSiteId,
      followup.asOfDate,
    ],
  );

  const siteMatrix = useMemo(
    () =>
      effectiveRole === 'hq'
        ? buildMultiSitePortfolioMatrix(
          pipelineCases,
          visitPlans,
          investigations,
          trainingCampaigns,
          followup.asOfDate,
        )
        : [],
    [effectiveRole, pipelineCases, visitPlans, investigations, trainingCampaigns, followup.asOfDate],
  );

  const allowedDecisionPersonas = useMemo(
    () => getAllowedDecisionPersonas(effectiveRole),
    [effectiveRole],
  );

  const decisionBriefVm = useMemo(
    () =>
      buildNexusDecisionBrief({
        workspaceRole: effectiveRole,
        persona: decisionPersona,
        scopeLabel:
          effectiveRole === 'hq'
            ? scopedData.activeSiteMeta?.shortLabel || '전사 통합 포트폴리오'
            : scopedData.activeSiteMeta?.shortLabel || '소속 현장 범위',
        pipelineCases: scopedData.pipelineCases,
        equipmentReports: scopedData.equipmentReports,
        trainingCampaigns: scopedData.trainingCampaigns,
        visitPlans: scopedData.visitPlans,
        investigations: scopedData.investigations,
        siteMatrix,
      }),
    [effectiveRole, decisionPersona, scopedData, siteMatrix],
  );

  const handleDecisionBriefAction = (target: NexusDecisionActionTarget) => {
    const scrollToWorkbench = () => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          document
            .getElementById('nexus-closed-loop-workbench')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    };
    if (target === 'open_ceo_briefing' && effectiveRole === 'hq') {
      const pack = buildUnifiedCeoDailyBriefing({
        asOfDate: followup.asOfDate,
        reporterLabel: '본사 CSO · 안전보건실장',
        pipelineCases: scopedData.pipelineCases,
        visitPlans: scopedData.visitPlans,
        investigations: scopedData.investigations,
        trainingCampaigns: scopedData.trainingCampaigns,
        equipmentReports: scopedData.equipmentReports,
      });
      setDailyCeoBriefing(pack);
      setDailyBriefingNotice('');
      setActiveView('hq_bi');
      triggerToast('📋 대표이사 일일 통합 안전브리핑 1장 생성 완료');
      return;
    }
    if (target === 'export_pptx' && effectiveRole === 'hq') {
      void handleExportCeoPptx();
      return;
    }
    if (target === 'open_stopwork') {
      setActiveView(effectiveRole === 'hq' ? 'hq_ops' : 'field_ops');
      setWorkbenchTab('inspect_03_06');
      scrollToWorkbench();
      triggerToast('⛔ 작업중지·시정조치 관리 화면으로 이동');
      return;
    }
    if (target === 'open_equip_review' || target === 'open_equip_upload') {
      setActiveView(effectiveRole === 'hq' ? 'hq_ops' : 'field_ops');
      setWorkbenchTab('equipment_photo');
      scrollToWorkbench();
      triggerToast('📷 건설기계 사용전 점검 사진함으로 이동');
      return;
    }
    if (target === 'open_visit_ack') {
      setActiveView(effectiveRole === 'hq' ? 'hq_ops' : 'field_inbox');
      setWorkbenchTab('visit_01');
      scrollToWorkbench();
      triggerToast('📋 본사 순회점검 확인함으로 이동');
      return;
    }
    if (target === 'open_training_qr') {
      setActiveView(effectiveRole === 'hq' ? 'hq_ops' : 'field_inbox');
      setWorkbenchTab('training_04');
      scrollToWorkbench();
      triggerToast('📱 12개국어 교육·QR 자필 서명함으로 이동');
      return;
    }
    if (target === 'trigger_stopwork') {
      setActiveView(effectiveRole === 'hq' ? 'hq_ops' : 'field_ops');
      setWorkbenchTab('inspect_03_06');
      setQuickStopWorkTrigger(v => v + 1);
      scrollToWorkbench();
      triggerToast('⛔ 작업중지 즉시 등록 폼을 활성화했습니다');
      return;
    }
    if (target === 'copy_handover') {
      const handoverText = buildShiftHandoverBriefingText(
        scopedData.pipelineCases,
        scopedData.activeSiteMeta?.siteName || '전사 통합 현장',
        followup.asOfDate,
      );
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(handoverText).catch(() => {});
      }
      triggerToast('📋 교대·작업 전 5줄 지시 요약이 복사되었습니다');
    }
  };

  const handleAxisFilterChange = (patch: Partial<NexusThreeAxisFilter>) => {
    const nextFilter = { ...axisFilter, ...patch };
    setAxisFilter(nextFilter);
    setSelectedSeedIdx(0);
    const nextSignals = buildOrbitLayerLiveSignals(orbitLayer, filteredRecords, nextFilter, followup.asOfDate);
    if (!nextSignals[safeActive]?.matchesAxisFilter) {
      const firstMatchIdx = nextSignals.findIndex(s => s.matchesAxisFilter);
      if (firstMatchIdx >= 0) {
        lockOntoNode(firstMatchIdx);
      }
    }
  };

  const handleSwitchAuthority = (nextRole: NexusWorkspaceAuthority) => {
    if (lockedRole) return;
    setWorkspaceRole(nextRole);
    if (nextRole === 'hq') {
      setActiveView('hq_command');
      setWorkbenchTab('equipment_photo');
      triggerToast('🏛️ 본사 전사 통합 관제 모드로 전환되었습니다');
    } else {
      setActiveView('field_ops');
      setWorkbenchTab('inspect_03_06');
      const siteMeta = managedSites.find(s => s.siteId === effectiveFieldSiteId) ?? managedSites[0];
      if (siteMeta) {
        lockOntoNode(Math.max(0, Number(siteMeta.focusNodeIndex) - 1), 'structural');
      }
      triggerToast(`🦺 ${siteMeta?.shortLabel || '단일 현장'} 격리 모드로 전환되었습니다`);
    }
  };

  const handleExportCeoPptx = async () => {
    try {
      const matrix = buildMultiSitePortfolioMatrix(
        pipelineCases,
        visitPlans,
        investigations,
        trainingCampaigns,
        followup.asOfDate,
      );
      const deck = await exportExecutiveBriefingPptx({
        asOfDate: followup.asOfDate,
        reporterLabel: '본사 CSO · 안전보건실장',
        siteMatrix: matrix,
        pipelineCases: scopedData.pipelineCases,
        equipmentReports: scopedData.equipmentReports,
        visitPlans: scopedData.visitPlans,
        investigations: scopedData.investigations,
        trainingCampaigns: scopedData.trainingCampaigns,
      });
      setDailyBriefingNotice(`${deck.fileName} (${deck.totalSlides}슬라이드 PPTX) 파일을 생성·다운로드했습니다.`);
      triggerToast(`📽️ ${deck.fileName} (${deck.totalSlides}슬라이드) 생성 완료`);
    } catch (err) {
      setDailyBriefingNotice(err instanceof Error ? err.message : 'PPTX 생성 중 확인이 필요합니다.');
    }
  };

  const handleDownloadComplianceZip = async () => {
    try {
      const res = await downloadNexusComplianceZip({
        asOfDate: followup.asOfDate,
        siteScopeLabel: scopedData.activeSiteMeta?.siteName || '전사 통합 포트폴리오',
        pipelineCases: scopedData.pipelineCases,
        equipmentReports: scopedData.equipmentReports,
        trainingCampaigns: scopedData.trainingCampaigns,
        visitPlans: scopedData.visitPlans,
        investigations: scopedData.investigations,
      });
      setComplianceNotice(
        `[${res.bundleId}] ${res.fileName} (총 ${res.fileCount}개 파일 · 사진 ${res.embeddedPhotoCount}건 · 자필서명 ${res.embeddedSignatureCount}건 · 위·변조 검증 목록 포함) 편철 저장 완료!`,
      );
      setDailyBriefingNotice(`${res.fileName} 중대재해처벌법 증빙 ZIP 패키지를 저장했습니다.`);
      triggerToast(`📦 ${res.fileName} 증빙 패키지(${res.fileCount}파일) 편철 완료`);
    } catch (err) {
      setComplianceNotice(err instanceof Error ? err.message : '증빙 패키지 편철 중 확인이 필요합니다.');
    }
  };

  const stopWorkCountLive = scopedData.pipelineCases.filter(
    c => c.stopWorkFlag && c.status !== 'closed',
  ).length;
  const hqEquipPendingCount = scopedData.equipmentReports.filter(
    e => e.status === 'submitted_to_hq',
  ).length;
  const hqInvPendingCount = scopedData.investigations.filter(
    i => i.status === 'ai_draft_pending_hq',
  ).length;
  const hqUnackedVisitCount = scopedData.visitPlans.filter(
    v => v.status !== 'action_issued_closed' && !v.fieldAcknowledgedAt,
  ).length;
  const hqOpsBadgeCount = stopWorkCountLive + hqEquipPendingCount + hqInvPendingCount;

  const fieldOpenCount = scopedData.pipelineCases.filter(c => c.status !== 'closed').length;
  const fieldStopCount = scopedData.pipelineCases.filter(
    c => c.status !== 'closed' && c.stopWorkFlag,
  ).length;
  const fieldEquipRevCount = scopedData.equipmentReports.filter(
    e => e.status === 'revision_requested_hq',
  ).length;
  const fieldInvRevCount = scopedData.investigations.filter(
    i => i.status === 'revision_requested',
  ).length;
  const fieldTotalRevCount = fieldEquipRevCount + fieldInvRevCount;
  const fieldUnackedVisitCount = hqUnackedVisitCount;
  const fieldIncompleteTrainCount = scopedData.trainingCampaigns.filter(
    t => (t.completionRatePct ?? 0) < 100,
  ).length;
  const fieldOpsBadgeCount = fieldOpenCount + fieldEquipRevCount;
  const fieldInboxBadgeCount = fieldUnackedVisitCount + fieldIncompleteTrainCount + fieldInvRevCount;
  const fieldDirectiveTotal =
    scopedData.pipelineCases.filter(c => c.hqDirectiveNote && c.status !== 'closed').length +
    fieldEquipRevCount;

  const paletteCommands = useMemo(
    () =>
      buildRoleScopedCommands({
        workspaceRole: effectiveRole,
        managedSites,
        query: cmdQuery,
        pendingCounts: {
          stopWork: stopWorkCountLive,
          equipmentPending: hqEquipPendingCount,
          investigationPending: hqInvPendingCount,
          unackedVisits: fieldUnackedVisitCount,
          fieldRevision: fieldTotalRevCount,
          incompleteTraining: fieldIncompleteTrainCount,
          offlinePending: offlinePendingCount,
        },
      }),
    [
      effectiveRole,
      managedSites,
      cmdQuery,
      stopWorkCountLive,
      hqEquipPendingCount,
      hqInvPendingCount,
      fieldUnackedVisitCount,
      fieldTotalRevCount,
      fieldIncompleteTrainCount,
      offlinePendingCount,
    ],
  );

  const executePaletteCommand = (cmd: NexusCommandAction) => {
    setCmdPaletteOpen(false);
    setCmdQuery('');
    if (cmd.targetKind === 'hq_view' && cmd.targetValue) {
      handleSelectWorkspaceView(cmd.targetValue as NexusWorkspaceView);
    } else if (cmd.targetKind === 'field_view' && cmd.targetValue) {
      handleSelectWorkspaceView(cmd.targetValue as NexusWorkspaceView);
    } else if (cmd.targetKind === 'workbench_tab' && cmd.targetValue) {
      const tab = cmd.targetValue as NexusWorkbenchTab;
      if (effectiveRole === 'hq') {
        setActiveView('hq_ops');
      } else {
        setActiveView(
          tab === 'inspect_03_06' || tab === 'equipment_photo' ? 'field_ops' : 'field_inbox',
        );
      }
      setWorkbenchTab(tab);
    } else if (cmd.targetKind === 'export_pptx') {
      void handleExportCeoPptx();
    } else if (cmd.targetKind === 'export_compliance_zip') {
      void handleDownloadComplianceZip();
    } else if (cmd.targetKind === 'select_site' && effectiveRole === 'hq') {
      setHqSelectedSiteId(cmd.targetValue || '');
      triggerToast(cmd.targetValue ? `현장 필터 전환: ${cmd.label}` : '전사 전체 현장 범위로 전환');
    } else if (cmd.targetKind === 'sync_queue') {
      runOfflineSyncWithConflictCheck(true);
    } else if (cmd.targetKind === 'toggle_immersive') {
      setImmersive(v => !v);
    }
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdPaletteOpen(v => !v);
        return;
      }
      if (e.key === 'Escape' && cmdPaletteOpen) {
        setCmdPaletteOpen(false);
        return;
      }
      if (
        e.key.toLowerCase() === 'f' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)
      ) {
        setImmersive(v => !v);
      }
    };
    document.addEventListener('keydown', onGlobalKey);
    return () => document.removeEventListener('keydown', onGlobalKey);
  }, [cmdPaletteOpen]);

  useEffect(() => {
    if (!cmdPaletteOpen) setCmdQuery('');
    setCmdActiveIdx(0);
  }, [cmdPaletteOpen, cmdQuery, effectiveRole]);

  const liveAlertLevel =
    stopWorkCountLive > 0
      ? Math.min(1, 0.65 + stopWorkCountLive * 0.15)
      : scopedData.pipelineCases.some(c => c.status !== 'closed' && c.dueDate && c.dueDate < followup.asOfDate)
        ? 0.45
        : 0;
  const firstAlertCase =
    scopedData.pipelineCases.find(c => c.stopWorkFlag && c.status !== 'closed') ??
    scopedData.pipelineCases.find(c => c.status !== 'closed');
  const liveAlertVec = useMemo(() => {
    if (firstAlertCase && nodeUnitVecs.length > 0) {
      const idx = Math.max(0, Math.min(nodeUnitVecs.length - 1, Number(firstAlertCase.structuralNodeIndex) - 1));
      return nodeUnitVecs[idx] ?? nodeUnitVecs[safeActive] ?? nodeUnitVecs[0];
    }
    return nodeUnitVecs[safeActive] ?? nodeUnitVecs[0];
  }, [firstAlertCase, nodeUnitVecs, safeActive]);

  const handleSelectWorkspaceView = (nextView: NexusWorkspaceView) => {
    setActiveView(nextView);
    if (nextView === 'field_ops' && workbenchTab !== 'inspect_03_06' && workbenchTab !== 'equipment_photo') {
      setWorkbenchTab('inspect_03_06');
    } else if (
      nextView === 'field_inbox' &&
      workbenchTab !== 'training_04' &&
      workbenchTab !== 'investigate_05_02' &&
      workbenchTab !== 'visit_01'
    ) {
      setWorkbenchTab('training_04');
    }
  };

  const handleLoadMultiSiteSimulation = () => {
    const seeded = seedMultiSiteOperationalSimulation();
    setPipelineCases([...seeded.cases]);
    setVisitPlans([...seeded.visits]);
    setInvestigations([...seeded.investigations]);
    setTrainingCampaigns([...seeded.campaigns]);
    setEquipmentReports([...seeded.equipmentReports]);
    lockOntoNode(0, orbitLayer === 'structural' ? 'structural' : orbitLayer);
    triggerToast('✅ 예시 현장(3개 현장·건설기계 사진)을 불러왔습니다');
  };

  const showFollowupDetails = () => {
    const target = document.getElementById('nexus-followup-details');
    if (target) {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
      target.focus({ preventScroll: true });
      return;
    }
    setActiveView(effectiveRole === 'hq' ? 'hq_audit' : 'field_ops');
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        const delayed = document.getElementById('nexus-followup-details');
        delayed?.scrollIntoView({ behavior: 'auto', block: 'start' });
        delayed?.focus({ preventScroll: true });
      });
    }
  };
  if (loadState !== 'ready') return <main className="safety-nexus" data-nexus-theme={nexusTheme} data-nexus-sunlight={sunlightMode ? 'true' : 'false'} aria-label="PSI 안전지능 네트워크"><section className="nexus-followup" role="status"><h1>안전지능 네트워크</h1><p>{loadState === 'loading' ? '저장된 기록을 불러오고 있습니다.' : '기록을 불러오지 못했습니다. 화면을 다시 불러와 주세요.'}</p><button type="button" onClick={() => onNavigateToPage('dashboard')}>기존 관제센터로 돌아가기</button></section></main>;
  const surface = <main role={immersive ? 'dialog' : undefined} aria-modal={immersive ? true : undefined} className={'safety-nexus' + (immersive ? ' is-immersive' : '')} data-nexus-theme={nexusTheme} data-nexus-sunlight={sunlightMode ? 'true' : 'false'} data-workspace-role={effectiveRole} data-reduced-motion={reduced ? 'true' : 'false'} data-motion-paused={paused ? 'true' : 'false'} aria-label="PSI 안전지능 네트워크">
    <div className="nexus-background" aria-hidden="true" />
    <header className="nexus-header">
      <div className="nexus-brand"><span className="nexus-symbol">Ψ</span><div><small>골조·형틀 통합 안전관리</small><h1>SAFETY <b>NEXUS</b></h1></div></div>
      <div className="nexus-header-right"><span className="nexus-status"><i />골조·형틀 3D 입체 안전관제</span>
        <button type="button" className="nexus-theme-toggle" aria-pressed={nexusTheme === 'light'} aria-label={nexusTheme === 'light' ? '어두운 화면으로 전환' : '밝은 화면으로 전환'} onClick={handleToggleNexusTheme}>{nexusTheme === 'light' ? '🌙 어두운 화면' : '☀️ 밝은 화면'}</button>
        <button type="button" className="nexus-sunlight-toggle" aria-pressed={sunlightMode} aria-label={sunlightMode ? '야외 고대비 모드 끄기' : '야외 직사광선 고대비 모드 켜기'} onClick={handleToggleSunlightMode}>{sunlightMode ? '☀️ 야외 고대비 ON' : '🔆 야외 고대비'}</button>
        <button type="button" className="nexus-cmd-trigger" onClick={() => setCmdPaletteOpen(true)} aria-label="빠른 기능 찾기 열기">🔍 빠른 찾기 (Ctrl+K)</button>
        <button ref={immersiveToggleRef} type="button" className="nexus-immersive-toggle" aria-pressed={immersive} onClick={() => setImmersive(v => !v)}>{immersive ? '몰입 화면 종료 ↙' : '전체 화면 몰입 보기 ⤢'}</button>
        <button type="button" onClick={() => onReturnDashboard ? onReturnDashboard(filterTrade) : onNavigateToPage('dashboard')}>기존 관제센터로 돌아가기 ↗</button></div>
    </header>
    <div className="nexus-lead"><span>본사·현장 통합 안전관리 체계</span><p>본사 주도 · 현장 실행 · AI 분석 · 12개국어 교육 · 재발방지까지 연결하는 골조·형틀·지하 RC 특화 안전지능 플랫폼</p></div>
    <section className="nexus-priority-summary" aria-label="우선 확인할 후속조치">
      <div className="nexus-priority-ribbon-head">
        <strong>실시간 후속조치 현황</strong>
        <p>{filterMonth || '전체 기간'} · {filterTrade || '전체 공종'} · 기준 {followup.asOfDate}</p>
      </div>
      <div className="nexus-priority-counts"><button type="button" aria-pressed={priorityFilter === 'overdue'} onClick={() => setPriorityFilter('overdue')}>기한 초과 <b>{followup.overdue}</b>건</button><button type="button" aria-pressed={priorityFilter === 'unresolved'} onClick={() => setPriorityFilter('unresolved')}>미완료 <b>{followup.unresolved}</b>건</button><button type="button" aria-pressed={priorityFilter === 'recheck'} onClick={() => setPriorityFilter('recheck')}>재확인 기한초과 <b>{practice.overdueFieldRecheck}</b>건</button></div>
      <button type="button" className="nexus-priority-jump" onClick={showFollowupDetails}>조치 내역과 범위 확인</button>
      {recordNotice && <p role="alert">{recordNotice}</p>}
      {practice.conflictingRecords > 0 && <p role="alert">재확인 이력의 내용이 충돌한 기록 {practice.conflictingRecords}건은 집계에서 제외했습니다. 원본을 확인해 주세요.</p>}
      {followup.conflictingRecords > 0 && <p role="alert">조치 이력의 내용이 충돌한 기록 {followup.conflictingRecords}건은 집계에서 제외했습니다. 원본을 확인해 주세요.</p>}
      {priorityFilter === 'recheck' && <div className="nexus-priority-drawer" aria-live="polite"><h3>재확인 기한초과 {overdueRechecks.length}건</h3>
        {overdueRechecks.length === 0 ? <p>선택 범위에 해당 기록이 없습니다.</p> : <ul>{overdueRechecks.map(item => {
          const record = filteredRecords.find(row => row.id === item.recordId);
          return <li key={item.recordId + '-' + item.question}>Q{item.question} · {PRACTICE_RESULT_LABELS[item.latest.result] || '확인 필요'} · 예정일 {item.latest.nextCheckDueDate} {record && onOpenRecord && <button type="button" onClick={() => onOpenRecord(record)}>관련 기록 열기</button>}</li>;
        })}</ul>}
      </div>}
      {priorityFilter && priorityFilter !== 'recheck' && <div className="nexus-priority-drawer" aria-live="polite"><h3>{FOLLOWUP_FILTER_LABELS[priorityFilter]} 조치 {priorityCases.length}건</h3>
        {priorityCases.length === 0 ? <p>선택 범위에 해당 조치가 없습니다.</p> : <ul>{priorityCases.map(({ recordId, item, dueDate }) => {
          const record = filteredRecords.find(row => String(row.id || '').trim() === recordId);
          return <li key={recordId + '-' + item.caseId}>Q{item.opened.questionNumber} · {FOLLOWUP_STATUS_LABELS[item.latest.status] || '상태 확인 필요'} · 기한 {dueDate || '미지정'} {record && onOpenRecord && <button type="button" onClick={() => onOpenRecord(record)}>관련 기록 열기</button>}</li>;
        })}</ul>}
      </div>}
    </section>
    <nav className="nexus-context-rail" aria-label="안전지능 권한 범위 및 워크스페이스 전환">
      <div className="nexus-context-top">
        {!lockedRole ? (
          <div className="nexus-authority-switcher" role="group" aria-label="본사 · 현장 화면 권한 전환">
            <button
              type="button"
              aria-pressed={effectiveRole === 'hq'}
              onClick={() => handleSwitchAuthority('hq')}
            >
              🏛️ 본사 통합 관제 (전사)
            </button>
            <button
              type="button"
              aria-pressed={effectiveRole === 'field'}
              onClick={() => handleSwitchAuthority('field')}
            >
              🦺 현장 안전관리자 (단일 현장 격리)
            </button>
          </div>
        ) : (
          <span className="nexus-field-lock-badge">
            {effectiveRole === 'hq' ? '🏛️ 본사 통합 관제 권한 고정' : '🦺 현장 단일 현장 권한 고정'}
          </span>
        )}

        {effectiveRole === 'hq' ? (
          <div className="nexus-scope-strip" role="group" aria-label="본사 현장 범위 필터">
            <button
              type="button"
              aria-pressed={!hqSelectedSiteId}
              onClick={() => setHqSelectedSiteId('')}
            >
              전사 전체 ({managedSites.length}개 현장)
            </button>
            {managedSites.map(site => (
              <button
                key={site.siteId}
                type="button"
                aria-pressed={hqSelectedSiteId === site.siteId}
                onClick={() => setHqSelectedSiteId(hqSelectedSiteId === site.siteId ? '' : site.siteId)}
              >
                {site.shortLabel.split(' · ')[0]}
              </button>
            ))}
            <button
              type="button"
              className="nexus-sim-seed-btn"
              onClick={handleLoadMultiSiteSimulation}
            >
              예시 현장 불러오기 (3개 현장·장비사진)
            </button>
          </div>
        ) : (
          <div className="nexus-scope-strip">
            <span className="nexus-field-lock-badge">
              🔒 단일 현장 격리 · {scopedData.activeSiteMeta?.shortLabel || managedSites[0]?.shortLabel || '제1현장'} · 타현장 비노출
            </span>
            {!lockedSiteId && (
              <label className="nexus-field-site-select">
                <span>배정 현장</span>
                <select
                  aria-label="현장 관리자 소속 현장 선택"
                  value={effectiveFieldSiteId}
                  onChange={e => setAssignedFieldSiteId(e.target.value)}
                >
                  {managedSites.map(site => (
                    <option key={site.siteId} value={site.siteId}>{site.siteName}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      <div className="nexus-context-views">
        <div className="nexus-view-tabs" role="tablist" aria-label="안전지능 워크스페이스 화면 전환">
          {effectiveRole === 'hq' ? (
            <>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'hq_command'}
                className={'nexus-view-tab' + (activeView === 'hq_command' ? ' is-active' : '')}
                onClick={() => handleSelectWorkspaceView('hq_command')}
              >
                ① 3D 전사 지휘
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'hq_bi'}
                className={'nexus-view-tab' + (activeView === 'hq_bi' ? ' is-active' : '')}
                onClick={() => handleSelectWorkspaceView('hq_bi')}
              >
                ② 경영 브리핑 BI
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'hq_ops'}
                className={'nexus-view-tab' + (activeView === 'hq_ops' ? ' is-active' : '')}
                onClick={() => handleSelectWorkspaceView('hq_ops')}
              >
                ③ 본사 결재·보고·순회
                {hqOpsBadgeCount > 0 && <em className="nexus-tab-badge" aria-hidden="true">{hqOpsBadgeCount}</em>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'hq_audit'}
                className={'nexus-view-tab' + (activeView === 'hq_audit' ? ' is-active' : '')}
                onClick={() => handleSelectWorkspaceView('hq_audit')}
              >
                ④ 원천 이력·감사
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'field_ops'}
                className={'nexus-view-tab' + (activeView === 'field_ops' ? ' is-active' : '')}
                onClick={() => handleSelectWorkspaceView('field_ops')}
              >
                ① 현장 즉시 실행
                {fieldOpsBadgeCount > 0 && <em className="nexus-tab-badge" aria-hidden="true">{fieldOpsBadgeCount}</em>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'field_inbox'}
                className={'nexus-view-tab' + (activeView === 'field_inbox' ? ' is-active' : '')}
                onClick={() => handleSelectWorkspaceView('field_inbox')}
              >
                ② 본사 수신·교육·상신
                {fieldInboxBadgeCount > 0 && <em className="nexus-tab-badge" aria-hidden="true">{fieldInboxBadgeCount}</em>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'field_sphere'}
                className={'nexus-view-tab' + (activeView === 'field_sphere' ? ' is-active' : '')}
                onClick={() => handleSelectWorkspaceView('field_sphere')}
              >
                ③ 내 현장 3D 구체
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          className="nexus-locked-node-pill"
          onClick={() => handleSelectWorkspaceView(effectiveRole === 'hq' ? 'hq_command' : 'field_sphere')}
        >
          ◎ 선택 구간: #{selected.index} {selected.title}
        </button>
      </div>
      {((effectiveRole === 'hq' && hqSelectedSiteId) || axisFilter.zoneAxis || axisFilter.processAxis || axisFilter.hazardEquipmentAxis) && (
        <div className="nexus-active-filters-bar" role="region" aria-label="현재 적용 중인 필터 컨텍스트">
          <span className="nexus-active-filters-label">적용 필터</span>
          {effectiveRole === 'hq' && hqSelectedSiteId && (
            <button
              type="button"
              className="nexus-active-filter-chip"
              onClick={() => setHqSelectedSiteId('')}
            >
              📍 현장: {scopedData.activeSiteMeta?.shortLabel || hqSelectedSiteId} ×
            </button>
          )}
          {axisFilter.zoneAxis && (
            <button
              type="button"
              className="nexus-active-filter-chip"
              onClick={() => handleAxisFilterChange({ zoneAxis: '' })}
            >
              축1: {NEXUS_ZONE_AXIS_OPTIONS.find(o => o.id === axisFilter.zoneAxis)?.label || axisFilter.zoneAxis} ×
            </button>
          )}
          {axisFilter.processAxis && (
            <button
              type="button"
              className="nexus-active-filter-chip"
              onClick={() => handleAxisFilterChange({ processAxis: '' })}
            >
              축2: {NEXUS_PROCESS_AXIS_OPTIONS.find(o => o.id === axisFilter.processAxis)?.label || axisFilter.processAxis} ×
            </button>
          )}
          {axisFilter.hazardEquipmentAxis && (
            <button
              type="button"
              className="nexus-active-filter-chip"
              onClick={() => handleAxisFilterChange({ hazardEquipmentAxis: '' })}
            >
              축3: {NEXUS_HAZARD_EQUIPMENT_AXIS_OPTIONS.find(o => o.id === axisFilter.hazardEquipmentAxis)?.label || axisFilter.hazardEquipmentAxis} ×
            </button>
          )}
          <button
            type="button"
            className="nexus-active-filter-reset"
            onClick={() => {
              if (effectiveRole === 'hq') setHqSelectedSiteId('');
              handleAxisFilterChange({ zoneAxis: '', processAxis: '', hazardEquipmentAxis: '' });
            }}
          >
            필터 모두 해제
          </button>
        </div>
      )}
      <div className="nexus-live-sync-bar" aria-label="오프라인 전송 대기 및 양방향 실시간 경보 상태">
        <div className="nexus-live-sync-badges">
          <span className={'nexus-sync-pill ' + (isOnlineState ? 'is-online' : 'is-offline')}>
            {isOnlineState ? '🟢 통신 연결됨 · 실시간 동기화' : '🟡 지하·무통신 오프라인 저장 모드'}
          </span>
          <span className={'nexus-sync-pill' + (offlinePendingCount > 0 ? ' is-pending' : '')}>
            전송 대기 <b>{offlinePendingCount}건</b>
          </span>
          {effectiveRole === 'hq' ? (
            <>
              <button
                type="button"
                className="nexus-sync-pill is-alert is-interactive"
                onClick={() => {
                  setActiveView('hq_ops');
                  setWorkbenchTab('inspect_03_06');
                  triggerToast('⛔ 전 현장 작업중지·시정조치 관제로 이동');
                }}
              >
                ⛔ 작업중지 <b>{stopWorkCountLive}건</b>
              </button>
              <button
                type="button"
                className="nexus-sync-pill is-interactive"
                onClick={() => {
                  setActiveView('hq_ops');
                  setWorkbenchTab('equipment_photo');
                  triggerToast('🏗️ 건설기계 사진 검토함으로 이동');
                }}
              >
                🏗️ 사진 검토대기 <b>{hqEquipPendingCount}건</b>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="nexus-sync-pill is-alert is-interactive"
              onClick={() => {
                setActiveView('field_ops');
                setWorkbenchTab(fieldEquipRevCount > 0 ? 'equipment_photo' : 'inspect_03_06');
                triggerToast('🏛️ 본사 지시·보완 처리함으로 이동');
              }}
            >
              🏛️ 본사 지시·보완 <b>{fieldDirectiveTotal}건</b>
            </button>
          )}
          {syncConflicts.length > 0 && (
            <button
              type="button"
              className="nexus-sync-pill is-conflict is-interactive"
              onClick={() => setConflictDrawerOpen(v => !v)}
            >
              ⚠️ 충돌·변경 비교 <b>{syncConflicts.length}건</b>
            </button>
          )}
        </div>
        <button
          type="button"
          className="nexus-sync-flush-btn"
          onClick={() => runOfflineSyncWithConflictCheck(false)}
        >
          🔄 지금 동기화
        </button>
      </div>
      {conflictDrawerOpen && syncConflicts.length > 0 && (
        <section className="nexus-conflict-drawer" aria-label="오프라인 재동기화 충돌·변경 비교 서랍">
          <div className="nexus-conflict-drawer-head">
            <div>
              <strong>⚠️ 지하·오프라인 기록과 본사 최신 지시 충돌 감지 ({syncConflicts.length}건)</strong>
              <p>현장 입력값과 본사 최신 지시·보완 내용을 나란히 비교하고 최종 반영 방식을 선택하세요.</p>
            </div>
            <button
              type="button"
              className="nexus-conflict-close-btn"
              onClick={() => setConflictDrawerOpen(false)}
            >
              서랍 닫기 ✕
            </button>
          </div>
          <div className="nexus-conflict-list">
            {syncConflicts.map(conflict => (
              <article key={conflict.conflictId} className="nexus-conflict-card">
                <div className="nexus-conflict-card-top">
                  <strong>{conflict.title}</strong>
                  <span>대상 ID: {conflict.recordId}</span>
                </div>
                <div className="nexus-conflict-compare-grid">
                  <div className="nexus-conflict-side">
                    <small>현장 오프라인 기록</small>
                    <p>{conflict.localSummary}</p>
                    <span>저장 시각: {conflict.localUpdatedAt.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                  <div className="nexus-conflict-side is-hq">
                    <small>본사 최신 지시·보완 ({conflict.hqActor})</small>
                    <p>{conflict.hqSummary}</p>
                    <span>지시 시각: {conflict.hqUpdatedAt.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                </div>
                <div className="nexus-conflict-actions">
                  <button
                    type="button"
                    onClick={() => handleResolveSyncConflict(conflict, 'keep_local')}
                  >
                    현장 입력 우선 반영
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveSyncConflict(conflict, 'accept_hq')}
                  >
                    본사 최신 지시 수용
                  </button>
                  <button
                    type="button"
                    className="is-merge-btn"
                    onClick={() => handleResolveSyncConflict(conflict, 'merge_both')}
                  >
                    양측 내용 병합 반영
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {syncNotice && <p role="status" className="nexus-3axis-feedback">{syncNotice}</p>}
    </nav>
    {effectiveRole === 'hq' && (stopWorkCountLive + hqEquipPendingCount + hqInvPendingCount + hqUnackedVisitCount > 0) && (
      <section className="nexus-hq-morning-bar" aria-label="본사 안전보건실 긴급 결재·확인함">
        <div className="nexus-field-morning-title">
          <strong>🏛️ 본사 긴급 결재 · 확인함</strong>
          <small>{scopedData.activeSiteMeta?.shortLabel || '전사 통합'}</small>
        </div>
        <div className="nexus-field-morning-chips">
          <button
            type="button"
            className={'nexus-morning-chip' + (stopWorkCountLive > 0 ? ' is-urgent' : '')}
            onClick={() => { setActiveView('hq_ops'); setWorkbenchTab('inspect_03_06'); }}
          >
            ⛔ 작업중지 통제 <b>{stopWorkCountLive}건</b>
          </button>
          <button
            type="button"
            className={'nexus-morning-chip' + (hqEquipPendingCount > 0 ? ' is-warn' : '')}
            onClick={() => { setActiveView('hq_ops'); setWorkbenchTab('equipment_photo'); }}
          >
            🏗️ 기계사진 검토대기 <b>{hqEquipPendingCount}건</b>
          </button>
          <button
            type="button"
            className={'nexus-morning-chip' + (hqInvPendingCount > 0 ? ' is-warn' : '')}
            onClick={() => { setActiveView('hq_ops'); setWorkbenchTab('investigate_05_02'); }}
          >
            🔍 사고조사 결재대기 <b>{hqInvPendingCount}건</b>
          </button>
          <button
            type="button"
            className={'nexus-morning-chip' + (hqUnackedVisitCount > 0 ? ' is-warn' : '')}
            onClick={() => { setActiveView('hq_ops'); setWorkbenchTab('visit_01'); }}
          >
            📋 미접수 순회점검 <b>{hqUnackedVisitCount}건</b>
          </button>
        </div>
      </section>
    )}
    {effectiveRole === 'field' && (
      <section className="nexus-field-morning-bar" aria-label="현장 안전관리자 출근 긴급 처리함">
        <div className="nexus-field-morning-title">
          <strong>🦺 오늘 출근 즉시 처리함</strong>
          <small>{scopedData.activeSiteMeta?.shortLabel || '소속 현장'}</small>
        </div>
        <div className="nexus-field-morning-chips">
          <button
            type="button"
            className={'nexus-morning-chip' + (fieldStopCount > 0 ? ' is-urgent' : '')}
            onClick={() => { setActiveView('field_ops'); setWorkbenchTab('inspect_03_06'); }}
          >
            ⛔ 작업중지·미결 <b>{fieldOpenCount}건</b>{fieldStopCount > 0 ? ` (중지 ${fieldStopCount})` : ''}
          </button>
          <button
            type="button"
            className={'nexus-morning-chip' + (fieldTotalRevCount > 0 ? ' is-urgent' : '')}
            onClick={() => {
              if (fieldEquipRevCount > 0) {
                setActiveView('field_ops');
                setWorkbenchTab('equipment_photo');
              } else {
                setActiveView('field_inbox');
                setWorkbenchTab('investigate_05_02');
              }
            }}
          >
            🔁 본사 보완요청 <b>{fieldTotalRevCount}건</b>
          </button>
          <button
            type="button"
            className={'nexus-morning-chip' + (fieldUnackedVisitCount > 0 ? ' is-warn' : '')}
            onClick={() => { setActiveView('field_inbox'); setWorkbenchTab('visit_01'); }}
          >
            📋 본사 순회 미접수 <b>{fieldUnackedVisitCount}건</b>
          </button>
          <button
            type="button"
            className={'nexus-morning-chip' + (fieldIncompleteTrainCount > 0 ? ' is-warn' : '')}
            onClick={() => { setActiveView('field_inbox'); setWorkbenchTab('training_04'); }}
          >
            🌐 미이수 12개국어 교육 <b>{fieldIncompleteTrainCount}건</b>
          </button>
        </div>
      </section>
    )}
    <NexusDecisionFirstBrief
      viewModel={decisionBriefVm}
      allowedPersonas={allowedDecisionPersonas}
      onSelectPersona={setDecisionPersona}
      onAction={handleDecisionBriefAction}
    />
    {(activeView === 'hq_command' || activeView === 'field_sphere') && <div className="nexus-main">
      <aside className="nexus-aside">
        <div className="nexus-section-title"><span>01 / 통합 안전 현황</span><i /></div>
        <h2>골조·형틀 안전지능을<br /><em>하나의 황금 구체로.</em></h2>
        <p>지하 RC구조물부터 상부 갱폼·동바리·타설까지, 현장 점검과 AI 분석·12개국어 교육·본사 승인을 하나의 궤도로 통합합니다.</p>
        <div className="nexus-aside-rule" />
        <NexusStructuralElevationMap
          pipelineCases={scopedData.pipelineCases}
          activeZoneAxis={axisFilter.zoneAxis}
          activeNodeIndex={selected.index}
          theme={nexusTheme}
          onSelectFloor={(zoneAxis, structuralNodeIndex) => {
            setOrbitLayer('structural');
            setAxisFilter(prev => ({ ...prev, zoneAxis }));
            lockOntoNode(Math.max(0, Number(structuralNodeIndex) - 1), 'structural');
            triggerToast(`🏗️ 단면 구간 선택 (#${structuralNodeIndex})`);
          }}
        />
        <div className="nexus-record-count"><span>연동된 위험성평가 기록</span><strong>{count.toLocaleString('ko-KR')}<small> 건</small></strong></div>
        <div className="nexus-perception" aria-label="근로자가 직접 선택한 자가평가 등급의 분포">
          <span>근로자 체감 위험도</span>
          <h3>근로자 체감 위험 분포 <small>상 · 중 · 하</small></h3>
          {(['상', '중', '하'] as const).map(level => <div className="nexus-perception-row" key={level}>
            <b>{level}</b><div className="nexus-perception-track"><i className={'risk-' + level} style={{ width: (count ? snapshot.selfRiskLevels[level] / count * 100 : 0) + '%' }} /></div>
            <strong>{snapshot.selfRiskLevels[level]}</strong>
          </div>)}
          <p>유효 {count - snapshot.unclassifiedRows} / 전체 {count}건</p>
        </div>
        <div className="nexus-aside-note"><b>◈ 입체 안전 보기 안내</b><p>보기 탭을 전환하거나 황금 구체를 드래그해 5단계 순환·6대 핵심기능·10대 골조 공정을 입체적으로 확인하세요.</p></div>
      </aside>
      <section className="nexus-visual" aria-label="5단계 위험성평가 네트워크 탐색">
        <div className="nexus-visual-head"><span><i /> 입체 안전 관제 · {currentLayerMeta.code}</span><div>
          <button type="button" disabled={!nexusFeatureFlags.threeDEnabled} aria-pressed={flat} onClick={() => { setCinematicPlaying(false); setFlat(v => !v) }}>{!nexusFeatureFlags.threeDEnabled ? '간결한 보기 · 입체 기능 꺼짐' : flat ? '입체 보기' : '간결한 보기'}</button>
          <button type="button" disabled={flat || reduced} onClick={() => { setCinematicPlaying(false); setPaused(v => !v) }}>{paused ? '모션 재생' : '모션 일시정지'}</button>
          <button type="button" className="nexus-story-button" disabled={flat || reduced}
            aria-pressed={cinematicPlaying}
            onClick={() => { if (cinematicPlaying) { setCinematicPlaying(false) } else { setPaused(false); setCinematicNonce(v => v + 1); setCinematicPlaying(true) } }}>
            {cinematicPlaying ? '12초 연출 중단' : '12초 시네마틱 보기'}
          </button>
        </div></div>
        <div className="nexus-layer-bar" role="group" aria-label="구체 탐색 궤도 레이어 전환">
          <div className="nexus-layer-tabs">
            {NEXUS_ORBIT_LAYERS.map(layer => (
              <button
                key={layer.id}
                type="button"
                className={'nexus-layer-tab tone-' + layer.tone + (orbitLayer === layer.id ? ' is-active' : '')}
                aria-pressed={orbitLayer === layer.id}
                onClick={() => handleLayerSwitch(layer.id)}
              >
                <small>{layer.code}</small>
                <span>{layer.label}</span>
              </button>
            ))}
            {orbitLayer !== 'structural' && (
              <button
                type="button"
                className="nexus-axis-toggle-btn"
                aria-expanded={showAxisFilterBar}
                onClick={() => setShowAxisFilterBar(v => !v)}
              >
                {showAxisFilterBar ? '3축 필터 접기' : '3축 필터 ▾'}
              </button>
            )}
          </div>
        </div>
        {(orbitLayer === 'structural' || showAxisFilterBar) && <div className="nexus-axis-bar" role="group" aria-label="골조·형틀·지하 RC 3축 분류 필터">
          <label>
            <span>축1 · 구간</span>
            <select
              aria-label="3축 구간 분류"
              value={axisFilter.zoneAxis}
              onChange={e => handleAxisFilterChange({ zoneAxis: e.target.value as NexusZoneAxis | '' })}
            >
              <option value="">전체 구간 (지하RC·상부)</option>
              {NEXUS_ZONE_AXIS_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>축2 · 세부작업</span>
            <select
              aria-label="3축 세부작업 분류"
              value={axisFilter.processAxis}
              onChange={e => handleAxisFilterChange({ processAxis: e.target.value as NexusProcessAxis | '' })}
            >
              <option value="">전체 골조·형틀 작업</option>
              {NEXUS_PROCESS_AXIS_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>축3 · 가설·장비</span>
            <select
              aria-label="3축 가설·장비 분류"
              value={axisFilter.hazardEquipmentAxis}
              onChange={e => handleAxisFilterChange({ hazardEquipmentAxis: e.target.value as NexusHazardEquipmentAxis | '' })}
            >
              <option value="">전체 가설·장비·위험원</option>
              {NEXUS_HAZARD_EQUIPMENT_AXIS_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </label>
          {(axisFilter.zoneAxis || axisFilter.processAxis || axisFilter.hazardEquipmentAxis) && (
            <button
              type="button"
              className="nexus-axis-reset"
              onClick={() => handleAxisFilterChange({ zoneAxis: '', processAxis: '', hazardEquipmentAxis: '' })}
            >
              3축 필터 초기화
            </button>
          )}
        </div>}
        <div
          className={'nexus-stage' + (flat ? ' is-flat' : '') + (cinematicPlaying ? ' is-cinematic' : '') + (isDraggingSphere ? ' is-dragging' : '')}
          data-cinematic={cinematicPlaying ? 'playing' : 'idle'}
          data-orbit-layer={orbitLayer}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onPointerCancel={handleStagePointerUp}
          onPointerLeave={handleStagePointerUp}
        >
          {!flat && <WebGLNexusCore
            active={safeActive}
            paused={paused}
            reduced={reduced}
            sequenceNonce={cinematicNonce}
            cinematicActive={cinematicPlaying}
            yaw={sphereAngles.yaw}
            pitch={sphereAngles.pitch}
            layerTone={currentLayerMeta.tone}
            nodeVecs={nodeUnitVecs}
            alertLevel={liveAlertLevel}
            alertVec={liveAlertVec}
            zoomScale={zoomScale}
            fallback={<CoreArt active={safeActive} paused={paused} reduced={reduced} sequenceNonce={cinematicNonce} cinematicActive={cinematicPlaying} yaw={sphereAngles.yaw} pitch={sphereAngles.pitch} />}
          />}
          {!flat && <div className="nexus-nucleus" aria-hidden="true" />}
          {!flat && <svg className="nexus-hud-orbits" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <defs>
              <linearGradient id="nexusGoldRing" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffe3b3" stopOpacity="0.48" />
                <stop offset="50%" stopColor="#e5a253" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#74e5ec" stopOpacity="0.38" />
              </linearGradient>
              <radialGradient id="nexusCrownHalo" cx="50%" cy="50%" r="50%">
                <stop offset="68%" stopColor="#e5a253" stopOpacity="0" />
                <stop offset="92%" stopColor="#f5c47e" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#ffe7c2" stopOpacity="0.34" />
              </radialGradient>
            </defs>
            <ellipse cx="500" cy="350" rx="340" ry="134" transform="rotate(-29 500 350)" stroke="url(#nexusGoldRing)" />
            <ellipse cx="500" cy="350" rx="292" ry="106" transform="rotate(55 500 350)" />
            <ellipse cx="500" cy="350" rx="368" ry="182" transform="rotate(9 500 350)" />
            <circle cx="500" cy="350" r="256" className="nexus-astrolabe-vernier" />
            <circle cx="500" cy="350" r="244" className="nexus-astrolabe-outer" />
            <circle cx="500" cy="350" r="232" className="nexus-astrolabe-ticks" />
            <circle cx="500" cy="350" r="172" fill="url(#nexusCrownHalo)" className="nexus-geodesic-ring" />
            <circle cx="500" cy="350" r="96" className="nexus-core-shield-ring" />
            <g className="nexus-astrolabe-cardinals">
              <text x="500" y="84" textAnchor="middle">000° N</text>
              <text x="772" y="353" textAnchor="start">090° E</text>
              <text x="500" y="622" textAnchor="middle">180° S</text>
              <text x="228" y="353" textAnchor="end">270° W</text>
            </g>
          </svg>}
          {!flat && <svg className="nexus-focus-link" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
            <path key={`${orbitLayer}-${selected.index}`} d={dynamicFocusPath} />
            {activeProjection && (
              <>
                <g className="nexus-surface-pin" transform={`translate(${activeProjection.surfaceSvgX} ${activeProjection.surfaceSvgY})`}>
                  <circle r="17" className="pin-pulse" />
                  <circle r="11" className="pin-halo" />
                  <circle r="4.5" className="pin-core" />
                </g>
                <g className="nexus-target-reticle" transform={`translate(${activeProjection.svgX} ${activeProjection.svgY})`}>
                  <circle r="34" className="reticle-outer" />
                  <circle r="20" className="reticle-inner" />
                </g>
              </>
            )}
          </svg>}
          {!flat && <div className="nexus-scene-caption" aria-live="off">
            <span>입체 안전 관제 · {currentLayerMeta.code}</span>
            <small className="nexus-caption-sub">그래픽 시연 / 실시간 위험 경보 아님</small>
          </div>}
          <div className="nexus-core-label" aria-hidden="true">
            <span className="nexus-core-crest">◈ PSI 안전 중심 ◈</span>
            <strong>PSI</strong>
            <small>SAFETY NEXUS</small>
          </div>
          {layerNodes.map((topic, i) => {
            const proj = projectedNodes[i];
            const nodeSig = layerLiveSignals[i];
            const nodePipe = pipelineNodeSummaries[i];
            const nodeHq = hqLoopNodeSummaries[i];
            const liveCount =
              (nodeSig?.unresolvedActions ?? 0) +
              (nodePipe?.openCases ?? 0) +
              (nodeHq?.pendingHqApprovals ?? 0) +
              (nodeHq?.pendingBriefingVisits ?? 0);
            const dimmedByAxis = nodeSig && !nodeSig.matchesAxisFilter;
            const style: React.CSSProperties | undefined = flat ? undefined : {
              left: `${proj.leftPct}%`,
              top: `${proj.topPct}%`,
              opacity: safeActive === i ? 1 : dimmedByAxis ? Math.min(proj.opacity, 0.32) : proj.opacity,
              zIndex: safeActive === i ? 6 : proj.isFront ? 4 : 2,
            };
            return (
              <button
                key={`${orbitLayer}-${topic.index}`}
                type="button"
                style={style}
                data-front={proj?.isFront ? 'true' : 'false'}
                data-tone={topic.tone}
                data-axis-match={nodeSig?.matchesAxisFilter ? 'true' : 'false'}
                data-live-count={liveCount > 0 ? String(liveCount) : undefined}
                className={'nexus-node node-' + i + (safeActive === i ? ' selected' : '')}
                aria-pressed={safeActive === i}
                onClick={() => { setSelectedSeedIdx(0); lockOntoNode(i, orbitLayer, { syncWorkbenchTab: true }); }}
              >
                <b>{topic.index}</b>
                <span>{topic.title}</span>
                {liveCount > 0 && <em className="nexus-node-signal" aria-hidden="true">{liveCount}</em>}
              </button>
            );
          })}
          <div className="nexus-crosshair" aria-hidden="true">
            {currentLayerMeta.label} · {formatSphericalCoord(selected.latDeg, selected.lonDeg)} · 드래그 회전 · 항목 선택
          </div>
        </div>
        <div className="nexus-visual-foot">
          <span>{currentLayerMeta.subtitle}</span>
          <div className="nexus-orbit-controls" role="group" aria-label="구체 포인트 회전 제어">
            <button type="button" onClick={() => setZoomScale(z => Math.max(0.8, Number((z - 0.1).toFixed(2))))} aria-label="구체 축소">－</button>
            <button type="button" onClick={() => setZoomScale(z => Math.min(1.32, Number((z + 0.1).toFixed(2))))} aria-label="구체 확대">＋</button>
            <button type="button" onClick={() => { setSelectedSeedIdx(0); lockOntoNode(safeActive - 1); }} aria-label="이전 구체 포인트">◀ 이전</button>
            <button type="button" onClick={() => { setZoomScale(1); lockOntoNode(safeActive); }} aria-label="선택 항목 정면 맞춤">◎ 정면 맞춤</button>
            <button type="button" onClick={() => { setSelectedSeedIdx(0); lockOntoNode(safeActive + 1); }} aria-label="다음 구체 포인트">다음 ▶</button>
          </div>
        </div>
      </section>
      <aside className="nexus-detail">
        <div className="nexus-section-title">
          <span>02 / 선택한 관리 항목</span>
          <b>{selected.index} / {String(layerNodes.length).padStart(2, '0')}</b>
        </div>
        <div className="nexus-detail-telemetry">
          <span className={'nexus-detail-badge tone-' + selected.tone}>{selected.categoryBadge}</span>
          <code>{formatSphericalCoord(selected.latDeg, selected.lonDeg)}</code>
        </div>
        <div key={`${orbitLayer}-${selected.index}`} className="nexus-detail-intro"><span>{selected.en}</span><h2>{selected.title}</h2></div>
        <div className="nexus-detail-pulse" aria-hidden="true"><i /><i /><i /></div>
        <p className="nexus-detail-text">{selected.detail}</p>
        <div className="nexus-detail-checkpoints" aria-label="선택 포인트 중점 관리사항">
          <strong>중점 관리 포인트</strong>
          <ul>
            {selected.checkpoints.map((cp, idx) => (
              <li key={idx}>{cp}</li>
            ))}
          </ul>
        </div>
        {activeSignal && (
          <div className="nexus-detail-signals" aria-label="선택 포인트 3축 연동 현황">
            <div>
              <span>연계 기록·순회</span>
              <strong>{activeSignal.matchedRecords + (activePipelineSummary?.totalCases ?? 0) + (activeHqLoopSummary?.visitCount ?? 0)}건</strong>
            </div>
            <div>
              <span>미완료·인계</span>
              <strong>{activeSignal.unresolvedActions + (activePipelineSummary?.openCases ?? 0) + (activeHqLoopSummary?.pendingHqApprovals ?? 0)}건</strong>
            </div>
            <div><span>기한 초과</span><strong>{activeSignal.overdueActions + (activePipelineSummary?.overdueCases ?? 0)}건</strong></div>
            <div>
              <span>교육·사례DB</span>
              <strong>
                {activeTrainingSummary?.averageCompletionRatePct !== null && activeTrainingSummary?.averageCompletionRatePct !== undefined
                  ? `이수 ${activeTrainingSummary.averageCompletionRatePct}%`
                  : `사례 ${activeSignal.linkedSeeds.length}건`}
              </strong>
            </div>
          </div>
        )}
        {activeSeed && (
          <div className="nexus-seed-panel" aria-label="3축 연계 표준 사고·아차사고 예방 사례">
            <div className="nexus-seed-head">
              <span>◈ {activeSeed.caseCode} · {activeSeed.hazardMechanism} 중점 예방 사례</span>
            </div>
            {activeSignal && activeSignal.linkedSeeds.length > 1 && (
              <div className="nexus-seed-switcher">
                {activeSignal.linkedSeeds.map((seed, sIdx) => (
                  <button
                    key={seed.caseCode}
                    type="button"
                    aria-pressed={selectedSeedIdx === sIdx}
                    onClick={() => setSelectedSeedIdx(sIdx)}
                  >
                    {seed.caseCode}
                  </button>
                ))}
              </div>
            )}
            <h4>{activeSeed.title}</h4>
            <details className="nexus-detail-seed-drawer">
              <summary>원인 · 재발방지 · 순회브리핑 6대 구조 펼쳐보기</summary>
              <dl className="nexus-seed-tree">
                <div><dt>직접원인</dt><dd>{activeSeed.directCause}</dd></div>
                <div><dt>기여요인</dt><dd>{activeSeed.contributingFactor}</dd></div>
                <div><dt>근본원인</dt><dd>{activeSeed.rootCause}</dd></div>
                <div><dt>재발방지</dt><dd>{activeSeed.preventiveMeasure}</dd></div>
                <div><dt>순회점검 브리핑</dt><dd>{activeSeed.preVisitBriefingPoint}</dd></div>
                <div><dt>대표이사 교육</dt><dd>{activeSeed.ceoTrainingPoint}</dd></div>
              </dl>
            </details>
            <div className="nexus-seed-ceo-actions">
              {effectiveRole === 'hq' ? (
                <>
                  <button
                    type="button"
                    className="nexus-seed-ceo-btn"
                    onClick={() => {
                      const created = stageExecutiveTrainingHandoff(activeSeed, {
                        targetWorkers: 12,
                        dispatchImmediately: true,
                      });
                      setTrainingCampaigns(readExecutiveTrainingCampaigns());
                      setWorkbenchTab('training_04');
                      setActiveView('hq_ops');
                      if (created.structuralNodeIndex && orbitLayer === 'modules') {
                        lockOntoNode(3, 'modules');
                      }
                    }}
                  >
                    04 대표이사 12개국어 안전교육 초안 즉시 생성 →
                  </button>
                  <button
                    type="button"
                    className="nexus-seed-ceo-btn is-secondary"
                    onClick={() => {
                      stageExecutiveTrainingHandoff(activeSeed, {
                        targetWorkers: 12,
                        dispatchImmediately: true,
                      });
                      onNavigateToPage('admin-training');
                    }}
                  >
                    QR·음성 스튜디오 열기 ↗
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="nexus-seed-ceo-btn"
                  onClick={() => {
                    setWorkbenchTab('training_04');
                    setActiveView('field_inbox');
                  }}
                >
                  04 우리 현장 12개국어 교육·서명 열기 →
                </button>
              )}
            </div>
          </div>
        )}
        <div className="nexus-detail-handoff-row">
          {effectiveRole === 'hq' ? (
            <>
              <button type="button" onClick={() => handleSelectWorkspaceView('hq_bi')}>
                📊 경영 브리핑 BI 분석 →
              </button>
              <button type="button" onClick={() => handleSelectWorkspaceView('hq_ops')}>
                ⚡ 본사 결재·보고 스튜디오 →
              </button>
            </>
          ) : (
            <button type="button" onClick={() => handleSelectWorkspaceView('field_ops')}>
              🦺 내 현장 즉시 실행·사진 전송 →
            </button>
          )}
        </div>
        <button type="button" className="nexus-primary" onClick={() => onNavigateToPage(selected.page)}>{selected.action}<span>↗</span></button>
        <div className="nexus-next"><span>현장 안전 순환 절차</span><ol><li>현장 위험·사진 수집</li><li>AI 구조화 · 본사 대조</li><li>시정조치 · 재점검·인계</li><li>다국어 교육 · 전 현장 환류</li></ol></div>
      </aside>
    </div>}
    {effectiveRole === 'hq' && activeView === 'hq_bi' && bentoSnapshot && (
      <div className="nexus-hq-bi-view" aria-label="본사 전사 경영 브리핑 BI 분석">
        <div className="nexus-hq-daily-bar">
          <div>
            <strong>🏛️ 대표이사 · 경영진 일일 전사 안전 통합 보고서</strong>
            <small>전 현장의 작업중지·건설기계 사진·사고조사 승인·다국어 교육 이수율을 1장 보고서·PPTX·증빙 ZIP으로 즉시 취합합니다.</small>
          </div>
          <div className="nexus-3axis-case-row-actions">
            <button
              type="button"
              className="nexus-3axis-submit"
              onClick={() => {
                const pack = buildUnifiedCeoDailyBriefing({
                  asOfDate: followup.asOfDate,
                  reporterLabel: '본사 CSO · 안전보건실장',
                  pipelineCases: scopedData.pipelineCases,
                  visitPlans: scopedData.visitPlans,
                  investigations: scopedData.investigations,
                  trainingCampaigns: scopedData.trainingCampaigns,
                  equipmentReports: scopedData.equipmentReports,
                });
                setDailyCeoBriefing(pack);
                setDailyBriefingNotice('');
                triggerToast('📋 대표이사 일일 통합 안전브리핑 1장 생성 완료');
              }}
            >
              🏛️ 대표이사 일일 통합 안전브리핑 1장 생성 ↗
            </button>
            <button type="button" onClick={() => void handleExportCeoPptx()}>
              📽️ 대표이사 브리핑 PPTX 저장
            </button>
            <button type="button" onClick={() => void handleDownloadComplianceZip()}>
              📦 중대재해처벌법 증빙 ZIP
            </button>
          </div>
        </div>
        {!dailyCeoBriefing && dailyBriefingNotice && (
          <p role="status" className="nexus-3axis-feedback">{dailyBriefingNotice}</p>
        )}

        {dailyCeoBriefing && (
          <section className="nexus-ceo-daily-sheet" aria-label="대표이사 일일 전사 안전 통합 브리핑 시트">
            <div className="nexus-3axis-matched-title">
              <strong>
                📋 [{dailyCeoBriefing.briefingId}] 대표이사·경영진 일일 통합 안전브리핑 ({dailyCeoBriefing.siteCount}개 현장)
              </strong>
              <div className="nexus-3axis-case-row-actions">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(dailyCeoBriefing.summaryText);
                      }
                      setDailyBriefingNotice('대표이사 일일 통합 안전브리핑 요약문을 클립보드에 복사했습니다.');
                    } catch {
                      setDailyBriefingNotice('아래 요약문 박스에서 복사해 주세요.');
                    }
                  }}
                >
                  📋 경영진 브리핑 복사
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const blob = new Blob([dailyCeoBriefing.csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${dailyCeoBriefing.briefingId}-통합안전브리핑.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      setDailyBriefingNotice(`${dailyCeoBriefing.briefingId} 엑셀(CSV) 파일을 저장했습니다.`);
                    } catch {
                      setDailyBriefingNotice('CSV 다운로드를 시작하지 못했습니다.');
                    }
                  }}
                >
                  📊 엑셀(CSV) 저장
                </button>
                <button type="button" onClick={() => setDailyCeoBriefing(null)}>✕ 닫기</button>
              </div>
            </div>
            {dailyBriefingNotice && <p role="status" className="nexus-3axis-feedback">{dailyBriefingNotice}</p>}
            <div className="nexus-ceo-daily-kpis">
              <span>⛔ 작업중지 <b>{dailyCeoBriefing.stopWorkCount}건</b> (전체 미결 {dailyCeoBriefing.openActionsCount})</span>
              <span>🏗️ 건설기계 사진 <b>{dailyCeoBriefing.equipReadyCount}건</b> (대기 {dailyCeoBriefing.equipPendingCount})</span>
              <span>🔍 조사승인·순회 <b>{dailyCeoBriefing.pendingApprovalCount} / {dailyCeoBriefing.activeVisitCount}건</b> (접수 {dailyCeoBriefing.ackedVisitCount})</span>
              <span>🌐 교육이수율 <b>{dailyCeoBriefing.trainingCompletionPct}%</b></span>
            </div>
            {dailyCeoBriefing.verifiedPhotoThumbs.length > 0 && (
              <div className="nexus-ceo-daily-thumbs" aria-label="경영진 보고 편입 건설기계 점검 사진">
                {dailyCeoBriefing.verifiedPhotoThumbs.map(th => (
                  <figure key={th.submissionId}>
                    <img src={th.photoDataUrl} alt={`${th.siteName} ${th.equipmentLabel}`} />
                    <figcaption>{th.siteName.split(' ')[0]} · {th.equipmentLabel}</figcaption>
                  </figure>
                ))}
              </div>
            )}
            <pre className="nexus-ceo-pre">{dailyCeoBriefing.summaryText}</pre>
          </section>
        )}

        <div className="nexus-site-matrix-grid" role="group" aria-label="본사 3대 골조 포트폴리오 실시간 비교 매트릭스">
          {siteMatrix.map(card => (
            <button
              key={card.siteId}
              type="button"
              className={
                'nexus-site-matrix-card urgency-' +
                card.urgencyLevel +
                (hqSelectedSiteId === card.siteId ? ' is-selected' : '')
              }
              aria-pressed={hqSelectedSiteId === card.siteId}
              onClick={() => {
                setHqSelectedSiteId(hqSelectedSiteId === card.siteId ? '' : card.siteId);
                lockOntoNode(Math.max(0, Number(card.focusNodeIndex) - 1), 'structural');
              }}
            >
              <div className="nexus-site-matrix-top">
                <strong>{card.shortLabel}</strong>
                <em className={'urgency-badge urgency-' + card.urgencyLevel}>
                  {card.urgencyLabel}
                </em>
              </div>
              <div className="nexus-site-matrix-metrics">
                <span>미결 <b>{card.openActionsCount}</b></span>
                <span>순회 <b>{card.activeVisitsCount}</b></span>
                <span>승인·보완 <b>{card.pendingApprovalsCount + card.revisionRequestedCount}</b></span>
                <span>교육 <b>{card.avgTrainingCompletionPct !== null ? `${card.avgTrainingCompletionPct}%` : '대기'}</b></span>
              </div>
            </button>
          ))}
        </div>
        <NexusExecutiveBentoBoard
          snapshot={bentoSnapshot}
          reducedMotion={reduced}
          theme={nexusTheme}
          selectedZoneAxis={axisFilter.zoneAxis}
          onSelectHeatmapCell={(zoneAxis, structuralNodeIndex) => {
            setOrbitLayer('structural');
            setAxisFilter(prev => ({ ...prev, zoneAxis }));
            const idx = Math.max(0, Number(structuralNodeIndex) - 1);
            lockOntoNode(idx, 'structural');
            setActiveView('hq_command');
          }}
          onSelectSiteBar={siteId => {
            setHqSelectedSiteId(siteId === hqSelectedSiteId ? '' : siteId);
          }}
          onSelectKpi={kpiKey => {
            setActiveView('hq_ops');
            if (kpiKey === 'equipment') setWorkbenchTab('equipment_photo');
            else if (kpiKey === 'training') setWorkbenchTab('training_04');
            else if (kpiKey === 'hq_command') setWorkbenchTab('investigate_05_02');
            else setWorkbenchTab('inspect_03_06');
          }}
        />
      </div>
    )}
    {(activeView === 'hq_ops' || activeView === 'field_ops' || activeView === 'field_inbox') && (
      <div id="nexus-closed-loop-workbench">
        <NexusHqCommandWorkbench
          workspaceRole={effectiveRole}
          fieldSection={activeView === 'field_inbox' ? 'inbox' : 'execute'}
          effectiveSiteId={scopedData.effectiveSiteId}
          activeSiteLabel={scopedData.activeSiteMeta?.siteName || '전사 통합 포트폴리오'}
          activeTab={workbenchTab}
          onTabChange={setWorkbenchTab}
          activeSeed={activeSeed}
          pipelineCases={scopedData.pipelineCases}
          onPipelineCreated={() => {
            const latest = readNexusPipelineCases();
            setPipelineCases(latest);
            const created = latest[0];
            if (created) {
              const targetIdx = Math.max(0, Number(created.structuralNodeIndex) - 1);
              if (orbitLayer === 'structural') {
                lockOntoNode(targetIdx, 'structural');
              } else if (orbitLayer === 'modules') {
                lockOntoNode(5, 'modules');
              } else {
                lockOntoNode(3, 'cycle');
              }
            }
          }}
          onPipelineUpdated={() => setPipelineCases(readNexusPipelineCases())}
          trainingCampaigns={scopedData.trainingCampaigns}
          onTrainingCampaignsChange={() => setTrainingCampaigns(readExecutiveTrainingCampaigns())}
          onOpenAdminTraining={() => onNavigateToPage('admin-training')}
          visitPlans={scopedData.visitPlans}
          onVisitPlansChange={() => setVisitPlans(readHqVisitPlans())}
          investigations={scopedData.investigations}
          onInvestigationsChange={() => {
            setInvestigations(readAiInvestigations());
            setApprovedCustomSeeds(readApprovedCustomIncidentSeeds());
          }}
          equipmentReports={scopedData.equipmentReports}
          onEquipmentReportsChange={() => setEquipmentReports(readEquipmentPhotoSubmissions())}
          onLockOntoStructuralNode={nodeIndexStr => {
            const targetIdx = Math.max(0, Number(nodeIndexStr) - 1);
            if (orbitLayer === 'structural') {
              lockOntoNode(targetIdx, 'structural');
            }
          }}
          onExportExecutivePptx={handleExportCeoPptx}
          onLoadDemoData={handleLoadMultiSiteSimulation}
          quickStopWorkTrigger={quickStopWorkTrigger}
        />
      </div>
    )}
    {effectiveRole === 'hq' && (activeView === 'hq_command' || activeView === 'hq_audit') && (
      <>
        <section id="nexus-followup-details" tabIndex={-1} className="nexus-followup" aria-label="근로자 위험성평가 후속조치 익명 집계">
          <div className="nexus-followup-header">
            <div><span>관리자 기록 기반 조회</span><h2>후속조치 현황 <small>불러온 기록의 관리자 이력 기준</small></h2></div>
            <p>이 화면은 현장 안전을 판정하거나 조치 완료를 승인하지 않습니다. <b>현장별 인증 범위는 아직 미연동</b>입니다.</p>
          </div>
          <div className="nexus-followup-filters">
            <label>현장
              <select disabled aria-label="현장 인증 범위 미연동"><option>현장 인증 범위 미연동</option></select>
            </label>
            <label>작성 월
              <select value={filterMonth} onChange={event => { setFilterMonth(event.target.value); setSelectedQuestion(null) }} aria-label="작성 월 선택">
                <option value="">전체 작성기간</option>
                {filterMonth && !loadedSlice.monthOptions.includes(filterMonth) && <option value={filterMonth}>{filterMonth} · 현재 기록 없음</option>}
                {loadedSlice.monthOptions.map(month => <option key={month} value={month}>{month}</option>)}
              </select>
            </label>
            <label>공종
              <select value={filterTrade} onChange={event => { setFilterTrade(event.target.value); setSelectedQuestion(null) }} aria-label="공종 선택">
                <option value="">전체 공종</option>
                {filterTrade && !loadedSlice.tradeOptions.includes(filterTrade) && <option value={filterTrade}>{filterTrade} · 현재 기록 없음</option>}
                {loadedSlice.tradeOptions.map(trade => <option key={trade} value={trade}>{trade}</option>)}
              </select>
            </label>
            <span className="nexus-followup-asof">조치 기준일 {followup.asOfDate} · 확인 범위: 현재 불러온 기록</span>
          </div>
          <div className="nexus-followup-cards">
            {[
              ['미완료', followup.unresolved, 'unresolved'],
              ['기한 초과', followup.overdue, 'overdue'],
              ['임시 통제 중', followup.interimControl, 'interim_control'],
              ['조치 예정', followup.scheduled, 'scheduled'],
              ['재개방 이력', followup.reopened, 'reopened'],
              ['완료로 기록된 조치', followup.completed, 'completed'],
            ].map(([label, value, tone]) =>
              <button type="button" aria-pressed={priorityFilter === tone} onClick={() => { setPriorityFilter(tone as FollowupFilter); document.querySelector('.nexus-priority-summary')?.scrollIntoView({ block: 'start' }); }} className={'nexus-followup-card tone-' + tone} key={String(label)}>
                <span>{label}</span><strong>{value}</strong><small>건</small>
              </button>
            )}
          </div>
          <div className="nexus-followup-breakdown" aria-label="문항별 후속조치 내역">
            <h3>문항별 확인이 필요한 조치</h3>
            <p>선택한 작성 기록과 연결된 조치입니다. 기한 초과와 재개방 이력은 미완료 건수와 겹칠 수 있습니다.</p>
            {followup.totalCases === 0 ? <p>{followup.conflictingRecords ? '집계 가능한 조치 이력이 없습니다. 충돌 기록의 원본을 확인해 주세요.' : '선택한 기록에 연결된 조치 이력이 없습니다.'}</p> :
              <ul>{followup.questionGroups.filter(group => group.unresolved || group.overdue || group.reopened).map(group =>
                <li key={group.number}><button type="button" aria-pressed={selectedQuestion === group.number} onClick={() => setSelectedQuestion(group.number)}>Q{group.number} 관련 기록 보기</button> · 미완료 {group.unresolved}건 · 기한 초과 {group.overdue}건 · 재개방 이력 {group.reopened}건</li>
              )}</ul>}
            {followup.totalCases > 0 && followup.questionGroups.every(group => !group.unresolved && !group.overdue && !group.reopened) &&
              <p>선택 범위에서 미완료 또는 재개방 이력이 집계되지 않았습니다.</p>}
            {selectedQuestion !== null && <div>
              <p>Q{selectedQuestion}에 연결된 이력이 있는 선택 범위의 기록입니다. 아래 이력은 조치 기준일 {followup.asOfDate}까지 표시하며, 완료 이력도 포함할 수 있습니다.</p>
              {questionCases.length === 0 && <p>해당 문항에 집계 가능한 조치가 없습니다. 충돌한 이력은 표시하지 않습니다.</p>}
              <ul>{questionCases.map(({ recordId, item }) => {
                const record = filteredRecords.find(row => String(row.id || '').trim() === recordId);
                return <li key={recordId + '-' + item.caseId}>{record?.date} · {record?.jobField || '공종 미확인'} · {record?.name || '이름 미확인'} {record && onOpenRecord && <button type="button" onClick={() => onOpenRecord(record)}>기록 상세 열기</button>}
                  <details><summary>해당 문항 조치 이력 보기</summary>
                    <ul>{item.events.map(event =>
                      <li key={event.id}>{event.timestamp} · {FOLLOWUP_STATUS_LABELS[event.status] || '상태 확인 필요'} · {event.actionDetail || '내용 없음'}</li>
                    )}</ul>
                  </details>
                  {!record?.handwrittenAnswers?.some(answer => Boolean(String(answer.answerText || '').trim())) && <span> · 자필 답변이 없어 상세 화면의 조치 도구가 표시되지 않을 수 있습니다.</span>}</li>;
              })}</ul>
            </div>}
          </div>
          <div className="nexus-practice">
            <div className="nexus-practice-heading">
              <strong>현장 실천 확인 · 별도 재점검</strong>
              <span>교육 전달과 조치 완료는 구별하며, 재점검은 관리자 이력 기준입니다.</span>
            </div>
            <PracticeEvidencePanel records={filteredRecords} summary={practice} selected={practiceFilter} onSelect={setPracticeFilter} onOpenRecord={onOpenRecord} />
            <p>재확인 필요는 기록·문항의 마지막 현장 확인에서 개선 필요 또는 확인 불가로 남은 경우입니다.
              안전행동이 관찰되었더라도 조치 완료·작업재개가 자동 승인되는 것은 아닙니다.</p>
          </div>
          <div className="nexus-followup-footer">
            <span>조치 이력 {followup.totalCases}건 · 선택한 작성기록과 연결된 조치만 반영 · 이전 주기 미완료 {followup.carriedOver}건 · 선택 월말 또는 현재일 기준 상태입니다.</span>
            <span>미완료·임시통제·기한초과는 완료로 처리하지 않습니다. 재개방은 이력 건수이며 현재 미완료와 중복될 수 있습니다.</span>
            {loadedSlice.undatedRowsInAllPeriods > 0 && <span>작성일 확인 불가 {loadedSlice.undatedRowsInAllPeriods}행 · 특정 월로 임의 배정하지 않음</span>}
          </div>
        </section>
        <section className="nexus-metrics" aria-label="6대 안전인식 지표">
          <div className="nexus-metrics-caption"><span>6대 핵심 안전 지표</span><strong>6대 안전인식 지표</strong><p>지표명 안내입니다. 점수와 유효 분모는 이 화면에 아직 연결되지 않았습니다.</p></div>
          <div className="nexus-metrics-list">{METRICS.map(s => <div className="nexus-metric" key={s[0]}><span>{s[0]} <i /></span><strong>{s[1]}</strong><small>{s[2]}</small></div>)}</div>
          <button type="button" onClick={() => onNavigateToPage('monthly-guidance-report')}>기존 평가 보고서 열기</button>
        </section>
        <ScoreMetricEvidencePanel records={filteredRecords} scopeLabel={`${filterMonth || '전체 작성기간'} · ${filterTrade || '전체 공종'}`} asOf={followup.asOfDate} loadState={loadState} onOpenRecord={onOpenRecord} />
        <section className="nexus-compliance-panel" aria-label="중대재해처벌법 반기·월간 법적 이행 증빙 편철 센터">
          <div className="nexus-3axis-bridge-head">
            <div>
              <span className="nexus-3axis-kicker">중대재해처벌법 증빙 보관 · 위·변조 검증 목록 포함</span>
              <h3>📦 중대재해처벌법 반기·월간 법적 이행 증빙 패키지 1클릭 편철</h3>
              <p className="nexus-3axis-case-row-meta">
                시정조치·작업중지 이력, 본사 검증 건설기계 점검 사진 원본, 12개국어 교육 자필 서명 이미지, 순회점검·사고조사 승인 기록을 단일 ZIP 파일로 묶습니다.
              </p>
            </div>
            <div className="nexus-3axis-case-row-actions">
              <button type="button" className="nexus-3axis-submit" onClick={() => void handleDownloadComplianceZip()}>
                📦 증빙 ZIP 패키지 1클릭 편철 저장 ↗
              </button>
              <button type="button" onClick={() => void handleExportCeoPptx()}>
                📽️ 경영진 보고 PPTX 저장
              </button>
            </div>
          </div>
          {complianceNotice && <p role="status" className="nexus-3axis-feedback">{complianceNotice}</p>}
        </section>
      </>)}
    <footer className="nexus-footer"><span>PSI / SAFETY NEXUS</span><span>현재 불러온 기록의 탐색 화면입니다. 실제 현장 승인 통계와의 대조는 미완료입니다.</span>
      <label><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} /> 움직임 줄이기</label></footer>

    {effectiveRole === 'field' && (
      <div className="nexus-mobile-thumb-dock" role="navigation" aria-label="현장 한손 엄지 빠른 작업 바">
        <div className="nexus-dock-quick-row">
          <button
            type="button"
            className="nexus-dock-quick-photo"
            onClick={() => {
              setActiveView('field_ops');
              setWorkbenchTab('equipment_photo');
              document
                .getElementById('nexus-closed-loop-workbench')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              triggerToast('📷 건설기계·현장 사진 바로 보고로 이동');
            }}
          >
            📷 바로 사진보고
          </button>
          <button
            type="button"
            className="nexus-dock-quick-stopwork"
            onClick={() => {
              setActiveView('field_ops');
              setWorkbenchTab('inspect_03_06');
              setQuickStopWorkTrigger(v => v + 1);
              document
                .getElementById('nexus-closed-loop-workbench')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              triggerToast('⛔ 작업중지 즉시 등록 폼을 열었습니다');
            }}
          >
            ⛔ 작업중지 즉시 등록
          </button>
        </div>
        <div className="nexus-dock-nav-row">
          <button
            type="button"
            className={activeView === 'field_ops' && workbenchTab === 'inspect_03_06' ? 'is-active' : undefined}
            aria-current={activeView === 'field_ops' && workbenchTab === 'inspect_03_06' ? 'page' : undefined}
            onClick={() => { setActiveView('field_ops'); setWorkbenchTab('inspect_03_06'); }}
          >
            ⚡ 30초 점검
            {fieldOpenCount > 0 && <em className="nexus-dock-badge">{fieldOpenCount}</em>}
          </button>
          <button
            type="button"
            className={activeView === 'field_ops' && workbenchTab === 'equipment_photo' ? 'is-active' : undefined}
            aria-current={activeView === 'field_ops' && workbenchTab === 'equipment_photo' ? 'page' : undefined}
            onClick={() => { setActiveView('field_ops'); setWorkbenchTab('equipment_photo'); }}
          >
            🏗️ 기계사진
            {fieldEquipRevCount > 0 && <em className="nexus-dock-badge is-urgent">{fieldEquipRevCount}</em>}
          </button>
          <button
            type="button"
            className={activeView === 'field_inbox' && workbenchTab === 'training_04' ? 'is-active' : undefined}
            aria-current={activeView === 'field_inbox' && workbenchTab === 'training_04' ? 'page' : undefined}
            onClick={() => { setActiveView('field_inbox'); setWorkbenchTab('training_04'); }}
          >
            📱 QR 서명
            {fieldIncompleteTrainCount > 0 && <em className="nexus-dock-badge">{fieldIncompleteTrainCount}</em>}
          </button>
        </div>
      </div>
    )}

    {cmdPaletteOpen && (
      <div
        className="nexus-cmd-palette-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="안전지능 빠른 기능 찾기"
        onClick={() => setCmdPaletteOpen(false)}
      >
        <div className="nexus-cmd-palette-dialog" onClick={e => e.stopPropagation()}>
          <div className="nexus-cmd-palette-head">
            <input
              type="text"
              autoFocus
              aria-label="빠른 실행 명령 검색"
              value={cmdQuery}
              onChange={e => setCmdQuery(e.target.value)}
              onKeyDown={e => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCmdActiveIdx(i => (paletteCommands.length ? (i + 1) % paletteCommands.length : 0));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCmdActiveIdx(i =>
                    paletteCommands.length ? (i - 1 + paletteCommands.length) % paletteCommands.length : 0,
                  );
                } else if (e.key === 'Enter' && paletteCommands[cmdActiveIdx]) {
                  e.preventDefault();
                  executePaletteCommand(paletteCommands[cmdActiveIdx]);
                }
              }}
              placeholder={
                effectiveRole === 'hq'
                  ? '검색 (예: 제2현장, PPTX, 증빙 ZIP, 작업중지, 순회...)'
                  : '내 현장 빠른 이동 (예: 30초, 기계사진, QR, 동기화...)'
              }
            />
            <button type="button" onClick={() => setCmdPaletteOpen(false)}>Esc</button>
          </div>
          <ul className="nexus-cmd-palette-list">
            {paletteCommands.length === 0 ? (
              <li className="is-empty">일치하는 빠른 실행 명령이 없습니다.</li>
            ) : (
              paletteCommands.map((cmd, idx) => (
                <li key={cmd.id}>
                  <button
                    type="button"
                    className={idx === cmdActiveIdx ? 'is-highlighted' : undefined}
                    aria-selected={idx === cmdActiveIdx}
                    onMouseEnter={() => setCmdActiveIdx(idx)}
                    onClick={() => executePaletteCommand(cmd)}
                  >
                    <div>
                      <strong>{cmd.label}</strong>
                      <small>{cmd.description}</small>
                    </div>
                    <span>{cmd.badge}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="nexus-cmd-palette-foot">
            <span>↑↓ 이동 · Enter 실행 · Esc 닫기 · F 전체화면</span>
          </div>
        </div>
      </div>
    )}

    {floatingToast && (
      <div className="nexus-floating-toast" role="status" aria-live="polite">
        {floatingToast}
      </div>
    )}
  </main>;
  return immersive && typeof document !== 'undefined' ? createPortal(surface, document.body) : surface;
};
export default SafetyNexus;

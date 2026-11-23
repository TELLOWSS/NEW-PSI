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
  NEXUS_SITE_PORTFOLIO,
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
  readEquipmentPhotoSubmissions,
  type NexusEquipmentPhotoSubmission,
} from '../utils/nexusEquipmentPhotoReport';
import { buildExecutiveBentoSnapshot } from '../utils/nexusExecutiveBentoMetrics';
import { NexusExecutiveBentoBoard } from '../components/shared/NexusExecutiveBentoBoard';
import type { NexusStructuralIncidentSeed } from '../utils/nexusStructuralTaxonomy';
import {
  NexusHqCommandWorkbench,
  type NexusWorkbenchTab,
} from '../components/inspector/NexusHqCommandWorkbench';
import WebGLNexusCore from './NexusWebGLCore';
import { ScoreMetricEvidencePanel } from '../components/shared/ScoreMetricEvidencePanel';
import { PracticeEvidencePanel, type PracticeEvidenceSelection } from '../components/shared/PracticeEvidencePanel';
import { nexusFeatureFlags } from '../config/nexusFeatureFlags';
import './SafetyNexus.css';

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
  const [isDraggingSphere, setIsDraggingSphere] = useState(false);
  const dragStateRef = useRef<{ active: boolean; startX: number; startY: number; startYaw: number; startPitch: number; moved: boolean }>({
    active: false, startX: 0, startY: 0, startYaw: 0, startPitch: 0, moved: false,
  });

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
  const [paused, setPaused] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches);
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
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
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startYaw: sphereAngles.yaw,
      startPitch: sphereAngles.pitch,
      moved: false,
    };
    setIsDraggingSphere(true);
  };

  const handleStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active || flat) return;
    const dx = event.clientX - dragStateRef.current.startX;
    const dy = event.clientY - dragStateRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragStateRef.current.moved = true;
    const nextYaw = normalizeAngleRad(dragStateRef.current.startYaw + dx * 0.0075);
    const nextPitch = Math.max(-0.78, Math.min(0.78, dragStateRef.current.startPitch + dy * 0.0065));
    setSphereAngles({ yaw: nextYaw, pitch: nextPitch });
  };

  const handleStagePointerUp = () => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    setIsDraggingSphere(false);
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
  const [workspaceRole, setWorkspaceRole] = useState<NexusWorkspaceAuthority>(lockedRole ?? initialRole);
  const [hqSelectedSiteId, setHqSelectedSiteId] = useState<string>('');
  const [assignedFieldSiteId, setAssignedFieldSiteId] = useState<string>(
    lockedSiteId || NEXUS_SITE_PORTFOLIO[0].siteId,
  );
  const [activeView, setActiveView] = useState<NexusWorkspaceView>(
    (lockedRole ?? initialRole) === 'field' ? 'field_ops' : 'hq_command',
  );
  const [showAxisFilterBar, setShowAxisFilterBar] = useState<boolean>(false);
  const [workbenchTab, setWorkbenchTab] = useState<NexusWorkbenchTab>(
    (lockedRole ?? initialRole) === 'field' ? 'inspect_03_06' : 'equipment_photo',
  );
  const effectiveRole: NexusWorkspaceAuthority = lockedRole ?? workspaceRole;
  const effectiveFieldSiteId = lockedSiteId || assignedFieldSiteId;
  useEffect(() => {
    const syncPipeline = () => setPipelineCases(readNexusPipelineCases());
    const syncTraining = () => setTrainingCampaigns(readExecutiveTrainingCampaigns());
    const syncHqLoop = () => {
      setVisitPlans(readHqVisitPlans());
      setInvestigations(readAiInvestigations());
      setApprovedCustomSeeds(readApprovedCustomIncidentSeeds());
    };
    const syncEquipment = () => setEquipmentReports(readEquipmentPhotoSubmissions());
    window.addEventListener(NEXUS_PIPELINE_UPDATED_EVENT, syncPipeline);
    window.addEventListener(NEXUS_CEO_TRAINING_UPDATED_EVENT, syncTraining);
    window.addEventListener(NEXUS_HQ_LOOP_UPDATED_EVENT, syncHqLoop);
    window.addEventListener(NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT, syncEquipment);
    window.addEventListener('storage', syncPipeline);
    window.addEventListener('storage', syncTraining);
    window.addEventListener('storage', syncHqLoop);
    window.addEventListener('storage', syncEquipment);
    return () => {
      window.removeEventListener(NEXUS_PIPELINE_UPDATED_EVENT, syncPipeline);
      window.removeEventListener(NEXUS_CEO_TRAINING_UPDATED_EVENT, syncTraining);
      window.removeEventListener(NEXUS_HQ_LOOP_UPDATED_EVENT, syncHqLoop);
      window.removeEventListener(NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT, syncEquipment);
      window.removeEventListener('storage', syncPipeline);
      window.removeEventListener('storage', syncTraining);
      window.removeEventListener('storage', syncHqLoop);
      window.removeEventListener('storage', syncEquipment);
    };
  }, []);
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
    } else {
      setActiveView('field_ops');
      setWorkbenchTab('inspect_03_06');
      const siteMeta = NEXUS_SITE_PORTFOLIO.find(s => s.siteId === effectiveFieldSiteId);
      if (siteMeta) {
        lockOntoNode(Math.max(0, Number(siteMeta.focusNodeIndex) - 1), 'structural');
      }
    }
  };

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
  if (loadState !== 'ready') return <main className="safety-nexus" aria-label="PSI 안전지능 네트워크"><section className="nexus-followup" role="status"><h1>안전지능 네트워크</h1><p>{loadState === 'loading' ? '저장된 기록을 불러오고 있습니다.' : '기록을 불러오지 못했습니다. 화면을 다시 불러와 주세요.'}</p><button type="button" onClick={() => onNavigateToPage('dashboard')}>기존 관제센터로 돌아가기</button></section></main>;
  const surface = <main role={immersive ? 'dialog' : undefined} aria-modal={immersive ? true : undefined} className={'safety-nexus' + (immersive ? ' is-immersive' : '')} data-workspace-role={effectiveRole} data-reduced-motion={reduced ? 'true' : 'false'} data-motion-paused={paused ? 'true' : 'false'} aria-label="PSI 안전지능 네트워크">
    <div className="nexus-background" aria-hidden="true" />
    <header className="nexus-header">
      <div className="nexus-brand"><span className="nexus-symbol">Ψ</span><div><small>SOVEREIGN SAFETY INTELLIGENCE</small><h1>SAFETY <b>NEXUS</b></h1></div></div>
      <div className="nexus-header-right"><span className="nexus-status"><i />GOLD ASTROLABE · 골조·형틀 3D 통합관제</span>
        <button ref={immersiveToggleRef} type="button" className="nexus-immersive-toggle" aria-pressed={immersive} onClick={() => setImmersive(v => !v)}>{immersive ? '몰입 화면 종료 ↙' : '전체 화면 몰입 보기 ⤢'}</button>
        <button type="button" onClick={() => onReturnDashboard ? onReturnDashboard(filterTrade) : onNavigateToPage('dashboard')}>기존 관제센터로 돌아가기 ↗</button></div>
    </header>
    <div className="nexus-lead"><span>ARCHITECTURAL RISK &amp; FORMWORK INTELLIGENCE</span><p>본사 주도 · 현장 실행 · AI 분석 · 12개국어 교육 · 재발방지까지 연결하는 골조·형틀·지하 RC 특화 안전지능 플랫폼</p></div>
    <section className="nexus-priority-summary" aria-label="우선 확인할 후속조치">
      <div className="nexus-priority-ribbon-head">
        <strong>실시간 후속조치 텔레메트리</strong>
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
              전사 전체 ({NEXUS_SITE_PORTFOLIO.length}개 현장)
            </button>
            {NEXUS_SITE_PORTFOLIO.map(site => (
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
              체험 데이터 불러오기 (3개 현장·장비사진)
            </button>
          </div>
        ) : (
          <div className="nexus-scope-strip">
            <span className="nexus-field-lock-badge">
              🔒 단일 현장 격리 · {scopedData.activeSiteMeta?.shortLabel || '제1현장'} · 타현장 비노출
            </span>
            {!lockedSiteId && (
              <label className="nexus-field-site-select">
                <span>배정 현장</span>
                <select
                  aria-label="현장 관리자 소속 현장 선택"
                  value={effectiveFieldSiteId}
                  onChange={e => setAssignedFieldSiteId(e.target.value)}
                >
                  {NEXUS_SITE_PORTFOLIO.map(site => (
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
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'field_inbox'}
                className={'nexus-view-tab' + (activeView === 'field_inbox' ? ' is-active' : '')}
                onClick={() => handleSelectWorkspaceView('field_inbox')}
              >
                ② 본사 수신·교육·상신
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
          ◎ 록온: #{selected.index} {selected.title}
        </button>
      </div>
    </nav>
    {(activeView === 'hq_command' || activeView === 'field_sphere') && <div className="nexus-main">
      <aside className="nexus-aside">
        <div className="nexus-section-title"><span>01 / EXECUTIVE COMMAND</span><i /></div>
        <h2>골조·형틀 안전지능을<br /><em>하나의 황금 구체로.</em></h2>
        <p>지하 RC구조물부터 상부 갱폼·동바리·타설까지, 현장 점검과 AI 분석·12개국어 교육·본사 승인을 하나의 궤도로 통합합니다.</p>
        <div className="nexus-aside-rule" />
        <div className="nexus-record-count"><span>연동된 위험성평가 레코드</span><strong>{count.toLocaleString('ko-KR')}<small> 건</small></strong></div>
        <div className="nexus-perception" aria-label="근로자가 직접 선택한 자가평가 등급의 분포">
          <span>WORKER RISK PERCEPTION</span>
          <h3>근로자 체감 위험 분포 <small>상 · 중 · 하</small></h3>
          {(['상', '중', '하'] as const).map(level => <div className="nexus-perception-row" key={level}>
            <b>{level}</b><div className="nexus-perception-track"><i className={'risk-' + level} style={{ width: (count ? snapshot.selfRiskLevels[level] / count * 100 : 0) + '%' }} /></div>
            <strong>{snapshot.selfRiskLevels[level]}</strong>
          </div>)}
          <p>유효 {count - snapshot.unclassifiedRows} / 전체 {count}건</p>
        </div>
        <div className="nexus-aside-note"><b>◈ 3-ORBIT ASTROLABE</b><p>궤도 탭을 전환하거나 황금 구체를 드래그해 5단계 순환·6대 핵심기능·10대 골조 공정을 입체적으로 지휘하세요.</p></div>
      </aside>
      <section className="nexus-visual" aria-label="5단계 위험성평가 네트워크 탐색">
        <div className="nexus-visual-head"><span><i /> INTELLIGENCE FIELD · {currentLayerMeta.code}</span><div>
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
            <span>SOVEREIGN ASTROLABE · {currentLayerMeta.code}</span>
            <small className="nexus-caption-sub">그래픽 시연 / 실시간 위험 경보 아님</small>
          </div>}
          <div className="nexus-core-label" aria-hidden="true">
            <span className="nexus-core-crest">◈ GOLD CORE ◈</span>
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
            {currentLayerMeta.label} · {formatSphericalCoord(selected.latDeg, selected.lonDeg)} · 드래그 회전 / 포인트 록온
          </div>
        </div>
        <div className="nexus-visual-foot">
          <span>{currentLayerMeta.subtitle}</span>
          <div className="nexus-orbit-controls" role="group" aria-label="구체 포인트 회전 제어">
            <button type="button" onClick={() => { setSelectedSeedIdx(0); lockOntoNode(safeActive - 1); }} aria-label="이전 구체 포인트">◀ 이전</button>
            <button type="button" onClick={() => lockOntoNode(safeActive)} aria-label="선택 포인트 정면 정렬">◎ 정면 록온</button>
            <button type="button" onClick={() => { setSelectedSeedIdx(0); lockOntoNode(safeActive + 1); }} aria-label="다음 구체 포인트">다음 ▶</button>
          </div>
        </div>
      </section>
      <aside className="nexus-detail">
        <div className="nexus-section-title">
          <span>02 / LOCKED SPHERE POINT</span>
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
                  : `시드 ${activeSignal.linkedSeeds.length}건`}
              </strong>
            </div>
          </div>
        )}
        {activeSeed && (
          <div className="nexus-seed-panel" aria-label="3축 연계 표준 사고·아차사고 예방 시드">
            <div className="nexus-seed-head">
              <span>◈ {activeSeed.caseCode} · {activeSeed.hazardMechanism} 중점 아카이브</span>
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
        <div className="nexus-next"><span>CLOSED-LOOP ARCHITECTURE</span><ol><li>현장 위험·사진 수집</li><li>AI 구조화 · 본사 대조</li><li>시정조치 · 재점검·인계</li><li>다국어 교육 · 전 현장 환류</li></ol></div>
      </aside>
    </div>}
    {effectiveRole === 'hq' && activeView === 'hq_bi' && bentoSnapshot && (
      <div className="nexus-hq-bi-view" aria-label="본사 전사 경영 브리핑 BI 분석">
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
        />
      </div>
    )}
    {effectiveRole === 'hq' && (activeView === 'hq_command' || activeView === 'hq_audit') && (
    <>
    <section id="nexus-followup-details" tabIndex={-1} className="nexus-followup" aria-label="근로자 위험성평가 후속조치 익명 집계">
      <div className="nexus-followup-header">
        <div><span>VERIFIABLE READ-ONLY SIGNALS</span><h2>후속조치 현황 <small>불러온 기록의 관리자 이력 기준</small></h2></div>
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
      <div className="nexus-metrics-caption"><span>THE SIX PROTECTION SIGNALS</span><strong>6대 안전인식 지표</strong><p>지표명 안내입니다. 점수와 유효 분모는 이 화면에 아직 연결되지 않았습니다.</p></div>
      <div className="nexus-metrics-list">{METRICS.map(s => <div className="nexus-metric" key={s[0]}><span>{s[0]} <i /></span><strong>{s[1]}</strong><small>{s[2]}</small></div>)}</div>
      <button type="button" onClick={() => onNavigateToPage('monthly-guidance-report')}>기존 평가 보고서 열기</button>
    </section>
    <ScoreMetricEvidencePanel records={filteredRecords} scopeLabel={`${filterMonth || '전체 작성기간'} · ${filterTrade || '전체 공종'}`} asOf={followup.asOfDate} loadState={loadState} onOpenRecord={onOpenRecord} />
    </>)}
    <footer className="nexus-footer"><span>PSI / SAFETY NEXUS</span><span>현재 불러온 기록의 탐색 화면입니다. 실제 현장 승인 통계와의 대조는 미완료입니다.</span>
      <label><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} /> 움직임 줄이기</label></footer>
  </main>;
  return immersive && typeof document !== 'undefined' ? createPortal(surface, document.body) : surface;
};
export default SafetyNexus;

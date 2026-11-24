import type {
  NexusProcessAxis,
  NexusZoneAxis,
} from './nexusStructuralTaxonomy';

export const NEXUS_SITE_MASTER_STORAGE_KEY = 'psi_nexus_site_master_v1';
export const NEXUS_SITE_MASTER_UPDATED_EVENT = 'psi-nexus-site-master-updated';

export interface NexusSitePortfolioItem {
  siteId: string;
  siteName: string;
  shortLabel: string;
  focusZone: NexusZoneAxis;
  focusProcess: NexusProcessAxis;
  focusNodeIndex: string;
  matchTokens: readonly string[];
}

export interface NexusManagedSite extends NexusSitePortfolioItem {
  managerName?: string;
  registeredEquipment: readonly string[];
  archived?: boolean;
  isDefaultSeed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_NEXUS_SITE_SEEDS: readonly NexusSitePortfolioItem[] = [
  {
    siteId: 'SITE-01-SUBRC',
    siteName: '제1현장 지하 2층 RC구간',
    shortLabel: '제1현장 · 지하2층 RC외벽',
    focusZone: 'substructure_rc',
    focusProcess: 'formwork_general',
    focusNodeIndex: '01',
    matchTokens: ['제1현장', '지하', 'b1', 'b2', '합벽', '피트'],
  },
  {
    siteId: 'SITE-02-GANGFORM',
    siteName: '제2현장 103동 15층 갱폼',
    shortLabel: '제2현장 · 103동 갱폼·AL폼',
    focusZone: 'superstructure_std',
    focusProcess: 'gangform',
    focusNodeIndex: '03',
    matchTokens: ['제2현장', '103동', '14층', '15층', '갱폼', 'al폼', '알폼'],
  },
  {
    siteId: 'SITE-03-SHORING',
    siteName: '제3현장 전이층 시스템동바리',
    shortLabel: '제3현장 · 전이층 동바리·타설',
    focusZone: 'rooftop_special',
    focusProcess: 'concrete_pour',
    focusNodeIndex: '07',
    matchTokens: ['제3현장', '전이층', '동바리', '타설', '고층고'],
  },
];

const DEFAULT_EQUIPMENT_BY_SITE: Record<string, readonly string[]> = {
  'SITE-01-SUBRC': ['콘크리트 타설 펌프카', '이동식 크레인·카고', '굴삭기·천공기 (지하·기초)'],
  'SITE-02-GANGFORM': ['타워크레인', '갱폼 인양·인상 장비'],
  'SITE-03-SHORING': ['고소작업대 (시저스·붐형)', '콘크리트 타설 펌프카'],
};

const buildDefaultManagedSites = (): NexusManagedSite[] =>
  DEFAULT_NEXUS_SITE_SEEDS.map(item => ({
    ...item,
    matchTokens: [...item.matchTokens],
    managerName: `${item.shortLabel.split(' · ')[0]} 안전관리자`,
    registeredEquipment: [...(DEFAULT_EQUIPMENT_BY_SITE[item.siteId] ?? ['콘크리트 타설 펌프카'])],
    archived: false,
    isDefaultSeed: true,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  }));

let memorySiteMasterStore: NexusManagedSite[] | null = null;

const emitSiteMasterUpdated = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NEXUS_SITE_MASTER_UPDATED_EVENT));
  }
};

export const readManagedNexusSites = (includeArchived = false): NexusManagedSite[] => {
  let list: NexusManagedSite[] | null = memorySiteMasterStore;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(NEXUS_SITE_MASTER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          list = parsed;
          memorySiteMasterStore = parsed;
        }
      }
    } catch {
      // Fall back to memory/defaults
    }
  }
  const resolved = list && list.length > 0 ? list : buildDefaultManagedSites();
  return includeArchived ? [...resolved] : resolved.filter(site => !site.archived);
};

export const writeManagedNexusSites = (sites: readonly NexusManagedSite[]): void => {
  const next = sites.length > 0 ? [...sites] : buildDefaultManagedSites();
  memorySiteMasterStore = next;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(NEXUS_SITE_MASTER_STORAGE_KEY, JSON.stringify(next));
      emitSiteMasterUpdated();
    } catch {
      // Ignore quota errors in restricted environments
    }
  }
};

export const resetManagedNexusSites = (): NexusManagedSite[] => {
  const defaults = buildDefaultManagedSites();
  memorySiteMasterStore = defaults;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(NEXUS_SITE_MASTER_STORAGE_KEY);
      emitSiteMasterUpdated();
    } catch {
      // Ignore
    }
  }
  return defaults;
};

const ZONE_TO_DEFAULT_NODE: Record<NexusZoneAxis, string> = {
  substructure_rc: '01',
  foundation: '02',
  superstructure_std: '03',
  rooftop_special: '07',
};

export const upsertManagedNexusSite = (
  input: {
    siteId?: string;
    siteName: string;
    shortLabel?: string;
    focusZone?: NexusZoneAxis;
    focusProcess?: NexusProcessAxis;
    focusNodeIndex?: string;
    managerName?: string;
    registeredEquipment?: readonly string[];
    matchTokens?: readonly string[];
  },
  nowIso = new Date().toISOString(),
): { sites: NexusManagedSite[]; savedSite: NexusManagedSite } => {
  const current = readManagedNexusSites(true);
  const siteName = String(input.siteName || '').trim();
  if (!siteName) {
    throw new Error('현장명을 입력해 주세요.');
  }
  const focusZone: NexusZoneAxis = input.focusZone ?? 'superstructure_std';
  const focusProcess: NexusProcessAxis = input.focusProcess ?? 'formwork_general';
  const focusNodeIndex =
    String(input.focusNodeIndex || '').trim() || ZONE_TO_DEFAULT_NODE[focusZone] || '03';
  const shortLabel =
    String(input.shortLabel || '').trim() || siteName.slice(0, 26);

  const requestedId = String(input.siteId || '').trim();
  const siteId =
    requestedId ||
    `SITE-${String(current.length + 1).padStart(2, '0')}-${Date.now().toString(36).toUpperCase().slice(-4)}`;

  const autoTokens = Array.from(
    new Set(
      [
        ...(input.matchTokens ?? []),
        siteName,
        shortLabel,
        ...siteName.split(/\s+/),
        ...shortLabel.split(/[\s·]+/),
      ]
        .map(t => String(t).trim())
        .filter(t => t.length >= 2),
    ),
  );

  const equipmentList = (input.registeredEquipment ?? [])
    .map(item => String(item).trim())
    .filter(Boolean);

  const existing = current.find(s => s.siteId === siteId);
  const savedSite: NexusManagedSite = {
    siteId,
    siteName,
    shortLabel,
    focusZone,
    focusProcess,
    focusNodeIndex,
    matchTokens: autoTokens.length > 0 ? autoTokens : [siteName],
    managerName: String(input.managerName || existing?.managerName || '현장 안전관리자').trim(),
    registeredEquipment:
      equipmentList.length > 0
        ? equipmentList
        : existing?.registeredEquipment ?? ['콘크리트 타설 펌프카'],
    archived: false,
    isDefaultSeed: existing?.isDefaultSeed ?? false,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const next = existing
    ? current.map(item => (item.siteId === siteId ? savedSite : item))
    : [...current, savedSite];
  writeManagedNexusSites(next);
  return { sites: next, savedSite };
};

export const archiveManagedNexusSite = (
  siteId: string,
  archived = true,
  nowIso = new Date().toISOString(),
): NexusManagedSite[] => {
  const current = readManagedNexusSites(true);
  const activeCount = current.filter(s => !s.archived).length;
  if (archived && activeCount <= 1) {
    throw new Error('최소 1개 이상의 활성 현장은 유지해야 합니다.');
  }
  const next = current.map(site =>
    site.siteId === siteId ? { ...site, archived, updatedAt: nowIso } : site,
  );
  writeManagedNexusSites(next);
  return next;
};

export const findManagedSiteById = (
  siteId: string,
  includeArchived = true,
): NexusManagedSite | undefined =>
  readManagedNexusSites(includeArchived).find(site => site.siteId === siteId);

export interface HarnessVersionDescriptor {
    version: string;
    label: string;
    category: 'prompt' | 'policy' | 'rule';
    releasedAt: string;
    previousVersion?: string | null;
    summary: string;
    details: string[];
    changesFromPrevious?: string[];
}

export interface HarnessVersionDetailsBundle {
    prompt: HarnessVersionDescriptor[];
    policy: HarnessVersionDescriptor[];
    rule: HarnessVersionDescriptor[];
}

export interface HarnessVersionChangeSummaryBundle {
    prompt: string[];
    policy: string[];
    rule: string[];
}

const HARNESS_VERSION_CATALOG: HarnessVersionDescriptor[] = [
    {
        version: 'psi-harness-prompt-2026-04-10',
        label: 'Prompt Baseline 2026-04-10',
        category: 'prompt',
        releasedAt: '2026-04-10',
        previousVersion: null,
        summary: '시스템 지시어/정적 지식/동적 컨텍스트 3계층 프롬프트 스냅샷 구조를 도입한 기준 버전입니다.',
        details: [
            '시스템 지시어와 정적 지식 레이어를 분리했습니다.',
            '날씨·작업계획·센서 이벤트를 동적 컨텍스트 라인으로 조합합니다.',
            '감사 추적용 assembledPrompt snapshot 저장을 전제합니다.',
        ],
        changesFromPrevious: [
            '프롬프트를 단일 문자열에서 계층형 스냅샷 구조로 전환했습니다.',
            '동적 컨텍스트 라인을 별도 레이어로 추적 가능하게 했습니다.',
        ],
    },
    {
        version: 'psi-harness-policy-2026-04-10',
        label: 'Policy Baseline 2026-04-10',
        category: 'policy',
        releasedAt: '2026-04-10',
        previousVersion: null,
        summary: 'OCR 품질 임계값과 고위험 공종 보수 해석 정책을 정의한 첫 기준 버전입니다.',
        details: [
            '최소 텍스트 길이 및 OCR confidence 임계값을 강제합니다.',
            'critical OCR confidence 구간을 별도로 분리합니다.',
            '고위험 공종을 중심으로 추가 관리자 승인 가능성을 높입니다.',
        ],
        changesFromPrevious: [
            '입력 품질 차단 임계값을 정책 객체로 고정했습니다.',
            '고위험 공종 목록을 정책 스냅샷에 포함해 감사 가능성을 높였습니다.',
        ],
    },
    {
        version: 'psi-harness-rules-2026-04-11',
        label: 'Rule Pack 2026-04-11',
        category: 'rule',
        releasedAt: '2026-04-11',
        previousVersion: 'pre-versioned-inline-rules',
        summary: '추락/비계/크레인/동바리 룰을 모듈화하고 rule_version 추적을 시작한 버전입니다.',
        details: [
            'fall/scaffold/crane/shoring 규칙을 개별 파일로 분리했습니다.',
            'guardrail override에 ruleVersion을 저장합니다.',
            '오버라이드 메시지를 관리자 모달/리포트/감사 패키지에서 읽을 수 있게 했습니다.',
        ],
        changesFromPrevious: [
            '인라인 룰을 공종별 모듈 파일로 분리했습니다.',
            'rule_version 저장/조회가 가능해져 버전 추적이 시작됐습니다.',
            '오버라이드 로그에 규칙 버전 설명을 연결할 수 있게 됐습니다.',
        ],
    },
];

export function getHarnessVersionDescriptor(version?: string | null): HarnessVersionDescriptor | null {
    const normalized = String(version || '').trim();
    if (!normalized) return null;
    return HARNESS_VERSION_CATALOG.find((entry) => entry.version === normalized) || null;
}

export function getHarnessVersionDescriptors(versions: Array<string | null | undefined>): HarnessVersionDescriptor[] {
    return Array.from(new Set(versions.map((version) => String(version || '').trim()).filter(Boolean)))
        .map((version) => getHarnessVersionDescriptor(version))
        .filter((entry): entry is HarnessVersionDescriptor => Boolean(entry));
}

export function buildHarnessVersionDetailsBundle(options: {
    promptVersions?: Array<string | null | undefined>;
    policyVersions?: Array<string | null | undefined>;
    ruleVersions?: Array<string | null | undefined>;
}): HarnessVersionDetailsBundle {
    return {
        prompt: getHarnessVersionDescriptors(options.promptVersions || []),
        policy: getHarnessVersionDescriptors(options.policyVersions || []),
        rule: getHarnessVersionDescriptors(options.ruleVersions || []),
    };
}

export function buildHarnessVersionChangeSummary(bundle: HarnessVersionDetailsBundle): HarnessVersionChangeSummaryBundle {
    const mapSummaries = (descriptors: HarnessVersionDescriptor[]) => descriptors.flatMap((descriptor) => {
        if (descriptor.changesFromPrevious && descriptor.changesFromPrevious.length > 0) {
            return descriptor.changesFromPrevious.map((change) => `${descriptor.version}: ${change}`);
        }
        return [`${descriptor.version}: ${descriptor.summary}`];
    });

    return {
        prompt: mapSummaries(bundle.prompt),
        policy: mapSummaries(bundle.policy),
        rule: mapSummaries(bundle.rule),
    };
}

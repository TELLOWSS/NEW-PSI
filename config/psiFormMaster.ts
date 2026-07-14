export const PSI_FORM_MASTER_VERSION = 'psi-form-master-2026-07-14-v1';

export type PsiQuestionKey = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5';

export interface PsiFormQuestionDefinition {
    key: PsiQuestionKey;
    questionNumber: '1' | '2' | '3' | '4' | '5';
    title: string;
    subtitle: string;
    workerIntent: string;
    analysisRole: string;
    scoringMetrics: Array<'psychological' | 'jobUnderstanding' | 'riskAssessmentUnderstanding' | 'proficiency' | 'improvementExecution'>;
}

export const PSI_FORM_QUESTIONS: PsiFormQuestionDefinition[] = [
    {
        key: 'Q1',
        questionNumber: '1',
        title: '1. 실제 위험작업(Q1)',
        subtitle: '근로자가 자기 공종 안에서 이번 작업 중 가장 위험하다고 쓴 세부작업입니다. 하단 공종을 대체하지 않습니다.',
        workerIntent: '내가 하는 작업 중 가장 위험한 세부작업을 적는다.',
        analysisRole: '공종 내부의 세부 위험작업을 분리하고, 하단 공종 칸의 확정값과 혼동하지 않는다.',
        scoringMetrics: ['jobUnderstanding'],
    },
    {
        key: 'Q2',
        questionNumber: '2',
        title: '2. 위험 발생 상황 및 원인',
        subtitle: '사고가 발생할 수 있는 구체적인 원인과 예측 상황을 기재합니다.',
        workerIntent: '왜 사고가 날 수 있는지 원인과 상황을 적는다.',
        analysisRole: '위험유형과 사고 원인을 분리해 다음 교육자료의 위험 키워드로 환류한다.',
        scoringMetrics: ['riskAssessmentUnderstanding'],
    },
    {
        key: 'Q3',
        questionNumber: '3',
        title: '3. 위험도 등급 평가',
        subtitle: '근로자가 작업 전 주관적으로 진단한 자가 위험성 수준(상/중/하)입니다.',
        workerIntent: '내가 느끼는 위험수준과 그 이유를 적는다.',
        analysisRole: '근로자의 위험인식 수준과 Q2 위험요인 해석의 정합성을 확인한다.',
        scoringMetrics: ['riskAssessmentUnderstanding'],
    },
    {
        key: 'Q4',
        questionNumber: '4',
        title: '4. 현장 안전대책',
        subtitle: '해당 위험 요소를 실질적으로 통제하기 위한 예방 조치와 대책을 수립합니다.',
        workerIntent: '사고를 막기 위해 작업 전·중에 확인할 감소대책을 적는다.',
        analysisRole: 'Q2 위험요인과 연결되는 제거·차단·통제·보호구 조치를 확인한다.',
        scoringMetrics: ['proficiency'],
    },
    {
        key: 'Q5',
        questionNumber: '5',
        title: '5. 작업 전 다짐 및 점검',
        subtitle: '작업 시작 전 안전대책의 이행을 약속하며 안전 준수 행동을 적습니다.',
        workerIntent: '내가 실제로 지킬 행동을 작업 시작 전 기준으로 적는다.',
        analysisRole: 'Q4 대책을 개인 행동으로 바꾸었는지 확인하고 다음 달 추적 기준으로 남긴다.',
        scoringMetrics: ['improvementExecution'],
    },
];

export const PSI_STANDARD_JOB_FIELDS = [
    '콘크리트비계',
    '시스템',
    '할석미장견출',
    '형틀',
    '철근',
    '장비',
    '기타',
    '미분류',
] as const;

export const PSI_RISK_TYPE_CATALOG = [
    { id: 'fall', label: '추락', keywords: ['추락', '고소', '개구부', '단부', '발판', '사다리'], controlKeywords: ['안전대', '고리', '생명줄', '난간', '발판', '덮개', '개구부', '체결'] },
    { id: 'falling-object', label: '낙하·비래', keywords: ['낙하', '비래', '떨어짐', '자재 낙하', '공구 낙하'], controlKeywords: ['결속', '낙하방지', '상하동시', '통제', '공구', '망', '자재'] },
    { id: 'caught', label: '끼임', keywords: ['끼임', '협착', '말림', '회전체'], controlKeywords: ['방호장치', '비상정지', '전원차단', 'LOTO', '정지', '가동부'] },
    { id: 'crushed', label: '깔림', keywords: ['깔림', '전도', '넘어짐', '중량물'], controlKeywords: ['받침', '고정', '신호수', '유도', '하중', '반경'] },
    { id: 'collapse', label: '붕괴·전도', keywords: ['붕괴', '무너짐', '전도', '동바리'], controlKeywords: ['고정', '버팀', '수평', '수직', '하중', '체결', '검측'] },
    { id: 'electric', label: '감전', keywords: ['감전', '전기', '누전', '전선'], controlKeywords: ['누전차단기', '접지', '절연', '전원차단', '피복', '분전함'] },
    { id: 'fire', label: '화재·폭발', keywords: ['화재', '폭발', '불꽃', '용접', '인화'], controlKeywords: ['소화기', '불티', '가연물', '화기감시', '환기', '차단'] },
    { id: 'cut', label: '베임·찔림', keywords: ['베임', '찔림', '절단', '날카로운'], controlKeywords: ['절단방지', '장갑', '커버', '보관', '날', '공구'] },
    { id: 'collision', label: '충돌', keywords: ['충돌', '부딪힘', '장비 충돌', '차량'], controlKeywords: ['유도', '신호수', '동선', '통제선', '후방', '속도'] },
    { id: 'asphyxia', label: '질식', keywords: ['질식', '밀폐', '산소', '가스'], controlKeywords: ['산소농도', '가스측정', '환기', '감시자', '출입통제'] },
    { id: 'heat', label: '온열질환', keywords: ['온열', '폭염', '열사병', '탈수'], controlKeywords: ['휴식', '물', '그늘', '작업시간', '체온', '폭염'] },
    { id: 'other', label: '기타', keywords: ['기타'], controlKeywords: ['확인', '점검', '통제', '보호구', '작업중지'] },
] as const;

export const PSI_CONTROL_ORDER = ['제거', '대체', '차단·공학적 조치', '관리적 조치', '보호구', '작업중지·재평가'] as const;

export const getPsiQuestionDefinition = (questionNumber: unknown): PsiFormQuestionDefinition | undefined => {
    const normalized = String(questionNumber || '').match(/[1-5]/)?.[0];
    return PSI_FORM_QUESTIONS.find((question) => question.questionNumber === normalized);
};

export const getPsiQuestionLabel = (questionNumber: unknown): { title: string; subtitle: string } => {
    const definition = getPsiQuestionDefinition(questionNumber);
    return definition
        ? { title: definition.title, subtitle: definition.subtitle }
        : { title: `문항 ${String(questionNumber || '').trim() || '-'}`, subtitle: '위험성평가 기록지 문항별 원문과 해석을 대조합니다.' };
};

export const PSI_FORM_MASTER_PROMPT_BLOCK = [
    `[PSI 기록지 기준데이터 ${PSI_FORM_MASTER_VERSION}]`,
    `- 표준 공종: ${PSI_STANDARD_JOB_FIELDS.join(', ')}`,
    '- jobField는 기록지 하단 "공종" 칸의 값만 사용한다. Q1 답변은 jobField를 대체하지 않는다.',
    ...PSI_FORM_QUESTIONS.map((question) => (
        `- ${question.key}: ${question.workerIntent} 분석 역할: ${question.analysisRole}`
    )),
    `- 위험유형 표준분류: ${PSI_RISK_TYPE_CATALOG.map((risk) => risk.label).join(', ')}`,
    `- 감소대책 우선순서: ${PSI_CONTROL_ORDER.join(' → ')}`,
    '- Q4 대책은 Q2 위험요인과 연결되어야 하며, Q5는 Q4를 개인 실천행동으로 바꾼 문장이어야 한다.',
    '- 반복위반 패널티는 이번 한 장의 기록지 문구 반복이 아니라 다음 달 추적에서 동일 위험 재발·약속 미이행이 확인될 때만 적용한다.',
].join('\n');

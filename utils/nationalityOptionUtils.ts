export const STANDARD_NATIONALITY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '대한민국', label: '대한민국 (한국)' },
  { value: '중국', label: '중국 (China)' },
  { value: '베트남', label: '베트남 (Vietnam)' },
  { value: '태국', label: '태국 (Thailand)' },
  { value: '캄보디아', label: '캄보디아 (Cambodia)' },
  { value: '인도네시아', label: '인도네시아 (Indonesia)' },
  { value: '우즈베키스탄', label: '우즈베키스탄 (Uzbekistan)' },
  { value: '몽골', label: '몽골 (Mongolia)' },
  { value: '카자흐스탄', label: '카자흐스탄 (Kazakhstan)' },
  { value: '러시아', label: '러시아 (Russia)' },
  { value: '필리핀', label: '필리핀 (Philippines)' },
  { value: '네팔', label: '네팔 (Nepal)' },
  { value: '미얀마', label: '미얀마 (Myanmar)' },
];

const KOREAN_NATIONALITY_ALIASES = new Set([
  '한국',
  '대한민국',
  '내국인',
  'korea',
  'south korea',
  'republic of korea',
  'kr',
  'kor',
]);

/**
 * 상세 모달 국적 선택창이 OCR 표준값('대한민국') 및 과거 입력('한국')을 일관되게 매칭하도록 정규화합니다.
 */
export function normalizeNationalitySelectValue(raw: unknown): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '대한민국';
  if (KOREAN_NATIONALITY_ALIASES.has(trimmed.toLowerCase())) {
    return '대한민국';
  }
  return trimmed;
}

export function isStandardNationalityOption(value: string): boolean {
  return STANDARD_NATIONALITY_OPTIONS.some((option) => option.value === value);
}

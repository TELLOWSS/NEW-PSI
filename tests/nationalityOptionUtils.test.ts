import { describe, expect, it } from 'vitest';
import {
  isStandardNationalityOption,
  normalizeNationalitySelectValue,
  STANDARD_NATIONALITY_OPTIONS,
} from '../utils/nationalityOptionUtils';

describe('nationalityOptionUtils', () => {
  it('maps Korean aliases and canonical value consistently to 대한민국', () => {
    expect(normalizeNationalitySelectValue('대한민국')).toBe('대한민국');
    expect(normalizeNationalitySelectValue('한국')).toBe('대한민국');
    expect(normalizeNationalitySelectValue('Korea')).toBe('대한민국');
    expect(normalizeNationalitySelectValue('South Korea')).toBe('대한민국');
    expect(normalizeNationalitySelectValue('KR')).toBe('대한민국');
    expect(normalizeNationalitySelectValue('')).toBe('대한민국');
  });

  it('preserves standard non-Korean and custom nationality values', () => {
    expect(normalizeNationalitySelectValue('베트남')).toBe('베트남');
    expect(isStandardNationalityOption('베트남')).toBe(true);
    expect(isStandardNationalityOption('대한민국')).toBe(true);
    expect(isStandardNationalityOption('한국')).toBe(false);
    expect(normalizeNationalitySelectValue('방글라데시')).toBe('방글라데시');
    expect(isStandardNationalityOption('방글라데시')).toBe(false);
    expect(STANDARD_NATIONALITY_OPTIONS[0].value).toBe('대한민국');
  });
});

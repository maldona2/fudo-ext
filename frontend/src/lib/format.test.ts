import { describe, it, expect } from 'vitest';
import { formatDateTime, formatMoney, formatUnits } from './format';

describe('formatMoney', () => {
  it('uses Argentine thousands separators and drops empty cents', () => {
    expect(formatMoney(1138865.05)).toBe('$1.138.865,05');
    expect(formatMoney(1400)).toBe('$1.400');
  });

  it('shows the absolute value: the sign is told by the label', () => {
    expect(formatMoney(-700)).toBe('$700');
  });
});

describe('formatUnits', () => {
  it('shows up to three decimals with a comma', () => {
    expect(formatUnits(2)).toBe('2');
    expect(formatUnits(1.5)).toBe('1,5');
  });
});

describe('formatDateTime', () => {
  it('shows Argentine local time', () => {
    expect(formatDateTime('2026-10-22T10:50:00Z')).toBe('jue 22/10 07:50');
  });
});

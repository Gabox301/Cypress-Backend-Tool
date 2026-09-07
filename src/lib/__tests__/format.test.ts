import { formatSize, getDurationColor } from '$lib/utils/format';
import { describe, expect, it } from 'vitest';

describe('getDurationColor — threshold boundaries', () => {
  it('returns green below 300ms', () => {
    expect(getDurationColor(0)).toBe('#4ade80');
    expect(getDurationColor(1)).toBe('#4ade80');
    expect(getDurationColor(299)).toBe('#4ade80');
  });

  it('returns yellow at 300ms and up to 999ms', () => {
    expect(getDurationColor(300)).toBe('#facc15');
    expect(getDurationColor(500)).toBe('#facc15');
    expect(getDurationColor(999)).toBe('#facc15');
  });

  it('returns red at 1000ms and above', () => {
    expect(getDurationColor(1000)).toBe('#ef4444');
    expect(getDurationColor(1200)).toBe('#ef4444');
    expect(getDurationColor(5000)).toBe('#ef4444');
  });
});

describe('formatSize — byte boundaries', () => {
  it('returns bytes below 1KB', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('returns KB at 1024 and below 1MB', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1500)).toBe('1.5 KB');
    expect(formatSize(1048575)).toBe('1024.0 KB');
  });

  it('returns MB at 1MB and above', () => {
    expect(formatSize(1048576)).toBe('1.00 MB');
    expect(formatSize(2097152)).toBe('2.00 MB');
    expect(formatSize(10485760)).toBe('10.00 MB');
  });
});

export function getDurationColor(ms: number): string {
  if (ms < 300) return '#4ade80';
  if (ms < 1000) return '#facc15';
  return '#ef4444';
}

export function getDurationGlow(ms: number): string {
  if (ms < 300) return 'rgba(74,222,128,0.35)';
  if (ms < 1000) return 'rgba(250,204,21,0.35)';
  return 'rgba(239,68,68,0.35)';
}

export function getSizeColor(bytes: number): string {
  if (bytes < 1024 * 100) return '#4ade80';
  if (bytes < 1024 * 1024) return '#facc15';
  return '#ef4444';
}

export function getSizeGlow(bytes: number): string {
  if (bytes < 1024 * 100) return 'rgba(74,222,128,0.35)';
  if (bytes < 1024 * 1024) return 'rgba(250,204,21,0.35)';
  return 'rgba(239,68,68,0.35)';
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

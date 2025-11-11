export const lerp = (start: number, end: number, t: number) =>
  start + (end - start) * t;

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
